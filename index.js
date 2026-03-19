require('dotenv').config();
const config = require('./config');
const logger = require('./src/utils/logger');
const { connectDB } = require('./src/database/schema');
const db = require('./src/database/queries');
const { parseResume, loadResumeData, hasResumeData } = require('./src/resume/parser');
const { scrapeAll } = require('./src/scrapers');
const { matchJobs } = require('./src/ai/matcher');
const { deduplicateJobs } = require('./src/utils/deduplicator');
const { sendJobReport, sendTestEmail, sendWeeklySummary } = require('./src/notifications/email');
const { sendWhatsAppNotification, sendTestWhatsApp } = require('./src/notifications/whatsapp');
const { startScheduler } = require('./src/scheduler/cron');
const { getRunLabel, formatDate, getWeekStart, getWeekEnd } = require('./src/utils/dateHelper');
const chalk = require('chalk');
const readlineSync = require('readline-sync');
const path = require('path');
const fs = require('fs');

const BANNER = `
  ╔═══════════════════════════════════════════╗
  ║       AI JOB FINDER AGENT v1.0.0          ║
  ║   Intelligent Job Matching & Notifications ║
  ╚═══════════════════════════════════════════╝
`;

/**
 * First-time setup flow
 */
async function setupFlow() {
  console.log(chalk.cyan(BANNER));
  console.log(chalk.yellow('First-time setup\n'));

  // Step 1: Resume input
  console.log(chalk.bold('Step 1: Resume Setup'));
  console.log('How do you want to provide your resume?');
  console.log('  1) Upload PDF (place file in ./resume/ folder)');
  console.log('  2) Enter portfolio/website URL');
  console.log('  3) Paste resume text');

  const choice = readlineSync.question('\nChoose (1/2/3): ').trim();

  let resumeData;

  switch (choice) {
    case '1': {
      const defaultPath = config.resumePath;
      let pdfPath = readlineSync.question(`PDF path [${defaultPath}]: `).trim() || defaultPath;
      pdfPath = path.resolve(pdfPath);

      if (!fs.existsSync(pdfPath)) {
        console.log(chalk.red(`File not found: ${pdfPath}`));
        console.log('Please place your resume PDF in the ./resume/ folder and try again.');
        process.exit(1);
      }

      resumeData = await parseResume(pdfPath, 'pdf');
      break;
    }
    case '2': {
      const url = readlineSync.question('Portfolio URL: ').trim();
      if (!url) {
        console.log(chalk.red('URL is required'));
        process.exit(1);
      }
      resumeData = await parseResume(url, 'url');
      break;
    }
    case '3': {
      console.log('Paste your resume text (press Enter twice to finish):');
      let text = '';
      let emptyLines = 0;
      while (emptyLines < 2) {
        const line = readlineSync.question('');
        if (line === '') {
          emptyLines++;
        } else {
          emptyLines = 0;
        }
        text += line + '\n';
      }
      resumeData = await parseResume(text.trim(), 'text');
      break;
    }
    default:
      console.log(chalk.red('Invalid choice'));
      process.exit(1);
  }

  // Show extracted info
  console.log(chalk.green('\nResume parsed successfully!'));
  console.log(`  Name: ${resumeData.fullName || 'Not detected'}`);
  console.log(`  Email: ${resumeData.email || 'Not detected'}`);
  console.log(`  Skills: ${resumeData.skills.slice(0, 10).join(', ') || 'Not detected'}`);
  console.log(`  GitHub: ${resumeData.githubUrl || 'Not detected'}`);

  // Step 2: Job preferences
  console.log(chalk.bold('\nStep 2: Job Preferences'));
  const roles = readlineSync.question(`Target roles [${config.targetRoles.join(', ')}]: `).trim();
  if (roles) {
    console.log(`  Updated roles: ${roles}`);
  }

  const locations = readlineSync.question(`Target locations [${config.targetLocations.join(', ')}]: `).trim();
  if (locations) {
    console.log(`  Updated locations: ${locations}`);
  }

  // Step 3: Test notifications
  console.log(chalk.bold('\nStep 3: Test Notifications'));

  if (config.gmail.user && config.gmail.appPassword) {
    const testEmail = readlineSync.keyInYN('Send test email?');
    if (testEmail) {
      try {
        await sendTestEmail();
        console.log(chalk.green('  Test email sent!'));
      } catch (error) {
        console.log(chalk.red(`  Email failed: ${error.message}`));
      }
    }
  } else {
    console.log(chalk.yellow('  Gmail not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env'));
  }

  if (config.twilio.accountSid && config.twilio.authToken) {
    const testWA = readlineSync.keyInYN('Send test WhatsApp?');
    if (testWA) {
      try {
        await sendTestWhatsApp();
        console.log(chalk.green('  Test WhatsApp sent!'));
      } catch (error) {
        console.log(chalk.red(`  WhatsApp failed: ${error.message}`));
      }
    }
  } else {
    console.log(chalk.yellow('  Twilio not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env'));
  }

  console.log(chalk.green('\nSetup complete! Run with: node index.js --run-now'));
  console.log('Or start the scheduler: node index.js');
}

/**
 * Main agent run - scrape, match, deduplicate, notify
 */
async function runAgent() {
  const startTime = Date.now();
  const runLabel = getRunLabel();
  const errors = {};

  logger.info(`\n${'='.repeat(50)}`);
  logger.info(`AI Job Finder Agent - ${formatDate()}`);
  logger.info(`Mode: ${runLabel}`);
  logger.info(`${'='.repeat(50)}\n`);

  // Load resume
  const resumeData = loadResumeData();
  if (!resumeData) {
    logger.error('No resume data found. Run: node index.js --setup');
    return;
  }

  // Step 1: Scrape all platforms
  logger.info('Step 1/5: Scraping job platforms...');
  const { jobs: rawJobs, platformResults, errors: scrapeErrors } = await scrapeAll(resumeData);
  Object.assign(errors, scrapeErrors);

  if (rawJobs.length === 0) {
    logger.warn('No jobs found from any platform. Check your search queries and platform availability.');
    await db.logRun({
      runDate: new Date(),
      platformsScraped: Object.keys(platformResults),
      jobsFound: 0, jobsMatched: 0, jobsSent: 0,
      runErrors: errors, durationSeconds: (Date.now() - startTime) / 1000,
    });
    return;
  }

  // Step 2: Deduplicate
  logger.info('Step 2/5: Deduplicating jobs...');
  const uniqueJobs = await deduplicateJobs(rawJobs);

  if (uniqueJobs.length === 0) {
    logger.info('All jobs were duplicates. No new jobs to process.');
    await db.logRun({
      runDate: new Date(),
      platformsScraped: Object.keys(platformResults),
      jobsFound: rawJobs.length, jobsMatched: 0, jobsSent: 0,
      runErrors: errors, durationSeconds: (Date.now() - startTime) / 1000,
    });
    return;
  }

  // Step 3: AI Matching (cap at 100 to stay within Lambda timeout)
  const maxToMatch = 100;
  const jobsToMatch = uniqueJobs.slice(0, maxToMatch);
  if (uniqueJobs.length > maxToMatch) {
    logger.info(`Capping AI matching at ${maxToMatch} of ${uniqueJobs.length} unique jobs`);
  }
  logger.info('Step 3/5: AI matching jobs to resume...');
  const matchedJobs = await matchJobs(resumeData, jobsToMatch);

  if (matchedJobs.length === 0) {
    logger.info(`No jobs met the minimum match score of ${config.minMatchScore}%`);
    await db.logRun({
      runDate: new Date(),
      platformsScraped: Object.keys(platformResults),
      jobsFound: rawJobs.length, jobsMatched: 0, jobsSent: 0,
      runErrors: errors, durationSeconds: (Date.now() - startTime) / 1000,
    });
    return;
  }

  // Step 4: Cache jobs and save HR contacts
  logger.info('Step 4/5: Saving to database...');
  await db.cacheJobs(matchedJobs);

  const hrJobs = matchedJobs.filter(j => j.hrEmail);
  for (const job of hrJobs) {
    await db.saveHrContact({
      name: job.hrName,
      email: job.hrEmail,
      linkedinUrl: job.hrLinkedinProfile,
      company: job.company,
      jobTitle: job.title,
      postUrl: job.postLink || job.applyUrl,
    });
  }

  // Step 5: Send notifications
  logger.info('Step 5/5: Sending notifications...');

  let emailSent = false;
  let whatsappSent = false;

  try {
    emailSent = await sendJobReport(matchedJobs, platformResults, runLabel);
  } catch (error) {
    errors.email = error.message;
    logger.error(`Email notification failed: ${error.message}`);
  }

  try {
    whatsappSent = await sendWhatsAppNotification(matchedJobs, platformResults);
  } catch (error) {
    errors.whatsapp = error.message;
    logger.error(`WhatsApp notification failed: ${error.message}`);
  }

  // Mark jobs as sent
  if (emailSent || whatsappSent) {
    await db.markJobsSent(matchedJobs);
  }

  // Log the run
  const duration = (Date.now() - startTime) / 1000;
  await db.logRun({
    runDate: new Date(),
    platformsScraped: Object.keys(platformResults),
    jobsFound: rawJobs.length,
    jobsMatched: matchedJobs.length,
    jobsSent: emailSent || whatsappSent ? matchedJobs.length : 0,
    runErrors: Object.keys(errors).length > 0 ? errors : null,
    durationSeconds: duration,
  });

  // Summary
  logger.info(`\n${'='.repeat(50)}`);
  logger.info('RUN COMPLETE');
  logger.info(`  Jobs scraped: ${rawJobs.length}`);
  logger.info(`  Unique (new): ${uniqueJobs.length}`);
  logger.info(`  AI matched: ${matchedJobs.length}`);
  logger.info(`  Email sent: ${emailSent ? 'Yes' : 'No'}`);
  logger.info(`  WhatsApp sent: ${whatsappSent ? 'Yes' : 'No'}`);
  logger.info(`  HR contacts found: ${hrJobs.length}`);
  logger.info(`  Duration: ${duration.toFixed(1)}s`);
  logger.info(`${'='.repeat(50)}\n`);
}

/**
 * CLI argument handling
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    // Connect to database for all commands except --help
    if (command !== '--help') {
      await connectDB();
    }

    switch (command) {
      case '--setup':
        await setupFlow();
        break;

      case '--run-now':
        if (!hasResumeData()) {
          console.log(chalk.yellow('No resume data found. Running setup first...'));
          await setupFlow();
        }
        await runAgent();
        break;

      case '--test-email':
        await sendTestEmail();
        console.log(chalk.green('Test email sent successfully!'));
        break;

      case '--test-whatsapp':
        await sendTestWhatsApp();
        console.log(chalk.green('Test WhatsApp sent successfully!'));
        break;

      case '--weekly-summary': {
        const weekStart = getWeekStart();
        const weekEnd = getWeekEnd();
        const stats = await db.getWeeklyStats(weekStart, weekEnd);
        await sendWeeklySummary(stats);
        console.log(chalk.green('Weekly summary sent!'));
        break;
      }

      case '--status': {
        const runs = await db.getRecentRuns(5);
        console.log(chalk.cyan('\nRecent Runs:'));
        for (const run of runs) {
          console.log(`  ${run.runDate.toLocaleDateString()} - Found: ${run.jobsFound}, Matched: ${run.jobsMatched}, Sent: ${run.jobsSent}, Duration: ${run.durationSeconds?.toFixed(1)}s`);
        }
        break;
      }

      case '--clean-cache':
        await db.cleanOldCache(30);
        console.log(chalk.green('Old cache cleaned!'));
        break;

      case '--help':
        console.log(chalk.cyan(BANNER));
        console.log('Usage: node index.js [command]\n');
        console.log('Commands:');
        console.log('  (no args)         Start the cron scheduler (7 AM Mon-Sat)');
        console.log('  --setup           First-time setup (resume + preferences)');
        console.log('  --run-now         Run the agent immediately');
        console.log('  --test-email      Send a test email');
        console.log('  --test-whatsapp   Send a test WhatsApp message');
        console.log('  --weekly-summary  Send weekly summary now');
        console.log('  --status          Show recent run history');
        console.log('  --clean-cache     Remove cached jobs older than 30 days');
        console.log('  --help            Show this help message');
        process.exit(0);
        break;

      default:
        // No command = start scheduler
        console.log(chalk.cyan(BANNER));

        if (!hasResumeData()) {
          console.log(chalk.yellow('No resume data found. Please run setup first:'));
          console.log(chalk.bold('  node index.js --setup\n'));
          process.exit(1);
        }

        console.log(chalk.green('Starting scheduler...'));
        console.log(`  Cron: ${config.scheduleCron} (7 AM Mon-Sat, IST)`);
        console.log(`  Target roles: ${config.targetRoles.join(', ')}`);
        console.log(`  Min match score: ${config.minMatchScore}%`);
        console.log(`  Max jobs/day: ${config.maxJobsPerDay}\n`);

        startScheduler(runAgent);

        // Keep process alive
        process.on('SIGINT', async () => {
          logger.info('Shutting down...');
          const { disconnectDB } = require('./src/database/schema');
          await disconnectDB();
          process.exit(0);
        });
        break;
    }

    // Exit after one-off commands
    if (command && command !== '--help' && !['--setup', '--run-now', '--test-email', '--test-whatsapp', '--weekly-summary', '--status', '--clean-cache'].includes(command)) {
      // Unknown command
      console.log(chalk.red(`Unknown command: ${command}`));
      console.log('Run: node index.js --help');
    }

    // Exit for one-off commands (not scheduler)
    if (command && command !== '') {
      const { disconnectDB } = require('./src/database/schema');
      await disconnectDB();
    }
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`);
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

// Export for scheduler to use
module.exports = { runAgent };

// Run if called directly
if (require.main === module) {
  main();
}
