const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');

class HackerEarthScraper extends BaseScraper {
  constructor() {
    super('HackerEarth');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const url = `https://www.hackerearth.com/jobs/?q=${encodeURIComponent(query)}`;
        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        $('.job-card, [class*="job-listing"], .challenge-card').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('.job-title, h3, h2, .title').first().text().trim();
            const company = $el.find('.company, .org-name').first().text().trim();
            const loc = $el.find('.location, .loc').first().text().trim();
            const skills = [];
            $el.find('.skill, .tag').each((_, s) => {
              const t = $(s).text().trim();
              if (t) skills.push(t);
            });

            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) applyUrl = `https://www.hackerearth.com${applyUrl}`;

            if (!title) return;
            jobs.push(this.buildJob({
              title, company, location: loc, skillsRequired: skills, applyUrl,
            }));
          } catch (err) { /* skip */ }
        });
      } catch (error) { /* continue */ }
    }
    return jobs;
  }
}

module.exports = HackerEarthScraper;
