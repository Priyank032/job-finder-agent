/**
 * Curated company career-board URLs (Greenhouse / Lever / Ashby) for the
 * careers-actor source of the 10 AM sheet job. These are companies that hire
 * AI/LLM / backend / software engineers in India or fully-remote.
 *
 * The careers actor (piotrv1001/company-career-page-scraper) auto-detects the
 * ATS from each URL and pulls its job list. Add/remove companies freely - one
 * URL per company board. If a board slug is wrong the actor just skips it.
 *
 * Slugs verified against the live ATS at build time where possible; some may
 * drift as companies migrate ATS - a wrong slug fails safe (0 jobs, no error).
 */

// Each entry: { url }. Grouped by ATS only for readability.
const CAREER_BOARDS = [
  // ── Indian product companies / unicorns (Greenhouse) ──
  { url: 'https://boards.greenhouse.io/razorpaysoftwareprivatelimited' },
  { url: 'https://job-boards.greenhouse.io/postman' },
  { url: 'https://boards.greenhouse.io/gojek' },
  { url: 'https://boards.greenhouse.io/hasura' },
  { url: 'https://boards.greenhouse.io/mixpanel' },
  { url: 'https://boards.greenhouse.io/cred' },
  { url: 'https://job-boards.greenhouse.io/harness' },
  { url: 'https://boards.greenhouse.io/browserstack' },
  { url: 'https://job-boards.greenhouse.io/chargebee' },
  { url: 'https://boards.greenhouse.io/druva' },

  // ── AI / LLM companies hiring India + remote ──
  { url: 'https://job-boards.greenhouse.io/anthropic' },
  { url: 'https://jobs.ashbyhq.com/openai' },
  { url: 'https://jobs.ashbyhq.com/sarvam.ai' },
  { url: 'https://jobs.ashbyhq.com/cohere' },
  { url: 'https://jobs.ashbyhq.com/perplexity.ai' },
  { url: 'https://job-boards.greenhouse.io/scaleai' },
  { url: 'https://jobs.ashbyhq.com/weights-and-biases' },
  { url: 'https://jobs.ashbyhq.com/huggingface' },
  { url: 'https://job-boards.greenhouse.io/databricks' },
  { url: 'https://boards.greenhouse.io/elastic' },

  // ── Fintech / SaaS with India engineering (Lever / Ashby / Greenhouse) ──
  { url: 'https://jobs.lever.co/zeta' },
  { url: 'https://jobs.lever.co/groww' },
  { url: 'https://jobs.ashbyhq.com/juspay' },
  { url: 'https://boards.greenhouse.io/freshworks' },
  { url: 'https://job-boards.greenhouse.io/zscaler' },
  { url: 'https://boards.greenhouse.io/postmanlabs' },
  { url: 'https://jobs.lever.co/leadsquared' },
  { url: 'https://boards.greenhouse.io/innovaccer' },

  // ── Remote-first / global companies open to India ──
  { url: 'https://jobs.ashbyhq.com/deel' },
  { url: 'https://boards.greenhouse.io/gitlab' },
  { url: 'https://job-boards.greenhouse.io/turing' },
  { url: 'https://jobs.lever.co/vercel' },
  { url: 'https://boards.greenhouse.io/mongodb' },
  { url: 'https://job-boards.greenhouse.io/twilio' },
  { url: 'https://jobs.ashbyhq.com/ramp' },
];

module.exports = { CAREER_BOARDS };
