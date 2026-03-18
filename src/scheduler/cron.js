const cron = require('node-cron');
const config = require('../../config');
const logger = require('../utils/logger');
const { isMonday, isSunday, formatDate, getWeekStart, getWeekEnd } = require('../utils/dateHelper');
const { sendWeeklySummary } = require('../notifications/email');
const db = require('../database/queries');

/**
 * Start the cron scheduler.
 * Accepts runAgent as a parameter to avoid circular dependency.
 */
function startScheduler(runAgent) {
  logger.info(`Scheduler started with cron: ${config.scheduleCron}`);
  logger.info(`Next run will be at 7:00 AM (Mon-Sat only, no Sunday)`);

  // Main job finder cron
  cron.schedule(config.scheduleCron, async () => {
    logger.info(`=== Scheduled run triggered: ${formatDate()} ===`);

    if (isSunday()) {
      logger.info('Sunday detected - skipping run');
      return;
    }

    if (isMonday()) {
      logger.info('Monday detected - fetching Saturday + Sunday jobs (72h window)');
    }

    try {
      await runAgent();
    } catch (error) {
      logger.error(`Scheduled run failed: ${error.message}`);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  // Weekly summary every Monday at 7:30 AM
  cron.schedule('30 7 * * 1', async () => {
    try {
      logger.info('Sending weekly summary...');
      const weekStart = getWeekStart();
      weekStart.setDate(weekStart.getDate() - 7);
      const weekEnd = getWeekEnd();
      weekEnd.setDate(weekEnd.getDate() - 7);

      const stats = await db.getWeeklyStats(weekStart, weekEnd);
      await sendWeeklySummary(stats);
    } catch (error) {
      logger.error(`Weekly summary failed: ${error.message}`);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  logger.info('Cron jobs registered:');
  logger.info(`  - Daily job finder: ${config.scheduleCron} (IST)`);
  logger.info('  - Weekly summary: 30 7 * * 1 (Monday 7:30 AM IST)');
}

module.exports = { startScheduler };
