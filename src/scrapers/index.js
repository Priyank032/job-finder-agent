const config = require('../../config');
const logger = require('../utils/logger');
const { scrapeWithJobSpy } = require('./jobspy');

// Platforms that are 100% remote — location listed is just company HQ
const REMOTE_ONLY_PLATFORMS = new Set(['remoteok', 'himalayas', 'arbeitnow']);

// Non-India country/region identifiers — if present alongside "remote", the job is geo-restricted
const NON_INDIA_GEO = [
  'usa', 'us-remote', 'united states', '- usa', '- us', 'america',
  'canada', 'can-remote', 'toronto', 'vancouver', 'british columbia', 'ontario',
  'uk', 'united kingdom', 'london', 'manchester',
  'germany', 'berlin', 'munich', 'france', 'paris',
  'australia', 'sydney', 'melbourne',
  'netherlands', 'amsterdam', 'denmark', 'copenhagen',
  'sweden', 'norway', 'finland', 'poland', 'spain', 'italy',
  'brazil', 'argentina', 'mexico', 'singapore', 'japan',
  '- eu', 'europe only', 'emea', 'latam',
  'new york', 'san francisco', 'seattle', 'chicago', 'boston',
  'remote - us', 'remote - ca', 'remote in us', 'remote in canada',
];

// Job titles that indicate levels clearly beyond 3 years of experience
const OVERLY_SENIOR_REGEX = /\b(staff engineer|staff software|principal engineer|principal software|distinguished engineer|vp of|vice president|director of engineering|engineering director|head of engineering|engineering manager|senior manager|senior director|cto|chief technology)\b/i;

// Experience requirement pattern in job description
const EXP_REQ_REGEX = /(\d+)\s*\+?\s*years?\s*(of\s*)?(experience|exp|work)/i;

/**
 * Returns true if the job location is acceptable:
 * - Remote-only platforms: always OK
 * - "remote" in location AND no non-India geo restriction: OK (worldwide remote)
 * - "remote" + non-India geo (e.g. "Remote - USA", "US-Remote"): REJECTED
 * - India or a preferred Indian city in location: OK
 * - Location unknown/empty: include (benefit of the doubt)
 * - Onsite outside India: rejected
 */
function isLocationOk(job) {
  if (REMOTE_ONLY_PLATFORMS.has(job.platform)) return true;

  const loc = (job.location || '').toLowerCase();

  if (!loc || loc.length < 2) return true; // unknown — include

  // Check if location is India-based first
  if (config.preferredIndiaCities.some(city => loc.includes(city))) return true;

  // Check for remote — but only if NOT geo-restricted to outside India
  if (loc.includes('remote') || loc.includes('work from home') || loc.includes('wfh')) {
    const isGeoRestricted = NON_INDIA_GEO.some(geo => loc.includes(geo));
    return !isGeoRestricted; // worldwide remote = OK, US-remote = rejected
  }

  return false;
}

/**
 * Returns true if the job seniority is reachable for a 3-year candidate.
 * Drops staff/principal/VP/director/manager titles before AI matching.
 */
function isSeniorityOk(job) {
  return !OVERLY_SENIOR_REGEX.test(job.title || '');
}

/**
 * Hard experience filter: drop jobs that explicitly require more than
 * candidate's experience + 1 year (buffer for "3-5 years" ranges).
 * Only fires when a clear number is found in the description.
 */
function isExperienceOk(job) {
  const candidateYears = config.experienceYears || 3;
  const maxAllowed = candidateYears + 1; // allow up to 4yr for a 3yr candidate

  const desc = (job.jobDescription || '') + ' ' + (job.title || '');
  const match = desc.match(EXP_REQ_REGEX);
  if (!match) return true; // no clear requirement found — include

  const required = parseInt(match[1]);
  return required <= maxAllowed;
}

// Supplementary scrapers (API-based, work without anti-bot issues)
const RemoteOKScraper = require('./remoteok');
const HimalayasScraper = require('./himalayas');
const ArbeitnowScraper = require('./arbeitnow');
const CutshortScraper = require('./cutshort');
const CareersScraper = require('./careers');

// These are supplementary - only used if their platforms are enabled
const supplementaryScrapers = {
  remoteok: new RemoteOKScraper(),
  himalayas: new HimalayasScraper(),
  arbeitnow: new ArbeitnowScraper(),
  cutshort: new CutshortScraper(),
  careers: new CareersScraper(),
};

/**
 * Generate smart search queries from resume and config.
 * Caps at 8 queries to avoid excessive scraping.
 */
function generateSearchQueries(resumeData) {
  const roles = config.targetRoles;
  const queries = new Set(roles);

  for (const role of roles) {
    const lower = role.toLowerCase();
    if (lower.includes('frontend')) queries.add('React Developer');
    if (lower.includes('backend')) queries.add('Node.js Developer');
    if (lower.includes('full stack')) {
      queries.add('Fullstack Developer');
      queries.add('MERN Developer');
    }
    if (lower.includes('software engineer')) {
      queries.add('Software Developer');
      queries.add('SDE');
    }
  }

  // Add skill-based queries only for clean, short skill names
  if (resumeData?.skills?.length > 0) {
    const skipSkills = new Set(['SQL', 'CSS', 'HTML', 'Git', 'Linux', 'Agile', 'Scrum',
      'Jira', 'Swagger', 'Jest', 'Pytest', 'Sass', 'Bootstrap', 'Figma', 'Nginx',
      'Stripe', 'Twilio', 'SendGrid', 'Agora', 'SSE', 'REST', 'REST APIs', 'gRPC',
      'GraphQL', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Dart', 'R']);
    const validSkills = resumeData.skills.filter(s =>
      s.length >= 2 && s.length <= 15 &&
      /^[A-Za-z0-9.#+\s-]+$/.test(s) &&
      !skipSkills.has(s)
    );
    for (const skill of validSkills.slice(0, 3)) {
      queries.add(`${skill} Developer`);
    }
  }

  return [...queries].slice(0, 8).join(', ');
}

/**
 * Run all scrapers and collect jobs.
 *
 * Strategy:
 * 1. PRIMARY: ts-jobspy handles LinkedIn, Indeed, Google Jobs
 * 2. SUPPLEMENTARY: API-based scrapers (RemoteOK, Himalayas, Arbeitnow, Cutshort)
 * 3. CAREERS: Company career pages via Greenhouse/Lever/TheMuse APIs (50+ companies)
 */
async function scrapeAll(resumeData) {
  const searchQuery = generateSearchQueries(resumeData);
  const location = config.targetLocations.join(', ');
  const allJobs = [];
  const platformResults = {};
  const errors = {};

  logger.info(`Search queries: ${searchQuery}`);
  logger.info(`Locations: ${location}`);

  // ── Step 1: Primary scraping via ts-jobspy ──────────────────
  logger.info('Running primary scrapers (ts-jobspy: LinkedIn, Indeed, Google Jobs)...');
  try {
    const jobspyResult = await scrapeWithJobSpy(searchQuery, location);
    allJobs.push(...jobspyResult.jobs);
    Object.assign(platformResults, jobspyResult.platformResults);
    if (jobspyResult.errors) Object.assign(errors, jobspyResult.errors);
  } catch (error) {
    logger.error(`ts-jobspy failed: ${error.message}`);
    errors.jobspy = error.message;
  }

  // ── Step 2: Supplementary API-based scrapers ────────────────
  const enabledSupplementary = Object.entries(supplementaryScrapers)
    .filter(([key]) => config.platforms[key] !== false);

  if (enabledSupplementary.length > 0) {
    logger.info(`Running ${enabledSupplementary.length} supplementary scrapers...`);

    const results = await Promise.allSettled(
      enabledSupplementary.map(async ([key, scraper]) => {
        const jobs = await scraper.safeScrape(searchQuery, location);
        return { key, jobs };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { key, jobs } = result.value;
        platformResults[key] = jobs.length;
        allJobs.push(...jobs);
      } else {
        const idx = results.indexOf(result);
        const key = enabledSupplementary[idx]?.[0];
        errors[key] = result.reason?.message || 'Unknown error';
        logger.platformError(key, result.reason?.message);
      }
    }
  }

  logger.info(`Total jobs scraped: ${allJobs.length} from ${Object.keys(platformResults).length} platforms`);

  // ── Post-scrape filters ──────────────────────────────
  const beforeFilter = allJobs.length;

  const locationFiltered = allJobs.filter(job => {
    if (!isLocationOk(job)) {
      logger.debug(`Location filtered: "${job.title}" @ ${job.company} (${job.location})`);
      return false;
    }
    return true;
  });

  const seniorityFiltered = locationFiltered.filter(job => {
    if (!isSeniorityOk(job)) {
      logger.debug(`Seniority filtered: "${job.title}" @ ${job.company}`);
      return false;
    }
    return true;
  });

  const experienceFiltered = seniorityFiltered.filter(job => {
    if (!isExperienceOk(job)) {
      logger.debug(`Experience filtered: "${job.title}" @ ${job.company} (requires more than ${(config.experienceYears || 3) + 1} yrs)`);
      return false;
    }
    return true;
  });

  const locationDropped = beforeFilter - locationFiltered.length;
  const seniorityDropped = locationFiltered.length - seniorityFiltered.length;
  const expDropped = seniorityFiltered.length - experienceFiltered.length;
  logger.info(`Filters: -${locationDropped} geo-restricted, -${seniorityDropped} overly senior, -${expDropped} experience too high → ${experienceFiltered.length} jobs remaining`);

  return { jobs: experienceFiltered, platformResults, errors };
}

module.exports = { scrapeAll, generateSearchQueries };
