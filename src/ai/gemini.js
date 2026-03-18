const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../config');
const logger = require('../utils/logger');

let client = null;

function getClient() {
  if (!client && config.geminiApiKey) {
    client = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return client;
}

async function matchJob(resumeData, job) {
  const genAI = getClient();
  if (!genAI) throw new Error('Gemini API key not configured');

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const skills = (resumeData.skills || []).join(', ');
  const resumeSummary = (resumeData.summary || '').substring(0, 400);

  const prompt = `Job matching AI. Score how well this candidate fits the job.

CANDIDATE:
Skills: ${skills}
Summary: ${resumeSummary}

JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Required: ${(job.skillsRequired || []).join(', ') || 'Not specified'}
Description: ${(job.jobDescription || '').substring(0, 1000)}

Respond ONLY with valid JSON:
{
  "match_score": <0-100>,
  "match_reason": "<2 sentences>",
  "missing_skills": ["<skill>"],
  "strengths": ["<strength>"],
  "recommended": <bool>,
  "job_type_fit": "<what role this maps to>",
  "cover_letter_snippet": "<3-line personalized opener for cold email>"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (error) {
    logger.warn(`Failed to parse Gemini response: ${error.message}`);
  }

  return {
    match_score: 0, match_reason: 'Failed to analyze',
    missing_skills: [], strengths: [], recommended: false,
    job_type_fit: '', cover_letter_snippet: '',
  };
}

function isAvailable() {
  return !!config.geminiApiKey;
}

module.exports = { matchJob, isAvailable };
