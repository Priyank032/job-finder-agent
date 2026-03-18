const { scrapeJobs, Site, Country } = require('ts-jobspy');
const config = require('../../config');
const logger = require('../utils/logger');
const { generateJobId } = require('../utils/deduplicator');
const { isMonday, isWithinWindow } = require('../utils/dateHelper');

// Map our config platform names to ts-jobspy Site enum
const SITE_MAP = {
  linkedin: Site.LINKEDIN,
  indeed: Site.INDEED,
  glassdoor: Site.GLASSDOOR,
  google: Site.GOOGLE,
  naukri: Site.NAUKRI,
};

/**
 * Scrape jobs using ts-jobspy (handles anti-bot, proxies, etc.)
 * This replaces the individual LinkedIn, Indeed, Glassdoor, Naukri, and Google scrapers.
 */
async function scrapeWithJobSpy(searchQuery, location) {
  // Determine which sites to scrape based on config
  const enabledSites = [];
  for (const [configKey, siteEnum] of Object.entries(SITE_MAP)) {
    if (config.platforms[configKey] !== false) {
      enabledSites.push(siteEnum);
    }
  }

  if (enabledSites.length === 0) {
    logger.warn('JobSpy: No sites enabled');
    return { jobs: [], platformResults: {} };
  }

  const queries = searchQuery.split(',').map(q => q.trim()).slice(0, 5); // limit queries
  const hoursOld = isMonday() ? 72 : 24;
  const allJobs = [];
  const platformResults = {};
  const errors = {};

  for (const query of queries) {
    try {
      logger.info(`JobSpy: Searching "${query}" on ${enabledSites.join(', ')}...`);

      const results = await scrapeJobs({
        siteNames: enabledSites,
        searchTerm: query,
        location: location || 'India',
        resultsWanted: 15, // per site per query
        hoursOld,
        countryIndeed: Country.INDIA,
        isRemote: location?.toLowerCase().includes('remote') || false,
      });

      if (results && results.length > 0) {
        for (const job of results) {
          const platform = job.site || 'unknown';
          const normalized = normalizeJob(job, platform);
          if (normalized) {
            allJobs.push(normalized);
            platformResults[platform] = (platformResults[platform] || 0) + 1;
          }
        }
      }

      // Small delay between queries to be respectful
      await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
      logger.warn(`JobSpy: Error for "${query}": ${error.message}`);
      errors[query] = error.message;
    }
  }

  // Log per-platform results
  for (const [platform, count] of Object.entries(platformResults)) {
    logger.platform(platform, count);
  }

  return { jobs: allJobs, platformResults, errors };
}

/**
 * Normalize a ts-jobspy job result into our standard job format
 */
function normalizeJob(job, platform) {
  const title = job.title || '';
  const company = job.companyName || job.company || '';

  if (!title || !company) return null;

  // Extract HR email from description if present
  let hrEmail = '';
  const description = job.description || '';
  const emailMatch = description.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
  if (emailMatch) {
    hrEmail = emailMatch.find(e =>
      !e.includes('noreply') && !e.includes('info@') &&
      !e.includes('support@') && !e.includes('example')
    ) || '';
  }

  return {
    jobId: generateJobId(title, company, platform),
    title: title.trim(),
    company: company.trim(),
    location: job.location || job.city || '',
    salary: formatSalary(job),
    experienceRequired: '',
    skillsRequired: extractSkillsFromDescription(description),
    jobDescription: description.substring(0, 3000),
    applyUrl: job.jobUrl || job.jobUrlDirect || '',
    platform,
    postedDate: job.datePosted ? new Date(job.datePosted) : null,
    hrEmail,
    hrName: '',
    hrLinkedinProfile: '',
    postLink: job.jobUrl || '',
    matchScore: null,
    matchReason: null,
  };
}

function formatSalary(job) {
  if (job.minAmount && job.maxAmount) {
    const currency = job.currency || '$';
    return `${currency}${job.minAmount.toLocaleString()} - ${currency}${job.maxAmount.toLocaleString()}`;
  }
  if (job.minAmount) return `${job.currency || '$'}${job.minAmount.toLocaleString()}+`;
  return '';
}

function extractSkillsFromDescription(description) {
  if (!description) return [];
  const skills = [];
  const keywords = [
    'JavaScript', 'TypeScript', 'React', 'Angular', 'Vue', 'Node.js',
    'Python', 'Java', 'C++', 'Go', 'Rust', 'Ruby', 'PHP',
    'SQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'Redis',
    'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Git',
    'REST', 'GraphQL', 'Next.js', 'Express', 'Django', 'Flask',
    'LangChain', 'LLM', 'RAG', 'NLP', 'Machine Learning',
    'FastAPI', 'Nest.js', 'TailwindCSS', 'CI/CD',
  ];
  const descLower = description.toLowerCase();
  for (const kw of keywords) {
    if (descLower.includes(kw.toLowerCase())) {
      skills.push(kw);
    }
  }
  return skills;
}

module.exports = { scrapeWithJobSpy, SITE_MAP };
