const config = require('../../config');
const logger = require('../utils/logger');
const { scrapeWithJobSpy } = require('./jobspy');

// Supplementary scrapers (API-based, actually work without anti-bot issues)
const RemoteOKScraper = require('./remoteok');
const WeWorkRemotelyScraper = require('./weworkremotely');
const DiceScraper = require('./dice');
const UnstopScraper = require('./unstop');

// These are supplementary - only used if their platforms are enabled
const supplementaryScrapers = {
  remoteok: new RemoteOKScraper(),
  weworkremotely: new WeWorkRemotelyScraper(),
  dice: new DiceScraper(),
  unstop: new UnstopScraper(),
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
 * 1. PRIMARY: ts-jobspy handles LinkedIn, Indeed, Glassdoor, Google Jobs, Naukri
 *    (it manages anti-bot, proxies, browser emulation internally)
 * 2. SUPPLEMENTARY: API-based scrapers for RemoteOK, WeWorkRemotely, Dice, Unstop
 *    (these use public APIs/RSS feeds, no anti-bot issues)
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
  // Handles: LinkedIn, Indeed, Glassdoor, Google Jobs, Naukri
  logger.info('Running primary scrapers (ts-jobspy: LinkedIn, Indeed, Glassdoor, Google, Naukri)...');
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

  return { jobs: allJobs, platformResults, errors };
}

module.exports = { scrapeAll, generateSearchQueries };
