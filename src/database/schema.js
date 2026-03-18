const mongoose = require('mongoose');
const config = require('../../config');
const logger = require('../utils/logger');

// ── Sent Jobs Schema ────────────────────
const sentJobSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  company: { type: String, required: true },
  platform: { type: String, required: true },
  applyUrl: String,
  matchScore: Number,
  sentDate: { type: Date, default: Date.now },
}, { timestamps: true });

// ── Job Cache Schema ────────────────────
const jobCacheSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true, index: true },
  title: String,
  company: String,
  location: String,
  salary: String,
  experienceRequired: String,
  skillsRequired: [String],
  jobDescription: String,
  applyUrl: String,
  platform: String,
  postedDate: Date,
  hrEmail: String,
  hrName: String,
  hrLinkedinProfile: String,
  postLink: String,
  matchScore: Number,
  matchReason: String,
  rawData: mongoose.Schema.Types.Mixed,
  scrapedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// ── HR Contacts Schema ──────────────────
const hrContactSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true },
  linkedinUrl: String,
  company: String,
  jobTitle: String,
  postUrl: String,
  foundDate: { type: Date, default: Date.now },
  emailed: { type: Boolean, default: false },
}, { timestamps: true });

hrContactSchema.index({ email: 1, company: 1 });

// ── Run Logs Schema ─────────────────────
const runLogSchema = new mongoose.Schema({
  runDate: { type: Date, default: Date.now },
  platformsScraped: [String],
  jobsFound: { type: Number, default: 0 },
  jobsMatched: { type: Number, default: 0 },
  jobsSent: { type: Number, default: 0 },
  runErrors: mongoose.Schema.Types.Mixed,
  durationSeconds: Number,
}, { timestamps: true });

// ── Weekly Stats Schema ─────────────────
const weeklyStatSchema = new mongoose.Schema({
  weekStart: Date,
  weekEnd: Date,
  totalJobsFound: { type: Number, default: 0 },
  totalJobsMatched: { type: Number, default: 0 },
  totalJobsSent: { type: Number, default: 0 },
  platformBreakdown: mongoose.Schema.Types.Mixed,
  topMatch: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

// Models
const SentJob = mongoose.model('SentJob', sentJobSchema);
const JobCache = mongoose.model('JobCache', jobCacheSchema);
const HrContact = mongoose.model('HrContact', hrContactSchema);
const RunLog = mongoose.model('RunLog', runLogSchema);
const WeeklyStat = mongoose.model('WeeklyStat', weeklyStatSchema);

// ── Connect to MongoDB ─────────────────
async function connectDB() {
  try {
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB Atlas');
  } catch (error) {
    logger.error('MongoDB connection failed:', error.message);
    throw error;
  }
}

// ── Disconnect ──────────────────────────
async function disconnectDB() {
  await mongoose.disconnect();
  logger.info('Disconnected from MongoDB');
}

module.exports = {
  connectDB,
  disconnectDB,
  SentJob,
  JobCache,
  HrContact,
  RunLog,
  WeeklyStat,
};
