const { SentJob, JobCache, HrContact, RunLog, WeeklyStat } = require('./schema');
const logger = require('../utils/logger');

const db = {
  // ── Sent Jobs ───────────────────────────
  async isJobSent(jobId) {
    const exists = await SentJob.exists({ jobId });
    return !!exists;
  },

  async markJobSent(job) {
    try {
      await SentJob.create({
        jobId: job.jobId,
        title: job.title,
        company: job.company,
        platform: job.platform,
        applyUrl: job.applyUrl,
        matchScore: job.matchScore,
      });
    } catch (error) {
      if (error.code === 11000) return; // duplicate, ignore
      logger.error(`Failed to mark job sent: ${error.message}`);
    }
  },

  async markJobsSent(jobs) {
    const ops = jobs.map(job => ({
      updateOne: {
        filter: { jobId: job.jobId },
        update: {
          $setOnInsert: {
            jobId: job.jobId,
            title: job.title,
            company: job.company,
            platform: job.platform,
            applyUrl: job.applyUrl,
            matchScore: job.matchScore,
            sentDate: new Date(),
          },
        },
        upsert: true,
      },
    }));
    if (ops.length > 0) {
      await SentJob.bulkWrite(ops);
    }
  },

  async getSentJobIds() {
    const jobs = await SentJob.find({}, { jobId: 1, _id: 0 });
    return new Set(jobs.map(j => j.jobId));
  },

  // ── Job Cache ───────────────────────────
  async cacheJobs(jobs) {
    const ops = jobs.map(job => ({
      updateOne: {
        filter: { jobId: job.jobId },
        update: { $set: { ...job, scrapedAt: new Date() } },
        upsert: true,
      },
    }));
    if (ops.length > 0) {
      await JobCache.bulkWrite(ops);
    }
  },

  async getCachedJob(jobId) {
    return JobCache.findOne({ jobId });
  },

  // ── HR Contacts ─────────────────────────
  async saveHrContact(contact) {
    try {
      await HrContact.updateOne(
        { email: contact.email, company: contact.company },
        { $set: contact },
        { upsert: true }
      );
    } catch (error) {
      logger.error(`Failed to save HR contact: ${error.message}`);
    }
  },

  async getUncontactedHr() {
    return HrContact.find({ emailed: false });
  },

  async markHrEmailed(email) {
    await HrContact.updateOne({ email }, { $set: { emailed: true } });
  },

  // ── Run Logs ────────────────────────────
  async logRun(data) {
    return RunLog.create(data);
  },

  async getRecentRuns(limit = 10) {
    return RunLog.find().sort({ runDate: -1 }).limit(limit);
  },

  // ── Weekly Stats ────────────────────────
  async getWeeklyStats(weekStart, weekEnd) {
    const runs = await RunLog.find({
      runDate: { $gte: weekStart, $lte: weekEnd },
    });

    const stats = {
      totalJobsFound: 0,
      totalJobsMatched: 0,
      totalJobsSent: 0,
    };

    for (const run of runs) {
      stats.totalJobsFound += run.jobsFound || 0;
      stats.totalJobsMatched += run.jobsMatched || 0;
      stats.totalJobsSent += run.jobsSent || 0;
    }

    return stats;
  },

  async saveWeeklyStats(stats) {
    return WeeklyStat.create(stats);
  },

  // ── Cleanup ─────────────────────────────
  async cleanOldCache(daysOld = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const result = await JobCache.deleteMany({ scrapedAt: { $lt: cutoff } });
    logger.info(`Cleaned ${result.deletedCount} old cached jobs`);
  },
};

module.exports = db;
