const BaseScraper = require('./baseScraper');
const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Company Career Pages Scraper
 *
 * Uses Greenhouse & Lever public APIs + TheMuse to fetch jobs from 100+ companies.
 * Each day picks a random batch of ~20 companies to avoid hammering all at once.
 * Over a week, covers all companies.
 */

// ── Greenhouse API companies (boards-api.greenhouse.io/v1/boards/{slug}/jobs) ──
const GREENHOUSE_COMPANIES = [
  // FAANG-tier / Big Tech
  { slug: 'airbnb', name: 'Airbnb' },
  { slug: 'stripe', name: 'Stripe' },
  { slug: 'coinbase', name: 'Coinbase' },
  { slug: 'discord', name: 'Discord' },
  { slug: 'pinterest', name: 'Pinterest' },
  { slug: 'reddit', name: 'Reddit' },
  { slug: 'spotify', name: 'Spotify' },
  { slug: 'figma', name: 'Figma' },
  { slug: 'databricks', name: 'Databricks' },
  { slug: 'datadog', name: 'Datadog' },
  { slug: 'cloudflare', name: 'Cloudflare' },
  { slug: 'twilio', name: 'Twilio' },
  { slug: 'elastic', name: 'Elastic' },
  { slug: 'squarespace', name: 'Squarespace' },
  { slug: 'duolingo', name: 'Duolingo' },
  { slug: 'grammarly', name: 'Grammarly' },
  { slug: 'asana', name: 'Asana' },
  { slug: 'airtable', name: 'Airtable' },

  // AI / ML Companies
  { slug: 'anthropic', name: 'Anthropic' },
  { slug: 'scaleai', name: 'Scale AI' },

  // Fintech
  { slug: 'robinhood', name: 'Robinhood' },
  { slug: 'affirm', name: 'Affirm' },
  { slug: 'sofi', name: 'SoFi' },
  { slug: 'chime', name: 'Chime' },
  { slug: 'toast', name: 'Toast' },

  // Growth / Unicorns
  { slug: 'instacart', name: 'Instacart' },
  { slug: 'lyft', name: 'Lyft' },
  { slug: 'gusto', name: 'Gusto' },
  { slug: 'webflow', name: 'Webflow' },
  { slug: 'contentful', name: 'Contentful' },
  { slug: 'lattice', name: 'Lattice' },
  { slug: 'amplitude', name: 'Amplitude' },
  { slug: 'mixpanel', name: 'Mixpanel' },
  { slug: 'launchdarkly', name: 'LaunchDarkly' },
  { slug: 'pagerduty', name: 'PagerDuty' },
  { slug: 'newrelic', name: 'New Relic' },
  { slug: 'algolia', name: 'Algolia' },
  { slug: 'storyblok', name: 'Storyblok' },

  // Dev Tools
  { slug: 'cockroachlabs', name: 'CockroachDB' },
  { slug: 'singlestore', name: 'SingleStore' },
  { slug: 'fivetran', name: 'Fivetran' },
  { slug: 'sumologic', name: 'Sumo Logic' },

  // India-heavy companies
  { slug: 'phonepe', name: 'PhonePe' },
  { slug: 'groww', name: 'Groww' },
  { slug: 'postman', name: 'Postman' },
  { slug: 'druva', name: 'Druva' },

  // Autonomous / Robotics
  { slug: 'waymo', name: 'Waymo' },
  { slug: 'nuro', name: 'Nuro' },
];

// ── Lever API companies (api.lever.co/v0/postings/{slug}) ──
const LEVER_COMPANIES = [
  { slug: 'paytm', name: 'Paytm' },
  { slug: 'meesho', name: 'Meesho' },
];

// Software engineering related keywords for filtering
const ENGINEERING_KEYWORDS = [
  'software', 'engineer', 'developer', 'frontend', 'backend', 'full stack',
  'fullstack', 'full-stack', 'web', 'mobile', 'react', 'node', 'python',
  'java', 'javascript', 'typescript', 'devops', 'sre', 'platform',
  'infrastructure', 'data engineer', 'ml engineer', 'ai engineer',
  'sde', 'mern', 'mean', 'api', 'cloud',
];

// Location keywords for India/Remote filtering
const LOCATION_KEYWORDS = [
  'india', 'bangalore', 'bengaluru', 'hyderabad', 'mumbai', 'pune', 'delhi',
  'gurgaon', 'gurugram', 'noida', 'chennai', 'kolkata', 'ahmedabad',
  'remote', 'anywhere', 'worldwide', 'global', 'apac',
];

class CareersScraper extends BaseScraper {
  constructor() {
    super('Careers');
  }

  async scrape(searchQuery, location, dateFilter) {
    const allJobs = [];

    // Pick daily batch: rotate through companies using day-of-year
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const batchSize = 20;

    const ghBatch = this._getBatch(GREENHOUSE_COMPANIES, dayOfYear, batchSize);
    const lvBatch = this._getBatch(LEVER_COMPANIES, dayOfYear, LEVER_COMPANIES.length);

    logger.info(`Careers: Checking ${ghBatch.length} Greenhouse + ${lvBatch.length} Lever companies today`);

    // Greenhouse jobs (parallel, 5 at a time)
    const ghJobs = await this._fetchGreenhouseBatch(ghBatch);
    allJobs.push(...ghJobs);

    // Lever jobs
    const lvJobs = await this._fetchLeverBatch(lvBatch);
    allJobs.push(...lvJobs);

    // TheMuse API (free, no key)
    const museJobs = await this._fetchTheMuse();
    allJobs.push(...museJobs);

    logger.info(`Careers: Found ${allJobs.length} relevant engineering jobs from company career pages`);
    return allJobs;
  }

  /**
   * Get a rotating batch of companies for today
   */
  _getBatch(companies, dayOfYear, batchSize) {
    const start = (dayOfYear * batchSize) % companies.length;
    const batch = [];
    for (let i = 0; i < batchSize && i < companies.length; i++) {
      batch.push(companies[(start + i) % companies.length]);
    }
    return batch;
  }

  /**
   * Fetch from Greenhouse boards API
   */
  async _fetchGreenhouseBatch(companies) {
    const jobs = [];
    const concurrency = 5;

    for (let i = 0; i < companies.length; i += concurrency) {
      const batch = companies.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map(co => this._fetchGreenhouseCompany(co))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') jobs.push(...r.value);
      }
    }

    return jobs;
  }

  async _fetchGreenhouseCompany(company) {
    const jobs = [];
    try {
      const response = await axios.get(
        `https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs`,
        { timeout: 10000 }
      );

      const listings = response.data?.jobs || [];
      for (const job of listings) {
        if (!this._isRelevantJob(job.title, job.location?.name || '')) continue;

        jobs.push(this.buildJob({
          title: job.title,
          company: company.name,
          location: job.location?.name || '',
          applyUrl: job.absolute_url || `https://boards.greenhouse.io/${company.slug}/jobs/${job.id}`,
          postedDate: job.updated_at || job.created_at,
          jobDescription: '',
          skillsRequired: [],
        }));
      }
    } catch (error) {
      // Skip failed companies
    }
    return jobs;
  }

  /**
   * Fetch from Lever API
   */
  async _fetchLeverBatch(companies) {
    const jobs = [];
    for (const co of companies) {
      try {
        const response = await axios.get(
          `https://api.lever.co/v0/postings/${co.slug}`,
          { timeout: 10000 }
        );

        const listings = Array.isArray(response.data) ? response.data : [];
        for (const job of listings) {
          const loc = job.categories?.location || '';
          if (!this._isRelevantJob(job.text || '', loc)) continue;

          jobs.push(this.buildJob({
            title: job.text,
            company: co.name,
            location: loc,
            applyUrl: job.hostedUrl || job.applyUrl || '',
            postedDate: job.createdAt,
            jobDescription: job.descriptionPlain || '',
            skillsRequired: job.categories?.team ? [job.categories.team] : [],
          }));
        }
      } catch (error) {
        // Skip failed companies
      }
    }
    return jobs;
  }

  /**
   * Fetch from TheMuse API (free, no key needed)
   */
  async _fetchTheMuse() {
    const jobs = [];
    try {
      const response = await axios.get(
        'https://www.themuse.com/api/public/jobs?category=Software%20Engineering&level=Mid%20Level&level=Entry%20Level&page=0',
        { timeout: 10000, headers: { 'Accept': 'application/json' } }
      );

      const listings = response.data?.results || [];
      for (const job of listings) {
        const locations = (job.locations || []).map(l => l.name).join(', ');
        if (!this._isRelevantLocation(locations)) continue;

        // Strip HTML from description
        const desc = (job.contents || '').replace(/<[^>]*>/g, '').substring(0, 2000);

        jobs.push(this.buildJob({
          title: job.name,
          company: job.company?.name || '',
          location: locations,
          applyUrl: job.refs?.landing_page || '',
          postedDate: job.publication_date,
          jobDescription: desc,
          skillsRequired: job.categories?.map(c => c.name) || [],
        }));
      }
    } catch (error) {
      // TheMuse failed
    }
    return jobs;
  }

  /**
   * Check if a job title and location are relevant (engineering + India/Remote)
   */
  _isRelevantJob(title, location) {
    const titleLower = (title || '').toLowerCase();
    const isEngineering = ENGINEERING_KEYWORDS.some(kw => titleLower.includes(kw));
    if (!isEngineering) return false;

    return this._isRelevantLocation(location);
  }

  /**
   * Check if location is India or Remote
   */
  _isRelevantLocation(location) {
    if (!location) return true; // include if no location specified
    const locLower = location.toLowerCase();
    return LOCATION_KEYWORDS.some(kw => locLower.includes(kw));
  }
}

module.exports = CareersScraper;
