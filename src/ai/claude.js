const Anthropic = require('@anthropic-ai/sdk');
const config = require('../../config');
const logger = require('../utils/logger');

let client = null;

function getClient() {
  if (!client && config.anthropicApiKey) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

/**
 * Match a job against resume using Claude API
 */
async function matchJob(resumeData, job) {
  const anthropic = getClient();
  if (!anthropic) throw new Error('Anthropic API key not configured');

  const prompt = buildPrompt(resumeData, job);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text || '';
  return parseResponse(text);
}

function buildPrompt(resumeData, job) {
  // Keep prompt compact to reduce token usage and avoid rate limits
  const resumeSummary = (resumeData.summary || '').substring(0, 400);
  const skills = (resumeData.skills || []).join(', ');
  const expYears = config.experienceYears || 3;

  // Extract required experience from description for scoring guidance
  const desc = (job.jobDescription || '').substring(0, 1000);
  const expMatch = desc.match(/(\d+)\+?\s*years?\s*(of\s*)?(experience|exp)/i);
  const requiredExp = expMatch ? parseInt(expMatch[1]) : null;
  const expNote = requiredExp && requiredExp > expYears + 1
    ? `NOTE: This job requires ${requiredExp}+ years but candidate only has ${expYears} years — significantly reduce match_score (subtract 20-30 points) for this experience gap.`
    : `Candidate has ${expYears} years of experience.`;

  return `Job matching AI. Score how well this candidate fits the job.

CANDIDATE:
Experience: ${expYears} years
Skills: ${skills}
Summary: ${resumeSummary}

JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Required: ${(job.skillsRequired || []).join(', ') || 'Not specified'}
Description: ${desc}

SCORING RULE: ${expNote}
Also reduce score for titles like Staff/Principal/VP/Director that typically need 7+ years.

Respond ONLY with valid JSON:
{"match_score":<0-100>,"match_reason":"<2 sentences>","missing_skills":["<skill>"],"strengths":["<strength>"],"recommended":<bool>,"job_type_fit":"<role>","cover_letter_snippet":"<2-line opener>"}`;
}

function parseResponse(text) {
  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    logger.warn(`Failed to parse Claude response: ${error.message}`);
  }

  return {
    match_score: 0,
    match_reason: 'Failed to analyze',
    missing_skills: [],
    strengths: [],
    recommended: false,
    job_type_fit: '',
    cover_letter_snippet: '',
  };
}

function isAvailable() {
  return !!config.anthropicApiKey;
}

module.exports = { matchJob, isAvailable };
