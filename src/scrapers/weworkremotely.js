const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');
const { isWithinWindow } = require('../utils/dateHelper');

class WeWorkRemotelyScraper extends BaseScraper {
  constructor() {
    super('WeWorkRemotely');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        // Try RSS feed first
        const rssUrl = `https://weworkremotely.com/remote-jobs.rss`;
        const response = await this.fetch(rssUrl);
        const $ = cheerio.load(response.data, { xmlMode: true });

        $('item').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('title').text().trim();
            const company = $el.find('company').text().trim() || this.extractCompany(title);
            const pubDate = $el.find('pubDate').text().trim();
            const link = $el.find('link').text().trim() || $el.find('guid').text().trim();
            const description = $el.find('description').text().trim();
            const region = $el.find('region').text().trim();

            // Filter by query
            const searchLower = query.toLowerCase();
            if (!title.toLowerCase().includes(searchLower) &&
                !description.toLowerCase().includes(searchLower)) {
              return;
            }

            if (!isWithinWindow(pubDate)) return;

            jobs.push(this.buildJob({
              title: title.replace(/^.+?:\s*/, ''), // Remove "Company: " prefix
              company,
              location: region || 'Remote',
              jobDescription: description.replace(/<[^>]*>/g, ''),
              applyUrl: link,
              postedDate: pubDate,
            }));
          } catch (err) {
            // Skip
          }
        });
      } catch (error) {
        // Try HTML fallback
        try {
          await this.delay();
          const htmlUrl = `https://weworkremotely.com/remote-jobs/search?term=${encodeURIComponent(query)}`;
          const response = await this.fetch(htmlUrl);
          const $ = cheerio.load(response.data);

          $('li.feature, li.listing-item').each((i, el) => {
            const $el = $(el);
            const title = $el.find('.title').text().trim();
            const company = $el.find('.company').text().trim();
            const loc = $el.find('.region').text().trim();

            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) {
              applyUrl = `https://weworkremotely.com${applyUrl}`;
            }

            if (!title) return;

            jobs.push(this.buildJob({
              title,
              company,
              location: loc || 'Remote',
              applyUrl,
            }));
          });
        } catch (err) {
          // Skip
        }
      }
    }

    return jobs;
  }

  extractCompany(title) {
    const match = title.match(/^(.+?):\s/);
    return match ? match[1] : '';
  }
}

module.exports = WeWorkRemotelyScraper;
