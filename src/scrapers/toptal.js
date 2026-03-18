const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');

class ToptalScraper extends BaseScraper {
  constructor() {
    super('Toptal');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const url = `https://www.toptal.com/careers#positions`;
        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        const searchLower = query.toLowerCase();

        $('[class*="position"], .job-card, [class*="career"]').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('h3, h2, h4, [class*="title"]').first().text().trim();
            const loc = $el.find('[class*="location"]').first().text().trim();

            if (!title || !title.toLowerCase().includes(searchLower)) return;

            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) applyUrl = `https://www.toptal.com${applyUrl}`;

            jobs.push(this.buildJob({
              title, company: 'Toptal', location: loc || 'Remote', applyUrl,
            }));
          } catch (err) { /* skip */ }
        });
      } catch (error) { /* continue */ }
    }
    return jobs;
  }
}

module.exports = ToptalScraper;
