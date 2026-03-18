const OpenAI = require('openai');
const config = require('../../config');
const logger = require('../utils/logger');

let client = null;

function getClient() {
  if (!client && config.openaiApiKey) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return client;
}

async function matchJob(resumeData, job) {
  const openai = getClient();
  if (!openai) throw new Error('OpenAI API key not configured');

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
  "job_type_fit": "<role>",
  "cover_letter_snippet": "<2-line opener>"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
    temperature: 0.3,
  });

  const text = response.choices[0]?.message?.content || '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (error) {
    logger.warn(`Failed to parse OpenAI response: ${error.message}`);
  }

  return {
    match_score: 0, match_reason: 'Failed to analyze',
    missing_skills: [], strengths: [], recommended: false,
    job_type_fit: '', cover_letter_snippet: '',
  };
}

function isAvailable() {
  return !!config.openaiApiKey;
}

module.exports = { matchJob, isAvailable };
