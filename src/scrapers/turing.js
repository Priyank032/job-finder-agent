const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');

class TuringScraper extends BaseScraper {
  constructor() {
    super('Turing');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const url = `https://www.turing.com/remote-developer-jobs?query=${encodeURIComponent(query)}`;
        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        $('[class*="job-card"], [class*="position"], .card').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('h3, h2, h4, [class*="title"]').first().text().trim();
            const salary = $el.find('[class*="salary"], [class*="pay"]').first().text().trim();
            const skills = [];
            $el.find('[class*="skill"], [class*="tag"], .badge').each((_, s) => {
              const t = $(s).text().trim();
              if (t && t.length < 30) skills.push(t);
            });

            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) applyUrl = `https://www.turing.com${applyUrl}`;

            if (!title) return;
            jobs.push(this.buildJob({
              title, company: 'Turing', location: 'Remote', salary,
              skillsRequired: skills, applyUrl,
            }));
          } catch (err) { /* skip */ }
        });
      } catch (error) { /* continue */ }
    }
    return jobs;
  }
}

module.exports = TuringScraper;
