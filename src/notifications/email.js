const nodemailer = require('nodemailer');
const config = require('../../config');
const logger = require('../utils/logger');
const { formatDate, formatDateReadable } = require('../utils/dateHelper');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.gmail.user,
        pass: config.gmail.appPassword,
      },
    });
  }
  return transporter;
}

/**
 * Build a job card HTML block
 */
function buildJobCard(job) {
  const scoreColor = job.matchScore >= 80 ? '#22c55e' : '#f59e0b';
  const skills = (job.missingSkills || []).map(s =>
    `<span style="display:inline-block;background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:11px;margin:2px;">${s}</span>`
  ).join(' ');

  const strengths = (job.strengths || []).slice(0, 3).map(s =>
    `<span style="display:inline-block;background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:12px;font-size:11px;margin:2px;">${s}</span>`
  ).join(' ');

  return `
    <tr>
      <td style="padding:12px 40px;">
        <div style="border:1px solid #e8e8e8;border-radius:12px;padding:20px;margin-bottom:8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <h3 style="margin:0 0 4px;color:#333;font-size:16px;">${job.title}</h3>
                <p style="margin:0 0 8px;color:#666;font-size:13px;">${job.company} ${job.location ? '&middot; ' + job.location : ''}</p>
              </td>
              <td style="text-align:right;vertical-align:top;">
                <span style="display:inline-block;background:${scoreColor};color:#fff;padding:4px 12px;border-radius:20px;font-weight:bold;font-size:14px;">${job.matchScore}%</span>
                <br>
                <span style="display:inline-block;background:#e8e8e8;color:#666;padding:2px 8px;border-radius:10px;font-size:11px;margin-top:4px;">${job.platform}</span>
              </td>
            </tr>
          </table>
          ${job.salary ? `<p style="margin:4px 0;color:#667eea;font-size:13px;font-weight:600;">${job.salary}</p>` : ''}
          ${job.matchReason ? `<p style="margin:8px 0;color:#555;font-size:13px;line-height:1.4;">${job.matchReason}</p>` : ''}
          ${strengths ? `<div style="margin:4px 0;"><span style="font-size:11px;color:#888;">Strengths:</span> ${strengths}</div>` : ''}
          ${skills ? `<div style="margin:4px 0;"><span style="font-size:11px;color:#888;">Missing:</span> ${skills}</div>` : ''}
          ${job.applyUrl ? `<a href="${job.applyUrl}" style="display:inline-block;margin-top:10px;background:#667eea;color:#ffffff;padding:8px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Apply Now</a>` : ''}
        </div>
      </td>
    </tr>`;
}

/**
 * Build cold email opportunity card
 */
function buildColdEmailCard(job) {
  return `
    <tr>
      <td style="padding:12px 40px;">
        <div style="border:1px solid #fde68a;border-radius:12px;padding:20px;background:#fffbeb;">
          <h3 style="margin:0 0 4px;color:#333;font-size:15px;">${job.title} - ${job.company}</h3>
          ${job.hrName ? `<p style="margin:4px 0;color:#666;font-size:13px;">HR: <strong>${job.hrName}</strong></p>` : ''}
          ${job.hrEmail ? `<p style="margin:4px 0;color:#666;font-size:13px;">Email: <a href="mailto:${job.hrEmail}" style="color:#667eea;">${job.hrEmail}</a></p>` : ''}
          ${job.postLink || job.applyUrl ? `<p style="margin:4px 0;font-size:13px;"><a href="${job.postLink || job.applyUrl}" style="color:#667eea;">View Post</a></p>` : ''}
          ${job.coverLetterSnippet ? `<div style="margin:10px 0;padding:10px;background:#fff;border-left:3px solid #f59e0b;border-radius:4px;font-size:13px;color:#555;line-height:1.5;font-style:italic;">"${job.coverLetterSnippet}"</div>` : ''}
        </div>
      </td>
    </tr>`;
}

/**
 * Build compact list item for lower-scored matches
 */
function buildCompactItem(job) {
  return `
    <tr>
      <td style="padding:4px 40px;">
        <div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0;">
          <span style="display:inline-block;background:#f59e0b;color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:bold;min-width:35px;text-align:center;">${job.matchScore}%</span>
          &nbsp;&nbsp;
          <strong style="font-size:14px;color:#333;">${job.title}</strong>
          <span style="color:#888;font-size:13px;"> - ${job.company}</span>
          ${job.applyUrl ? `&nbsp;<a href="${job.applyUrl}" style="color:#667eea;font-size:12px;text-decoration:none;">[Apply]</a>` : ''}
        </div>
      </td>
    </tr>`;
}

/**
 * Build and send the daily job report email
 */
async function sendJobReport(jobs, platformResults, runLabel) {
  if (!config.gmail.user || !config.gmail.appPassword) {
    logger.warn('Gmail not configured, skipping email notification');
    return false;
  }

  const topMatches = jobs.filter(j => j.matchScore >= 80);
  const coldEmailJobs = jobs.filter(j => j.hrEmail);
  const otherMatches = jobs.filter(j => j.matchScore >= 60 && j.matchScore < 80 && !j.hrEmail);
  const topScore = jobs.length > 0 ? jobs[0].matchScore : 0;
  const platformCount = Object.keys(platformResults).length;
  const platformList = Object.entries(platformResults)
    .map(([name, count]) => `${name} (${count})`)
    .join(', ');

  // Build job cards
  const topMatchCards = topMatches.map(buildJobCard).join('');
  const coldEmailCards = coldEmailJobs.map(buildColdEmailCard).join('');
  const otherMatchList = otherMatches.map(buildCompactItem).join('');

  // Build HTML email
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;margin:0 auto;background:#ffffff;">
    <tr>
      <td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px 40px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:22px;">Top ${jobs.length} Job Matches Found</h1>
        <p style="color:#e0d4f7;margin:8px 0 0;font-size:14px;">${formatDateReadable()} &middot; ${runLabel}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 40px;background:#f8f9ff;border-bottom:1px solid #e8e8e8;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align:center;padding:10px;">
              <div style="font-size:28px;font-weight:bold;color:#667eea;">${jobs.length}</div>
              <div style="font-size:12px;color:#888;text-transform:uppercase;">Matched</div>
            </td>
            <td style="text-align:center;padding:10px;">
              <div style="font-size:28px;font-weight:bold;color:#764ba2;">${platformCount}</div>
              <div style="font-size:12px;color:#888;text-transform:uppercase;">Platforms</div>
            </td>
            <td style="text-align:center;padding:10px;">
              <div style="font-size:28px;font-weight:bold;color:#22c55e;">${topScore}%</div>
              <div style="font-size:12px;color:#888;text-transform:uppercase;">Top Match</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${topMatches.length > 0 ? `
    <tr><td style="padding:30px 40px 10px;">
      <h2 style="color:#333;font-size:18px;margin:0;border-bottom:2px solid #667eea;padding-bottom:8px;">TOP MATCHES (80%+)</h2>
    </td></tr>
    ${topMatchCards}` : ''}
    ${coldEmailJobs.length > 0 ? `
    <tr><td style="padding:30px 40px 10px;">
      <h2 style="color:#333;font-size:18px;margin:0;border-bottom:2px solid #f59e0b;padding-bottom:8px;">COLD EMAIL OPPORTUNITIES</h2>
    </td></tr>
    ${coldEmailCards}` : ''}
    ${otherMatches.length > 0 ? `
    <tr><td style="padding:30px 40px 10px;">
      <h2 style="color:#333;font-size:18px;margin:0;border-bottom:2px solid #22c55e;padding-bottom:8px;">OTHER GOOD MATCHES (60-79%)</h2>
    </td></tr>
    ${otherMatchList}` : ''}
    <tr>
      <td style="padding:25px 40px;background:#f8f9ff;border-top:1px solid #e8e8e8;text-align:center;">
        <p style="color:#888;font-size:12px;margin:0;">
          Jobs fetched from: ${platformList}<br>
          Run at: ${new Date().toLocaleString('en-IN')}<br><br>
          Powered by AI Job Finder Agent
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const subject = `[${formatDate()}] - Top ${jobs.length} Job Matches Found for You`;

  try {
    const mail = getTransporter();
    await mail.sendMail({
      from: `"AI Job Finder" <${config.gmail.user}>`,
      to: config.gmail.recipient,
      subject,
      html,
    });
    logger.info(`Email sent to ${config.gmail.recipient} with ${jobs.length} jobs`);
    return true;
  } catch (error) {
    logger.error(`Failed to send email: ${error.message}`);
    return false;
  }
}

/**
 * Send a test email
 */
async function sendTestEmail() {
  if (!config.gmail.user || !config.gmail.appPassword) {
    throw new Error('Gmail not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env');
  }

  const mail = getTransporter();
  await mail.sendMail({
    from: `"AI Job Finder" <${config.gmail.user}>`,
    to: config.gmail.recipient,
    subject: 'AI Job Finder - Test Email',
    html: `<div style="font-family:sans-serif;padding:20px;text-align:center;">
      <h2 style="color:#667eea;">Email Setup Successful!</h2>
      <p>Your AI Job Finder Agent email notifications are working correctly.</p>
      <p style="color:#888;font-size:12px;">Sent at: ${new Date().toLocaleString('en-IN')}</p>
    </div>`,
  });

  logger.info('Test email sent successfully!');
}

/**
 * Send weekly summary email
 */
async function sendWeeklySummary(stats) {
  if (!config.gmail.user || !config.gmail.appPassword) return false;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;">
    <tr>
      <td style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:30px;text-align:center;">
        <h1 style="color:#fff;margin:0;">Weekly Job Search Summary</h1>
        <p style="color:#dcfce7;margin:8px 0 0;">${formatDateReadable()}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:30px;text-align:center;">
        <table width="100%" cellpadding="15" cellspacing="0">
          <tr>
            <td style="text-align:center;">
              <div style="font-size:36px;font-weight:bold;color:#667eea;">${stats.totalJobsFound}</div>
              <div style="color:#888;">Jobs Found</div>
            </td>
            <td style="text-align:center;">
              <div style="font-size:36px;font-weight:bold;color:#22c55e;">${stats.totalJobsMatched}</div>
              <div style="color:#888;">Matched</div>
            </td>
            <td style="text-align:center;">
              <div style="font-size:36px;font-weight:bold;color:#764ba2;">${stats.totalJobsSent}</div>
              <div style="color:#888;">Sent to You</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 30px;background:#f8f9ff;text-align:center;">
        <p style="color:#888;font-size:12px;">AI Job Finder Agent - Weekly Report</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const mail = getTransporter();
    await mail.sendMail({
      from: `"AI Job Finder" <${config.gmail.user}>`,
      to: config.gmail.recipient,
      subject: `Weekly Summary - ${stats.totalJobsMatched} Jobs Matched This Week`,
      html,
    });
    logger.info('Weekly summary email sent');
    return true;
  } catch (error) {
    logger.error(`Failed to send weekly summary: ${error.message}`);
    return false;
  }
}

module.exports = { sendJobReport, sendTestEmail, sendWeeklySummary };
