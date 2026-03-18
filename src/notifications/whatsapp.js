const config = require('../../config');
const logger = require('../utils/logger');
const { formatDate } = require('../utils/dateHelper');

let twilioClient = null;

function getClient() {
  if (!twilioClient && config.twilio.accountSid && config.twilio.authToken) {
    const twilio = require('twilio');
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
}

/**
 * Format jobs into a concise WhatsApp message
 */
function formatWhatsAppMessage(jobs, platformResults) {
  const topJobs = jobs.slice(0, 10); // Top 10 for WhatsApp (keep it short)
  const coldEmailJobs = jobs.filter(j => j.hrEmail).slice(0, 3);

  let msg = `*AI Job Finder Report*\n`;
  msg += `${formatDate()} | ${jobs.length} matches from ${Object.keys(platformResults).length} platforms\n\n`;

  // Top matches
  if (topJobs.length > 0) {
    msg += `*TOP MATCHES:*\n`;
    for (const job of topJobs) {
      msg += `\n${job.matchScore}% - *${job.title}*\n`;
      msg += `${job.company}${job.location ? ' | ' + job.location : ''}\n`;
      if (job.salary) msg += `${job.salary}\n`;
      if (job.applyUrl) msg += `Apply: ${job.applyUrl}\n`;
    }
  }

  // Cold email opportunities
  if (coldEmailJobs.length > 0) {
    msg += `\n*COLD EMAIL OPPORTUNITIES:*\n`;
    for (const job of coldEmailJobs) {
      msg += `\n${job.title} - ${job.company}\n`;
      if (job.hrName) msg += `HR: ${job.hrName}\n`;
      if (job.hrEmail) msg += `Email: ${job.hrEmail}\n`;
    }
  }

  msg += `\n_Check email for full report with apply links_`;

  // WhatsApp has a 1600 char limit
  if (msg.length > 1500) {
    msg = msg.substring(0, 1450) + '\n\n_...check email for full report_';
  }

  return msg;
}

/**
 * Send WhatsApp notification via Twilio
 */
async function sendWhatsAppNotification(jobs, platformResults) {
  const client = getClient();
  if (!client) {
    logger.warn('Twilio not configured, skipping WhatsApp notification');
    return false;
  }

  if (!config.twilio.whatsappTo) {
    logger.warn('Recipient WhatsApp number not set');
    return false;
  }

  const message = formatWhatsAppMessage(jobs, platformResults);

  try {
    await client.messages.create({
      body: message,
      from: config.twilio.whatsappFrom,
      to: config.twilio.whatsappTo,
    });

    logger.info(`WhatsApp notification sent to ${config.twilio.whatsappTo}`);
    return true;
  } catch (error) {
    logger.error(`WhatsApp send failed: ${error.message}`);
    return false;
  }
}

/**
 * Send a test WhatsApp message
 */
async function sendTestWhatsApp() {
  const client = getClient();
  if (!client) {
    throw new Error('Twilio not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
  }

  await client.messages.create({
    body: `*AI Job Finder - Test Message*\n\nYour WhatsApp notifications are working! You'll receive daily job match reports here.\n\n_Sent at: ${new Date().toLocaleString('en-IN')}_`,
    from: config.twilio.whatsappFrom,
    to: config.twilio.whatsappTo,
  });

  logger.info('Test WhatsApp message sent successfully!');
}

module.exports = { sendWhatsAppNotification, sendTestWhatsApp };
