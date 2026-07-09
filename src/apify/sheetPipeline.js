/**
 * Daily AI/LLM job pipeline (Google Sheet delivery).
 *
 * SELF-CONTAINED and independent of the main email/WhatsApp agent:
 *   - No MongoDB. The Google Sheet IS the dedup source of truth.
 *   - No resume parsing / AI matching. Apify's own resumeKeywords scorer
 *     produces keywordMatchScorePercentage; we filter on that.
 *
 * Flow:
 *   1. Trigger the Apify Actor (cheap_scraper/linkedin-job-scraper) for the
 *      last 24h of postings, read its dataset.
 *   2. Post-filter (Option B): drop low match scores, over-level TITLES, and
 *      parse each DESCRIPTION for a years-of-experience floor -> drop >= MAX_YEARS.
 *   3. Dedup against Job IDs already in the sheet.
 *   4. Append the survivors (highest match first) to the sheet.
 *
 * Env vars:
 *   APIFY_TOKEN                 Apify API token
 *   GOOGLE_SA_JSON              raw JSON of the service-account key, OR
 *   GOOGLE_SA_JSON_PATH         path to a service-account JSON key file
 *   JOB_SHEET_ID                target spreadsheet ID (has a sensible default)
 */

const fs = require('fs');
const { ApifyClient } = require('apify-client');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { applyHttpsFetch } = require('./httpsFetch');
const logger = require('../utils/logger');

// --------------------------------------------------------------------------- //
// Config - tune these freely
// --------------------------------------------------------------------------- //
const SHEET_ID = process.env.JOB_SHEET_ID || '1Pht8ULtIbQQiSmi7oizuGC3MYMU8WV79chBYoEK5D-U';
const ACTOR_ID = 'cheap_scraper/linkedin-job-scraper';

const MAX_YEARS = 6;   // drop jobs whose MINIMUM required experience is >= this
const MIN_MATCH = 40;  // drop jobs whose resume-match score is below this (0-100)

// Titles unambiguously above a mid-level IC role. "Senior" is intentionally
// left OUT - in India it's often applied to 4-5yr roles, and the years-parse
// will catch the genuinely-senior ones.
const TITLE_BLOCK = /\b(lead|principal|staff|architect|manager|director|vp|head\s+of|vice\s+president)\b/i;

const SCRAPER_INPUT = {
  keyword: ['AI Engineer', 'LLM Engineer', 'Backend Developer'],
  locations: [
    'Delhi, India', 'Noida, India', 'Gurugram, India',
    'Indore, India', 'India',
  ],
  workType: ['remote', 'hybrid', 'on-site'],
  experienceLevel: ['associate', 'mid-senior'],
  publishedAt: 'r86400', // last 24h - the daily window
  saveOnlyUniqueItems: true,
  enrichCompanyData: false,
  maxItems: 150,
  resumeKeywords: [
    { keyword: 'LangChain', aliases: ['LangGraph', 'LangSmith'] },
    { keyword: 'LLM', aliases: ['Large Language Model', 'GenAI', 'Generative AI'] },
    { keyword: 'RAG', aliases: ['Retrieval Augmented Generation', 'vector database'] },
    { keyword: 'AWS Bedrock', aliases: ['Bedrock'] },
    { keyword: 'Multi-Agent', aliases: ['Agentic', 'AI Agents', 'agent'] },
    { keyword: 'Python', aliases: ['FastAPI'] },
    { keyword: 'Node.js', aliases: ['Node', 'NodeJS', 'Express'] },
    { keyword: 'TypeScript', aliases: ['TS', 'JavaScript', 'JS'] },
    { keyword: 'AWS', aliases: ['Lambda', 'ECS', 'Fargate', 'EC2'] },
    { keyword: 'MongoDB', aliases: ['PostgreSQL', 'SQL', 'Redis'] },
  ],
};

// Column order the sheet uses - must match exactly on append.
// NOTE: the live sheet's salary column is labelled "Salary (est.)" and the
// "Job ID" column is appended (11th) so we have a stable cross-day dedup key.
const HEADER = [
  'Match %', 'Job Title', 'Company', 'Location', 'Experience',
  'Posted', 'Salary (est.)', 'Matched Skills', 'Apply Link', 'Job ID', 'Date Added',
];

// --------------------------------------------------------------------------- //
// Years-of-experience parser
// --------------------------------------------------------------------------- //
// Matches phrasings like:
//   "7+ years", "7 to 8 years", "6-8 yrs", "minimum 6 years",
//   "at least 7 years", "5 years of experience"
// Note: patterns use the /g flag so we can walk every match in the text.
const YEAR_PATTERNS = [
  /(\d{1,2})\s*(?:\+|plus)\s*(?:years?|yrs?)/gi,
  /(\d{1,2})\s*(?:-|to|–)\s*\d{1,2}\s*(?:years?|yrs?)/gi,
  /(?:minimum|min|at\s+least|atleast)\s*(?:of\s*)?(\d{1,2})\s*(?:years?|yrs?)/gi,
  /(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/gi,
];

/** Return the smallest 'minimum years' figure mentioned, or null. */
function requiredYears(text) {
  if (!text) return null;
  const mins = [];
  for (const pat of YEAR_PATTERNS) {
    pat.lastIndex = 0; // reset stateful /g regex between calls
    let m;
    while ((m = pat.exec(text)) !== null) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) mins.push(n);
    }
  }
  // A description may list several ranges; the smallest floor is the true entry bar.
  return mins.length ? Math.min(...mins) : null;
}

/** True if the job looks mid-level (< MAX_YEARS) and not an over-level title. */
function isMidLevel(job) {
  const title = job.jobTitle || '';
  if (TITLE_BLOCK.test(title)) return false;

  const yrs = requiredYears(job.jobDescription || '');
  if (yrs !== null && yrs >= MAX_YEARS) return false; // e.g. "7 to 8 years" -> 7 -> dropped

  return true;
}

// --------------------------------------------------------------------------- //
// Apify
// --------------------------------------------------------------------------- //
async function runScraper() {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('Missing env var: APIFY_TOKEN');

  const client = new ApifyClient({ token });
  logger.info(`[sheet] Starting Apify actor ${ACTOR_ID} ...`);
  const run = await client.actor(ACTOR_ID).call(SCRAPER_INPUT);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  logger.info(`[sheet] Scraped ${items.length} raw jobs.`);
  return items;
}

// --------------------------------------------------------------------------- //
// Google Sheet
// --------------------------------------------------------------------------- //
/** Load service-account credentials from raw JSON env or a key-file path. */
function loadServiceAccount() {
  const raw = process.env.GOOGLE_SA_JSON;
  if (raw && raw.trim().startsWith('{')) {
    return JSON.parse(raw);
  }
  const path = process.env.GOOGLE_SA_JSON_PATH || process.env.GOOGLE_SA_JSON;
  if (path && fs.existsSync(path)) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  }
  throw new Error('Missing Google service account: set GOOGLE_SA_JSON (raw JSON) or GOOGLE_SA_JSON_PATH (file path)');
}

async function openSheet() {
  const sa = loadServiceAccount();
  const jwt = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  // Route auth through native https (undici drops the token stream on some
  // Windows/Node 24 setups -> "Premature close"). See httpsFetch.js.
  applyHttpsFetch(jwt);

  const doc = new GoogleSpreadsheet(SHEET_ID, jwt);
  await doc.loadInfo();
  const ws = doc.sheetsByIndex[0];

  // Reconcile the header row to HEADER. loadHeaderRow throws if row 1 is empty.
  // This aligns a sheet that predates the "Job ID" column (or used the plain
  // "Salary" label) WITHOUT touching the data rows below - setHeaderRow only
  // rewrites row 1's labels.
  let current = null;
  try {
    await ws.loadHeaderRow();
    current = ws.headerValues || [];
  } catch (_) {
    current = [];
  }

  const matches =
    current.length === HEADER.length &&
    HEADER.every((h, i) => current[i] === h);

  if (!matches) {
    // Make sure the grid is wide enough for the (possibly new) columns.
    if (ws.columnCount < HEADER.length) {
      await ws.resize({ rowCount: ws.rowCount, columnCount: HEADER.length });
    }
    logger.info(
      `[sheet] Aligning header (${current.length} -> ${HEADER.length} cols). ` +
      'Existing data rows are preserved.'
    );
    await ws.setHeaderRow(HEADER);
  }
  return ws;
}

/** Job IDs already in the sheet - used for cross-day dedup. */
async function existingJobIds(ws) {
  const rows = await ws.getRows();
  const seen = new Set();
  for (const row of rows) {
    const id = row.get('Job ID');
    if (id) seen.add(String(id).trim());
  }
  return seen;
}

/** Today's date in IST (YYYY-MM-DD), independent of the Lambda's UTC clock. */
function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function toRow(job, today) {
  const sinfo = job.salaryInfo || [];
  const salary = Array.isArray(sinfo) ? sinfo.map((s) => String(s)).join(' - ') : String(sinfo || '');
  return {
    'Match %': job.keywordMatchScorePercentage ?? '',
    'Job Title': job.jobTitle || '',
    Company: job.companyName || '',
    Location: job.location || '',
    Experience: job.experienceLevel || '',
    Posted: job.postedTime || '',
    'Salary (est.)': salary,
    'Matched Skills': (job.matchedKeywords || []).join(', '),
    'Apply Link': job.jobUrl || '',
    'Job ID': String(job.jobId ?? ''),
    'Date Added': today,
  };
}

// --------------------------------------------------------------------------- //
// Main
// --------------------------------------------------------------------------- //
async function runSheetPipeline() {
  const startTime = Date.now();
  const items = await runScraper();

  // Score floor + mid-level post-filter (this is Option B).
  const filtered = items.filter(
    (j) => (j.keywordMatchScorePercentage || 0) >= MIN_MATCH && isMidLevel(j)
  );
  const dropped = items.length - filtered.length;
  logger.info(`[sheet] Kept ${filtered.length} after filter (dropped ${dropped}: senior/low-match).`);

  const ws = await openSheet();
  const seen = await existingJobIds(ws);

  const today = todayIST();
  const newRows = [];
  const addedIds = new Set();

  const sorted = [...filtered].sort(
    (a, b) => (b.keywordMatchScorePercentage || 0) - (a.keywordMatchScorePercentage || 0)
  );

  for (const j of sorted) {
    const jid = String(j.jobId ?? '');
    if (jid && (seen.has(jid) || addedIds.has(jid))) continue;
    newRows.push(toRow(j, today));
    if (jid) addedIds.add(jid);
  }

  if (newRows.length) {
    await ws.addRows(newRows, { insert: false, raw: false });
    logger.info(`[sheet] Appended ${newRows.length} new jobs to the sheet.`);
  } else {
    logger.info('[sheet] No new jobs today.');
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`[sheet] Done in ${duration}s.`);
  return { scraped: items.length, kept: filtered.length, appended: newRows.length };
}

module.exports = { runSheetPipeline, requiredYears, isMidLevel, toRow, HEADER };

// Run directly for local testing: `node src/apify/sheetPipeline.js`
if (require.main === module) {
  require('dotenv').config();
  runSheetPipeline()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error(`[sheet] Pipeline failed: ${err.message}`);
      process.exit(1);
    });
}
