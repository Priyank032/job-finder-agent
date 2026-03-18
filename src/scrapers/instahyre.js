const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');

class InstahyreScraper extends BaseScraper {
  constructor() {
    super('Instahyre');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const url = `https://www.instahyre.com/search-jobs/?search=${encodeURIComponent(query)}&location=${encodeURIComponent(location || 'India')}`;

        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        $('.job-card, .opportunity-card, [class*="job-listing"]').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('.job-title, h3, h2').first().text().trim();
            const company = $el.find('.company-name, .company').first().text().trim();
            const loc = $el.find('.location, .loc').first().text().trim();
            const salary = $el.find('.salary, .ctc').first().text().trim();
            const exp = $el.find('.experience, .exp').first().text().trim();

            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) {
              applyUrl = `https://www.instahyre.com${applyUrl}`;
            }

            if (!title) return;

            jobs.push(this.buildJob({
              title,
              company,
              location: loc,
              salary,
              experienceRequired: exp,
              applyUrl,
            }));
          } catch (err) {
            // Skip
          }
        });
      } catch (error) {
        // Continue
      }
    }

    return jobs;
  }
}

module.exports = InstahyreScraper;
