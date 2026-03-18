const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');

class IIMJobsScraper extends BaseScraper {
  constructor() {
    super('IIMJobs');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const url = `https://www.iimjobs.com/search?q=${encodeURIComponent(query)}&loc=${encodeURIComponent(location || '')}&freshness=1`;
        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        $('.job-listing, .job-card, [class*="job-tuple"]').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('.job-title, h3, h2, .title').first().text().trim();
            const company = $el.find('.company-name, .company, .comp').first().text().trim();
            const loc = $el.find('.location, .loc').first().text().trim();
            const exp = $el.find('.experience, .exp').first().text().trim();
            const salary = $el.find('.salary, .sal').first().text().trim();

            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) applyUrl = `https://www.iimjobs.com${applyUrl}`;

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

module.exports = IIMJobsScraper;
