const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');
const { isWithinWindow } = require('../utils/dateHelper');

class StackOverflowScraper extends BaseScraper {
  constructor() {
    super('StackOverflow');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        // Stack Overflow Jobs redirects to other platforms now, try the feed
        const url = `https://stackoverflow.com/jobs/feed?q=${encodeURIComponent(query)}&sort=p`;
        const response = await this.fetch(url);
        const $ = cheerio.load(response.data, { xmlMode: true });

        $('item, entry').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('title').text().trim();
            const link = $el.find('link').text().trim() || $el.find('link').attr('href');
            const pubDate = $el.find('pubDate, published, updated').text().trim();
            const description = $el.find('description, content, summary').text().trim();

            if (!isWithinWindow(pubDate)) return;

            // Extract company from title (format: "Title at Company")
            const titleMatch = title.match(/^(.+?)\s+at\s+(.+)$/i);
            const jobTitle = titleMatch ? titleMatch[1] : title;
            const company = titleMatch ? titleMatch[2] : '';

            // Extract location from categories/tags
            const categories = [];
            $el.find('category, tag').each((_, cat) => {
              categories.push($(cat).text().trim() || $(cat).attr('term'));
            });

            jobs.push(this.buildJob({
              title: jobTitle,
              company,
              location: categories.find(c => /remote|onsite|hybrid/i.test(c)) || '',
              jobDescription: description.replace(/<[^>]*>/g, '').substring(0, 2000),
              applyUrl: link,
              postedDate: pubDate,
              skillsRequired: categories.filter(c => !/remote|onsite|hybrid/i.test(c)),
            }));
          } catch (err) { /* skip */ }
        });
      } catch (error) { /* continue */ }
    }
    return jobs;
  }
}

module.exports = StackOverflowScraper;
