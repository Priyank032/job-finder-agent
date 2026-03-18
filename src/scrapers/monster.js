const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');

class MonsterScraper extends BaseScraper {
  constructor() {
    super('Monster');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const url = `https://www.monster.com/jobs/search?q=${encodeURIComponent(query)}&where=${encodeURIComponent(location || '')}&stpage=1&page=1`;
        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        $('[class*="job-cardstyle"], .summary, [data-testid="svx-job-card"]').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('[data-testid="svx_jobCard-title"], .title, h3').first().text().trim();
            const company = $el.find('[data-testid="svx_jobCard-company"], .company').first().text().trim();
            const loc = $el.find('[data-testid="svx_jobCard-location"], .location').first().text().trim();

            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) {
              applyUrl = `https://www.monster.com${applyUrl}`;
            }

            if (!title) return;
            jobs.push(this.buildJob({ title, company, location: loc, applyUrl }));
          } catch (err) { /* skip */ }
        });
      } catch (error) { /* continue */ }
    }
    return jobs;
  }
}

module.exports = MonsterScraper;
