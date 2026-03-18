const crypto = require('crypto');
const db = require('../database/queries');
const logger = require('./logger');

/**
 * Generate a unique job ID from title + company + platform.
 */
function generateJobId(title, company, platform) {
  const raw = `${(title || '').toLowerCase().trim()}|${(company || '').toLowerCase().trim()}|${(platform || '').toLowerCase().trim()}`;
  return crypto.createHash('md5').update(raw).digest('hex');
}

/**
 * Filter out jobs that have already been sent.
 * Returns only new, unsent jobs.
 */
async function deduplicateJobs(jobs) {
  if (!jobs || jobs.length === 0) return [];

  const sentIds = await db.getSentJobIds();
  const seen = new Set();
  const unique = [];

  for (const job of jobs) {
    if (!job.jobId) {
      job.jobId = generateJobId(job.title, job.company, job.platform);
    }

    // Skip if already sent or seen in this batch
    if (sentIds.has(job.jobId) || seen.has(job.jobId)) {
      continue;
    }

    seen.add(job.jobId);
    unique.push(job);
  }

  const removed = jobs.length - unique.length;
  if (removed > 0) {
    logger.info(`Deduplication: removed ${removed} duplicate/already-sent jobs`);
  }

  return unique;
}

module.exports = { generateJobId, deduplicateJobs };
