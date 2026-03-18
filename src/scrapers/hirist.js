const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');

class HiristScraper extends BaseScraper {
  constructor() {
    super('Hirist');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const slug = query.toLowerCase().replace(/\s+/g, '-');
        const url = `https://www.hirist.tech/${slug}-jobs`;

        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        $('.job-card, .vacancy, [class*="job-listing"], .job-bx').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('.job-title, h3, h2, .title').first().text().trim();
            const company = $el.find('.company-name, .company, .subtitle').first().text().trim();
            const loc = $el.find('.location, .loc').first().text().trim();
            const exp = $el.find('.experience, .exp').first().text().trim();
            const skills = [];
            $el.find('.skill, .tag, .chip').each((_, s) => {
              const text = $(s).text().trim();
              if (text) skills.push(text);
            });

            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) {
              applyUrl = `https://www.hirist.tech${applyUrl}`;
            }

            if (!title) return;

            jobs.push(this.buildJob({
              title,
              company,
              location: loc,
              experienceRequired: exp,
              skillsRequired: skills,
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

module.exports = HiristScraper;
