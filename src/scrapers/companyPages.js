const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

/**
 * Scraper for major company career pages.
 * Each company has its own search URL pattern.
 */
class CompanyPagesScraper extends BaseScraper {
  constructor() {
    super('CompanyPages');
    this.companies = {
      google: {
        name: 'Google',
        url: (q) => `https://www.google.com/about/careers/applications/jobs/results?q=${encodeURIComponent(q)}&target_level=EARLY&target_level=MID`,
      },
      microsoft: {
        name: 'Microsoft',
        url: (q) => `https://careers.microsoft.com/us/en/search-results?keywords=${encodeURIComponent(q)}&p=ChIJOwg_06VPwokRYv534QaPC8g&d=30`,
      },
      amazon: {
        name: 'Amazon',
        url: (q) => `https://www.amazon.jobs/en/search?base_query=${encodeURIComponent(q)}&loc_query=India`,
      },
      meta: {
        name: 'Meta',
        url: (q) => `https://www.metacareers.com/jobs?q=${encodeURIComponent(q)}`,
      },
      apple: {
        name: 'Apple',
        url: (q) => `https://jobs.apple.com/en-us/search?search=${encodeURIComponent(q)}&sort=newest`,
      },
      netflix: {
        name: 'Netflix',
        url: (q) => `https://jobs.netflix.com/search?q=${encodeURIComponent(q)}`,
      },
      tcs: {
        name: 'TCS',
        url: (q) => `https://ibegin.tcs.com/iBegin/api/v1/jobs/search?keyword=${encodeURIComponent(q)}`,
      },
      infosys: {
        name: 'Infosys',
        url: (q) => `https://career.infosys.com/joblist?q=${encodeURIComponent(q)}`,
      },
      wipro: {
        name: 'Wipro',
        url: (q) => `https://careers.wipro.com/search-jobs/${encodeURIComponent(q)}`,
      },
      accenture: {
        name: 'Accenture',
        url: (q) => `https://www.accenture.com/in-en/careers/jobsearch?jk=${encodeURIComponent(q)}&sb=0`,
      },
    };
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());
    const config = require('../../config');

    for (const [key, company] of Object.entries(this.companies)) {
      // Check if this company is enabled
      if (config.platforms[key] === false) continue;

      for (const query of queries) {
        await this.delay();
        try {
          const url = company.url(query);
          const response = await this.fetch(url);

          // Generic HTML parsing
          const $ = cheerio.load(response.data);
          const parsed = this.parseGeneric($, company.name, url);
          jobs.push(...parsed);

          // Also try to parse JSON from script tags
          const jsonJobs = this.parseNextData($, company.name);
          jobs.push(...jsonJobs);

        } catch (error) {
          logger.warn(`${company.name} careers: ${error.message}`);
        }
      }
    }

    return jobs;
  }

  parseGeneric($, companyName, baseUrl) {
    const jobs = [];
    const selectors = [
      '[class*="job-card"]', '[class*="job-listing"]', '[class*="job-result"]',
      '[class*="position"]', '[class*="opening"]', '.job', '.vacancy',
      'tr[class*="job"]', 'li[class*="job"]',
    ];

    const combined = selectors.join(', ');

    $(combined).each((i, el) => {
      try {
        const $el = $(el);
        const title = $el.find('h2, h3, h4, [class*="title"], [class*="name"]').first().text().trim();
        const loc = $el.find('[class*="location"], [class*="loc"]').first().text().trim();

        let applyUrl = $el.find('a').first().attr('href') || '';
        if (applyUrl && !applyUrl.startsWith('http')) {
          const base = new URL(baseUrl);
          applyUrl = `${base.origin}${applyUrl}`;
        }

        if (!title || title.length > 200) return;

        jobs.push(this.buildJob({
          title,
          company: companyName,
          location: loc,
          applyUrl,
        }));
      } catch (err) {
        // Skip
      }
    });

    return jobs;
  }

  parseNextData($, companyName) {
    const jobs = [];
    try {
      const nextData = $('script#__NEXT_DATA__').html();
      if (!nextData) return jobs;

      const data = JSON.parse(nextData);
      const listings = this.findJobsInObject(data);

      for (const item of listings) {
        jobs.push(this.buildJob({
          title: item.title || item.name || item.jobTitle,
          company: companyName,
          location: item.location || item.city || '',
          applyUrl: item.url || item.applyUrl || '',
          postedDate: item.postedDate || item.createdAt,
        }));
      }
    } catch (err) {
      // Not available
    }
    return jobs;
  }

  findJobsInObject(obj, results = [], depth = 0) {
    if (depth > 8 || !obj || typeof obj !== 'object') return results;

    if (obj.title && (obj.location || obj.city)) {
      results.push(obj);
    }

    if (Array.isArray(obj)) {
      for (const item of obj.slice(0, 50)) {
        this.findJobsInObject(item, results, depth + 1);
      }
    } else {
      for (const key of Object.keys(obj)) {
        if (['jobs', 'positions', 'openings', 'results', 'listings', 'data'].includes(key.toLowerCase())) {
          this.findJobsInObject(obj[key], results, depth + 1);
        }
      }
    }

    return results;
  }
}

module.exports = CompanyPagesScraper;
