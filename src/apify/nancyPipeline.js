/**
 * Manual job pipeline for Nancy Agrawal (Google Sheet delivery).
 *
 * COMPLETELY SEPARATE from Priyank's two jobs. Different roles, different city
 * (Gwalior + Remote), different Apify token, different sheet. NO schedule -
 * run it by hand whenever you want fresh jobs:  npm run nancy-run
 *
 * Nancy's profile (from her resume): 4+ yrs in HR operations, office admin, and
 * computer/data operations. So we target HR / Computer-Data-Operator / Admin
 * roles, we do NOT cap years of experience, and we do NOT apply Priyank's
 * software over-level / off-lane title blocking (irrelevant to her).
 *
 * Env vars (kept separate from Priyank's so nothing collides):
 *   NANCY_APIFY_TOKEN   Apify API token for Nancy's runs
 *   NANCY_SHEET_ID      target spreadsheet ID (share it with the SA email)
 *   GOOGLE_SA_JSON      raw JSON of the service-account key, OR
 *   GOOGLE_SA_JSON_PATH path to a service-account JSON key file
 */

const fs = require('fs');
const { ApifyClient } = require('apify-client');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { applyHttpsFetch } = require('./httpsFetch');
const logger = require('../utils/logger');

// --------------------------------------------------------------------------- //
// Config - tune freely
// --------------------------------------------------------------------------- //
const ACTOR_ID = 'cheap_scraper/linkedin-job-scraper';

const MIN_MATCH = 0;   // no keyword-score floor - keep everything the search returns
                       // (Gwalior is a small market; don't over-filter)

// Only keep jobs located in Gwalior, or remote / work-from-home postings.
const LOCATION_ALLOW = /\b(gwalior|remote|work\s*from\s*home|wfh|anywhere)\b/i;

const SCRAPER_INPUT = {
  keyword: [
    // HR
    'HR Executive', 'HR Recruiter', 'HR Generalist', 'Human Resources',
    // Computer / Data operator
    'Computer Operator', 'Data Entry Operator', 'Back Office Executive', 'MIS Executive',
    // Admin / Office
    'Office Administrator', 'Admin Executive', 'Operations Executive',
  ],
  // Gwalior-focused so the 150-item budget isn't wasted on nationwide jobs.
  // "India" as a location for remote roles is handled via the Remote entry.
  locations: ['Gwalior, India', 'Gwalior, Madhya Pradesh, India'],
  workType: ['on-site', 'hybrid', 'remote'],
  experienceLevel: ['entry-level', 'associate', 'mid-senior'],
  publishedAt: 'r604800',   // last 7 days - Gwalior posts less often than metros
  saveOnlyUniqueItems: true,
  enrichCompanyData: false,
  maxItems: 150,
  resumeKeywords: [
    { keyword: 'HR', aliases: ['Human Resources', 'Recruitment', 'Onboarding', 'Payroll'] },
    { keyword: 'Data Entry', aliases: ['Computer Operator', 'Back Office', 'MIS', 'Data Operator'] },
    { keyword: 'Excel', aliases: ['MS Excel', 'Pivot Table', 'VLOOKUP', 'Macros'] },
    { keyword: 'Accounts', aliases: ['Tally', 'GST', 'TDS', 'Billing', 'Bookkeeping', 'Reconciliation'] },
    { keyword: 'Admin', aliases: ['Administration', 'Office', 'Coordinator', 'Operations'] },
  ],
};

// Column order the sheet uses - must match exactly on append.
const HEADER = [
  'Match %', 'Job Title', 'Company', 'Location', 'Experience',
  'Posted', 'Salary (est.)', 'Matched Skills', 'Apply Link', 'Job ID', 'Date Added',
];

/** True if the job is in Gwalior or is remote/WFH. */
function isGwaliorOrRemote(job) {
  const loc = `${job.location || ''} ${job.workType || ''}`;
  return LOCATION_ALLOW.test(loc);
}

// --------------------------------------------------------------------------- //
// Apify
// --------------------------------------------------------------------------- //
async function runScraper() {
  const token = process.env.NANCY_APIFY_TOKEN;
  if (!token) throw new Error('Missing env var: NANCY_APIFY_TOKEN');

  const client = new ApifyClient({ token });
  logger.info(`[nancy] Starting Apify actor ${ACTOR_ID} ...`);
  const run = await client.actor(ACTOR_ID).call(SCRAPER_INPUT);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  logger.info(`[nancy] Scraped ${items.length} raw jobs.`);
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
  // Read lazily (after dotenv has populated env), not at module load.
  const SHEET_ID = process.env.NANCY_SHEET_ID || '';
  if (!SHEET_ID) throw new Error('Missing env var: NANCY_SHEET_ID (create a sheet, share it with the SA email, set its ID)');

  const sa = loadServiceAccount();
  const jwt = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  applyHttpsFetch(jwt); // native-https auth (see httpsFetch.js)

  const doc = new GoogleSpreadsheet(SHEET_ID, jwt);
  await doc.loadInfo();
  const ws = doc.sheetsByIndex[0];

  // Reconcile header row to HEADER without touching data rows below.
  let current = null;
  try {
    await ws.loadHeaderRow();
    current = ws.headerValues || [];
  } catch (_) {
    current = [];
  }
  const matches = current.length === HEADER.length && HEADER.every((h, i) => current[i] === h);
  if (!matches) {
    if (ws.columnCount < HEADER.length) {
      await ws.resize({ rowCount: ws.rowCount, columnCount: HEADER.length });
    }
    logger.info(`[nancy] Aligning header (${current.length} -> ${HEADER.length} cols). Existing rows preserved.`);
    await ws.setHeaderRow(HEADER);
  }
  return ws;
}

/** Job IDs already in the sheet - cross-run dedup. */
async function existingJobIds(ws) {
  const rows = await ws.getRows();
  const seen = new Set();
  for (const row of rows) {
    const id = row.get('Job ID');
    if (id) seen.add(String(id).trim());
  }
  return seen;
}

/** Today's date in IST (YYYY-MM-DD). */
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
async function runNancyPipeline() {
  const startTime = Date.now();
  const items = await runScraper();

  // Filter: Gwalior-or-remote, plus an optional score floor (0 by default).
  const filtered = items.filter(
    (j) => (j.keywordMatchScorePercentage || 0) >= MIN_MATCH && isGwaliorOrRemote(j)
  );
  const dropped = items.length - filtered.length;
  logger.info(`[nancy] Kept ${filtered.length} after filter (dropped ${dropped}: not Gwalior/remote).`);

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
    logger.info(`[nancy] Appended ${newRows.length} new jobs to the sheet.`);
  } else {
    logger.info('[nancy] No new jobs this run.');
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`[nancy] Done in ${duration}s.`);
  return { scraped: items.length, kept: filtered.length, appended: newRows.length };
}

module.exports = { runNancyPipeline, isGwaliorOrRemote, toRow, HEADER };

// Run directly: `node src/apify/nancyPipeline.js`  (or `npm run nancy-run`)
if (require.main === module) {
  require('dotenv').config();
  runNancyPipeline()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error(`[nancy] Pipeline failed: ${err.message}`);
      process.exit(1);
    });
}
