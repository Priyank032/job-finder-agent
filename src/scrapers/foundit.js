const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');
const { isMonday } = require('../utils/dateHelper');

class FounditScraper extends BaseScraper {
  constructor() {
    super('Foundit');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const freshness = isMonday() ? '3' : '1';
        const url = `https://www.foundit.in/srp/results?query=${encodeURIComponent(query)}&locations=${encodeURIComponent(location || 'India')}&postAgeInDays=${freshness}&sort=1`;

        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        $('.card-apply-content, .job-card, [class*="srpResultCard"]').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('.job-title, .card-title, h3').first().text().trim();
            const company = $el.find('.company-name, .comp-name').first().text().trim();
            const loc = $el.find('.loc, .location').first().text().trim();
            const exp = $el.find('.exp, .experience').first().text().trim();
            const salary = $el.find('.sal, .salary').first().text().trim();
            const skills = [];
            $el.find('.skill-tag, .tag').each((_, s) => {
              const t = $(s).text().trim();
              if (t) skills.push(t);
            });

            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) {
              applyUrl = `https://www.foundit.in${applyUrl}`;
            }

            if (!title) return;

            jobs.push(this.buildJob({
              title, company, location: loc, salary,
              experienceRequired: exp, skillsRequired: skills, applyUrl,
            }));
          } catch (err) { /* skip */ }
        });
      } catch (error) { /* continue */ }
    }
    return jobs;
  }
}

module.exports = FounditScraper;
