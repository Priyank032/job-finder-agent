require('dotenv').config();

const config = {
  // Job search parameters
  targetRoles: (process.env.JOB_ROLES || 'Software Engineer, Full Stack Developer')
    .split(',')
    .map(r => r.trim()),

  targetLocations: (process.env.JOB_LOCATION || 'India, Remote')
    .split(',')
    .map(l => l.trim()),

  experienceYears: parseInt(process.env.EXPERIENCE_YEARS) || 3,

  // AI matching
  minMatchScore: parseInt(process.env.MIN_MATCH_SCORE) || 60,
  maxJobsPerDay: parseInt(process.env.MAX_JOBS_PER_DAY) || 55,
  maxToProcess: parseInt(process.env.MAX_TO_PROCESS) || 150, // max jobs sent to AI matching

  // Scheduler
  scheduleCron: '0 7 * * 1-6', // 7 AM Monday-Saturday
  mondayWindowHours: 48, // last 2 days on Monday (Sat + Sun)
  normalWindowHours: 24,

  // Preferred Indian cities (checked against job location)
  preferredIndiaCities: [
    'india', 'delhi', 'new delhi', 'gurugram', 'gurgaon', 'noida',
    'greater noida', 'faridabad', 'indore', 'jaipur', 'bangalore',
    'bengaluru', 'pune', 'hyderabad', 'ahmedabad', 'mumbai', 'chennai',
    'kolkata', 'chandigarh', 'lucknow', 'nagpur', 'surat', 'kochi',
  ],

  // MongoDB
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/job-finder-agent',

  // AI API Keys
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Email
  gmail: {
    user: process.env.GMAIL_USER,
    appPassword: process.env.GMAIL_APP_PASSWORD,
    recipient: process.env.RECIPIENT_EMAIL,
  },

  // WhatsApp (Twilio)
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
    whatsappTo: process.env.RECIPIENT_WHATSAPP,
  },

  // Scraping
  scrapingBeeKey: process.env.SCRAPINGBEE_API_KEY,
  scrapeOpsKey: process.env.SCRAPEOPS_API_KEY,

  // Resume
  resumePath: process.env.RESUME_PATH || './resume/my_resume.pdf',
  portfolioUrl: process.env.PORTFOLIO_URL,

  // Platforms to scrape (toggle on/off)
  // PRIMARY (handled by ts-jobspy - robust anti-bot handling):
  //   linkedin, indeed, glassdoor, google (jobs), naukri
  // SUPPLEMENTARY (API/RSS based scrapers):
  //   remoteok, weworkremotely, dice, unstop
  platforms: {
    // ── Primary (ts-jobspy) ─────────────
    linkedin: true,
    indeed: true,
    glassdoor: false, // blocked (403 from server IPs)
    google: true,     // Google Jobs - aggregates from career pages
    naukri: false,    // blocked (406) - Naukri jobs come via Google Jobs

    // ── Supplementary (API/RSS) ─────────
    remoteok: true,
    himalayas: true,    // public JSON API - remote jobs
    arbeitnow: true,    // public JSON API - remote jobs
    cutshort: true,     // India-focused startup jobs
    careers: true,      // company career pages via Greenhouse/Lever/TheMuse APIs
  },

  // Scraping settings
  scraping: {
    minDelay: 2000,  // 2 seconds between requests
    maxDelay: 5000,  // 5 seconds max delay
    maxRetries: 3,
    timeout: 30000,  // 30 second timeout
    userAgents: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ],
  },
};

module.exports = config;
