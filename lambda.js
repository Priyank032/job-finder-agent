/**
 * AWS Lambda handlers for the Job Finder Agent.
 * EventBridge (CloudWatch) triggers these on schedule.
 */
require('dotenv').config();
const { connectDB, disconnectDB } = require('./src/database/schema');
const logger = require('./src/utils/logger');

// Lazy-load heavy modules only when needed
let runAgentFn = null;
async function getRunAgent() {
  if (!runAgentFn) {
    const { runAgent } = require('./index');
    runAgentFn = runAgent;
  }
  return runAgentFn;
}

/**
 * Daily scheduled run (7 AM IST, Mon-Sat)
 */
module.exports.dailyRun = async (event) => {
  const startTime = Date.now();
  logger.info('Lambda: Daily run triggered by EventBridge');

  try {
    await connectDB();
    const runAgent = await getRunAgent();
    await runAgent();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Lambda: Daily run completed in ${duration}s`);

    return { statusCode: 200, body: JSON.stringify({ message: 'Daily run complete', duration }) };
  } catch (error) {
    logger.error(`Lambda: Daily run failed - ${error.message}`);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  } finally {
    await disconnectDB();
  }
};

/**
 * Weekly summary (Monday 7:30 AM IST)
 */
module.exports.weeklySummary = async (event) => {
  logger.info('Lambda: Weekly summary triggered');

  try {
    await connectDB();
    const db = require('./src/database/queries');
    const { sendWeeklySummary } = require('./src/notifications/email');
    const { getWeekStart, getWeekEnd } = require('./src/utils/dateHelper');

    const weekStart = getWeekStart();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekEnd = getWeekEnd();
    weekEnd.setDate(weekEnd.getDate() - 7);

    const stats = await db.getWeeklyStats(weekStart, weekEnd);
    await sendWeeklySummary(stats);

    logger.info('Lambda: Weekly summary sent');
    return { statusCode: 200, body: JSON.stringify({ message: 'Weekly summary sent', stats }) };
  } catch (error) {
    logger.error(`Lambda: Weekly summary failed - ${error.message}`);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  } finally {
    await disconnectDB();
  }
};

/**
 * Manual trigger via API Gateway POST /run
 */
module.exports.manualRun = async (event) => {
  logger.info('Lambda: Manual run triggered via API');

  try {
    await connectDB();
    const runAgent = await getRunAgent();
    await runAgent();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Manual run complete' }),
    };
  } catch (error) {
    logger.error(`Lambda: Manual run failed - ${error.message}`);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message }),
    };
  } finally {
    await disconnectDB();
  }
};
