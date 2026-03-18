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

  return `Job matching AI. Score how well this candidate fits the job.

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
