const claude = require('./claude');
const gemini = require('./gemini');
const openai = require('./openai');
const config = require('../../config');
const logger = require('../utils/logger');

// AI provider fallback chain
const providers = [
  { name: 'Claude', module: claude },
  { name: 'Gemini', module: gemini },
  { name: 'OpenAI', module: openai },
];

/**
 * Get the first available AI provider
 */
function getProvider() {
  for (const provider of providers) {
    if (provider.module.isAvailable()) {
      return provider;
    }
  }
  return null;
}

/**
 * Match a single job with fallback chain
 */
async function matchSingleJob(resumeData, job) {
  for (const provider of providers) {
    if (!provider.module.isAvailable()) continue;

    try {
      const result = await provider.module.matchJob(resumeData, job);
      result._provider = provider.name;
      return result;
    } catch (error) {
      logger.warn(`${provider.name} matching failed: ${error.message}`);
      // Try next provider
    }
  }

  logger.error('All AI providers failed for job matching');
  return null;
}

/**
 * Match all jobs against resume with AI scoring.
 * Processes in batches to respect rate limits.
 */
async function matchJobs(resumeData, jobs) {
  const provider = getProvider();
  if (!provider) {
    logger.error('No AI provider available. Set at least one API key in .env');
    return [];
  }

  logger.info(`Using ${provider.name} for AI matching (${jobs.length} jobs to process)`);

  const matched = [];
  const batchSize = 5;   // 5 concurrent requests
  const delayMs = 2000;  // 2 sec between batches

  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(job => matchSingleJob(resumeData, job))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const job = batch[j];

      if (result.status === 'fulfilled' && result.value) {
        const matchData = result.value;
        job.matchScore = matchData.match_score;
        job.matchReason = matchData.match_reason;
        job.missingSkills = matchData.missing_skills || [];
        job.strengths = matchData.strengths || [];
        job.recommended = matchData.recommended;
        job.jobTypeFit = matchData.job_type_fit;
        job.coverLetterSnippet = matchData.cover_letter_snippet;
        job._aiProvider = matchData._provider;

        if (job.matchScore >= config.minMatchScore) {
          matched.push(job);
        }
      } else {
        logger.warn(`Failed to match job: ${job.title} at ${job.company}`);
      }
    }

    // Rate limit delay between batches
    if (i + batchSize < jobs.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // Progress log
    const processed = Math.min(i + batchSize, jobs.length);
    logger.info(`AI matching progress: ${processed}/${jobs.length} jobs processed, ${matched.length} matched so far`);
  }

  // Sort by match score descending
  matched.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  // Limit to max per day
  const limited = matched.slice(0, config.maxJobsPerDay);

  logger.info(`AI matching complete: ${matched.length} jobs scored >= ${config.minMatchScore}, sending top ${limited.length}`);

  return limited;
}

module.exports = { matchJobs, matchSingleJob, getProvider };
