const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');

class ShineScraper extends BaseScraper {
  constructor() {
    super('Shine');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const slug = query.toLowerCase().replace(/\s+/g, '-');
        const url = `https://www.shine.com/job-search/${slug}-jobs?freshness=1`;

        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        $('.job_container, .jobCard, [class*="job-card"], [class*="jobTuple"]').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('.job_title, .jobTitle, h3, h2').first().text().trim();
            const company = $el.find('.company_name, .companyName, .company').first().text().trim();
            const loc = $el.find('.loc, .location').first().text().trim();
            const exp = $el.find('.exp, .experience').first().text().trim();
            const salary = $el.find('.sal, .salary').first().text().trim();

            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) {
              applyUrl = `https://www.shine.com${applyUrl}`;
            }

            if (!title) return;

            jobs.push(this.buildJob({
              title, company, location: loc, salary, experienceRequired: exp, applyUrl,
            }));
          } catch (err) { /* skip */ }
        });
      } catch (error) { /* continue */ }
    }
    return jobs;
  }
}

module.exports = ShineScraper;
