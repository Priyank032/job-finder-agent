const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');
const { isWithinWindow } = require('../utils/dateHelper');

class RemoteCoScraper extends BaseScraper {
  constructor() {
    super('RemoteCo');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const url = `https://remote.co/remote-jobs/search/?search_keywords=${encodeURIComponent(query)}`;
        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        $('.job_listing, [class*="job-listing"], .card-job').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('.job_listing-title, .position, h3, h4').first().text().trim();
            const company = $el.find('.job_listing-company, .company').first().text().trim();
            const dateText = $el.find('.job_listing-date, .date, time').first().text().trim();

            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) {
              applyUrl = `https://remote.co${applyUrl}`;
            }

            if (!title) return;
            if (dateText && !isWithinWindow(dateText)) return;

            jobs.push(this.buildJob({
              title, company, location: 'Remote', applyUrl, postedDate: dateText,
            }));
          } catch (err) { /* skip */ }
        });
      } catch (error) { /* continue */ }
    }
    return jobs;
  }
}

module.exports = RemoteCoScraper;
