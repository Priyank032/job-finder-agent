/**
 * AWS Lambda handler for the daily AI/LLM job -> Google Sheet pipeline.
 *
 * Independent of the main email/WhatsApp agent (lambda.js): no MongoDB, no
 * resume parsing. EventBridge triggers `sheetDailyRun` on schedule; the sheet
 * is the dedup source of truth.
 */
require('dotenv').config();
const logger = require('./src/utils/logger');
const { runSheetPipeline } = require('./src/apify/sheetPipeline');

/**
 * Daily scheduled run (9 AM IST) - scrape via Apify, filter, append to sheet.
 */
module.exports.sheetDailyRun = async () => {
  const startTime = Date.now();
  logger.info('Lambda: Sheet daily run triggered by EventBridge');

  try {
    const result = await runSheetPipeline();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Lambda: Sheet daily run completed in ${duration}s`);
    return { statusCode: 200, body: JSON.stringify({ message: 'Sheet run complete', duration, ...result }) };
  } catch (error) {
    logger.error(`Lambda: Sheet daily run failed - ${error.message}`);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

/**
 * Manual trigger via API Gateway POST /run-sheet
 */
module.exports.sheetManualRun = async () => {
  logger.info('Lambda: Sheet manual run triggered via API');

  try {
    const result = await runSheetPipeline();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Sheet manual run complete', ...result }),
    };
  } catch (error) {
    logger.error(`Lambda: Sheet manual run failed - ${error.message}`);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
