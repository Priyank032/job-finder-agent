const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

const RESUME_DATA_PATH = path.join(__dirname, 'resume_data.json');

/**
 * Parse resume from PDF file
 */
async function parsePDF(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Resume PDF not found: ${resolvedPath}`);
  }
  const buffer = fs.readFileSync(resolvedPath);
  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * Scrape portfolio/personal website for resume content
 */
async function scrapePortfolio(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const $ = cheerio.load(data);

    // Remove scripts, styles, nav, footer
    $('script, style, nav, footer, header, iframe').remove();

    // Extract text from main content areas
    const selectors = [
      'main', 'article', '.resume', '.about', '.experience',
      '.skills', '.education', '.projects', '#resume', '#about',
      '#experience', '#skills', '#education', '#projects',
      '[class*="resume"]', '[class*="about"]', '[class*="experience"]',
      '[class*="skill"]', '[class*="education"]', '[class*="project"]',
    ];

    let content = '';
    for (const sel of selectors) {
      const text = $(sel).text().trim();
      if (text) content += text + '\n\n';
    }

    // Fallback to body text if no specific sections found
    if (!content.trim()) {
      content = $('body').text();
    }

    // Clean up whitespace
    return content.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  } catch (error) {
    throw new Error(`Failed to scrape portfolio: ${error.message}`);
  }
}

/**
 * Extract structured resume data from raw text using regex patterns.
 * AI matching will use the full text, but we extract what we can.
 */
function extractStructuredData(rawText) {
  const data = {
    fullName: '',
    email: '',
    phone: '',
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    githubUrl: '',
    portfolioUrl: '',
    summary: '',
    rawText: rawText,
  };

  // Extract email
  const emailMatch = rawText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) data.email = emailMatch[0];

  // Extract phone
  const phoneMatch = rawText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) data.phone = phoneMatch[0];

  // Extract GitHub URL
  const githubMatch = rawText.match(/github\.com\/[\w-]+/i);
  if (githubMatch) data.githubUrl = `https://${githubMatch[0]}`;

  // Extract LinkedIn URL
  const linkedinMatch = rawText.match(/linkedin\.com\/in\/[\w-]+/i);
  if (linkedinMatch) data.linkedinUrl = `https://${linkedinMatch[0]}`;

  // Extract portfolio URL
  const urlMatch = rawText.match(/https?:\/\/(?!github|linkedin)[\w.-]+\.[\w]{2,}[^\s]*/i);
  if (urlMatch) data.portfolioUrl = urlMatch[0];

  // Extract skills from TECHNICAL SKILLS section and labeled skill lines
  // Looks for patterns like "Category: skill1, skill2, skill3"
  const skillSectionPatterns = [
    /(?:AI\/ML\s*&\s*LLMs|Languages|Backend|Frontend|Databases|Cloud\s*&\s*DevOps|Tools|Frameworks|Tech\s*Stack|Technical\s*Skills)\s*:\s*([^\n]+)/gi,
  ];

  for (const pattern of skillSectionPatterns) {
    let match;
    while ((match = pattern.exec(rawText)) !== null) {
      const line = match[1]
        .replace(/\([^)]*\)/g, ' ')  // Remove parenthesized content like "(Aggregation, Indexing)"
        .replace(/\b\d+%?\+?\b/g, '') // Remove percentages/numbers
        .replace(/\bLLaMA\s*[\d.]+/g, ''); // Remove model versions
      const skills = line
        .split(/[,|•·●►▪]/g)
        .map(s => s.trim())
        .filter(s =>
          s.length >= 2 && s.length < 35 &&
          /^[A-Za-z0-9.#+\s/\-]+$/.test(s) && // only clean chars
          !/^(and|or|with|in|for|the|a|an|of|to)$/i.test(s)
        );
      data.skills.push(...skills);
    }
  }

  // Deduplicate skills (case-insensitive)
  const seen = new Set();
  data.skills = data.skills.filter(s => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Extract name (usually first line or first capitalized words)
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.length < 60 && !firstLine.includes('@')) {
      data.fullName = firstLine;
    }
  }

  // Extract summary (first paragraph-like section)
  const summaryMatch = rawText.match(/(?:summary|objective|about|profile)[:\s]*([^]*?)(?=\n\s*\n|\nexperience|\neducation|\nskills)/i);
  if (summaryMatch) {
    data.summary = summaryMatch[1].trim().substring(0, 500);
  }

  return data;
}

/**
 * Parse resume from any source and save structured data
 */
async function parseResume(source, type = 'pdf') {
  let rawText;

  switch (type) {
    case 'pdf':
      logger.info(`Parsing PDF resume: ${source}`);
      rawText = await parsePDF(source);
      break;
    case 'url':
      logger.info(`Scraping portfolio: ${source}`);
      rawText = await scrapePortfolio(source);
      break;
    case 'text':
      logger.info('Using plain text resume');
      rawText = source;
      break;
    default:
      throw new Error(`Unknown resume type: ${type}`);
  }

  if (!rawText || rawText.trim().length < 50) {
    throw new Error('Extracted resume text is too short. Please check the input.');
  }

  const structured = extractStructuredData(rawText);
  logger.info(`Resume parsed: ${structured.skills.length} skills found, email: ${structured.email || 'not found'}`);

  // Save to file
  fs.writeFileSync(RESUME_DATA_PATH, JSON.stringify(structured, null, 2));
  logger.info(`Resume data saved to ${RESUME_DATA_PATH}`);

  return structured;
}

/**
 * Load previously parsed resume data
 */
function loadResumeData() {
  if (!fs.existsSync(RESUME_DATA_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(RESUME_DATA_PATH, 'utf-8'));
}

/**
 * Check if resume data exists
 */
function hasResumeData() {
  return fs.existsSync(RESUME_DATA_PATH);
}

module.exports = { parseResume, loadResumeData, hasResumeData, RESUME_DATA_PATH };
