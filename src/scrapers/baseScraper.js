const axios = require('axios');
const cheerio = require('cheerio');
const config = require('../../config');
const logger = require('../utils/logger');
const { generateJobId } = require('../utils/deduplicator');
const { parseRelativeDate } = require('../utils/dateHelper');

class BaseScraper {
  constructor(platformName) {
    this.platformName = platformName;
    this.jobs = [];
    this._blocked = false; // track if this scraper is blocked for this run
  }

  /** Get random user agent */
  getRandomUA() {
    const uas = config.scraping.userAgents;
    return uas[Math.floor(Math.random() * uas.length)];
  }

  /** Random delay between requests */
  async delay() {
    const ms = config.scraping.minDelay +
      Math.random() * (config.scraping.maxDelay - config.scraping.minDelay);
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Default headers */
  getHeaders() {
    return {
      'User-Agent': this.getRandomUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
    };
  }

  /**
   * HTTP GET with retry logic.
   * If the scraper was already blocked on a previous query this run,
   * skip retries and fail fast.
   */
  async fetch(url, options = {}) {
    if (this._blocked) {
      throw new Error(`${this.platformName} is blocked, skipping further requests`);
    }

    const maxRetries = config.scraping.maxRetries;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get(url, {
          timeout: config.scraping.timeout,
          headers: this.getHeaders(),
          ...options,
        });
        return response;
      } catch (error) {
        const status = error.response?.status;
        // If 403/429/captcha, mark as blocked - don't retry
        if (status === 403 || status === 429 || status === 503) {
          this._blocked = true;
          // Try ScrapingBee as last resort (only once per scraper)
          if (config.scrapingBeeKey && !this._scrapingBeeFailed) {
            try {
              return await this.fetchViaScrapingBee(url);
            } catch (sbError) {
              this._scrapingBeeFailed = true;
              throw new Error(`Blocked (${status}) and ScrapingBee also failed`);
            }
          }
          throw new Error(`Blocked by ${this.platformName} (HTTP ${status})`);
        }

        if (attempt === maxRetries) {
          throw error;
        }
        logger.warn(`${this.platformName}: Attempt ${attempt} failed (${error.message}), retrying...`);
        await this.delay();
      }
    }
  }

  /** ScrapingBee fallback */
  async fetchViaScrapingBee(url) {
    logger.info(`${this.platformName}: Using ScrapingBee fallback`);
    const response = await axios.get('https://app.scrapingbee.com/api/v1/', {
      params: {
        api_key: config.scrapingBeeKey,
        url,
        render_js: 'false',
      },
      timeout: 60000,
    });
    return response;
  }

  /** Build a standardized job object */
  buildJob({ title, company, location, salary, experienceRequired, skillsRequired,
    jobDescription, applyUrl, postedDate, hrEmail, hrName, hrLinkedinProfile, postLink }) {
    return {
      jobId: generateJobId(title, company, this.platformName),
      title: (title || '').trim(),
      company: (company || '').trim(),
      location: (location || '').trim(),
      salary: (salary || '').trim(),
      experienceRequired: (experienceRequired || '').trim(),
      skillsRequired: skillsRequired || [],
      jobDescription: (jobDescription || '').trim(),
      applyUrl: (applyUrl || '').trim(),
      platform: this.platformName,
      postedDate: postedDate ? new Date(postedDate) : null,
      hrEmail: (hrEmail || '').trim(),
      hrName: (hrName || '').trim(),
      hrLinkedinProfile: (hrLinkedinProfile || '').trim(),
      postLink: (postLink || '').trim(),
      matchScore: null,
      matchReason: null,
    };
  }

  /** Override in subclass */
  async scrape(searchQuery, location, dateFilter) {
    throw new Error('scrape() must be implemented by subclass');
  }

  /** Safe scrape wrapper */
  async safeScrape(searchQuery, location, dateFilter) {
    try {
      const jobs = await this.scrape(searchQuery, location, dateFilter);
      logger.platform(this.platformName, jobs.length);
      return jobs;
    } catch (error) {
      logger.platformError(this.platformName, error.message);
      return [];
    }
  }
}

module.exports = BaseScraper;
