const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');

class WellfoundScraper extends BaseScraper {
  constructor() {
    super('Wellfound');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const slug = query.toLowerCase().replace(/\s+/g, '-');
        const url = `https://wellfound.com/role/${slug}`;

        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        // Wellfound uses React, try to extract from script data
        $('script[type="application/json"], script#__NEXT_DATA__').each((_, script) => {
          try {
            const data = JSON.parse($(script).html());
            const listings = this.extractListings(data);
            for (const item of listings) {
              jobs.push(this.buildJob({
                title: item.title || item.name,
                company: item.company?.name || item.companyName || '',
                location: item.location || item.remote ? 'Remote' : '',
                salary: item.compensation || '',
                skillsRequired: item.skills || item.tags || [],
                jobDescription: item.description || '',
                applyUrl: item.url || item.slug
                  ? `https://wellfound.com/jobs/${item.slug || item.id}` : '',
              }));
            }
          } catch (err) {
            // Not JSON or wrong structure
          }
        });

        // Fallback: parse HTML directly
        if (jobs.length === 0) {
          $('[class*="styles_result"], [class*="job-listing"], .job-card').each((i, el) => {
            try {
              const $el = $(el);
              const title = $el.find('[class*="title"], h4, h3').first().text().trim();
              const company = $el.find('[class*="company"], [class*="name"]').first().text().trim();
              const loc = $el.find('[class*="location"]').first().text().trim();
              const salary = $el.find('[class*="compensation"], [class*="salary"]').first().text().trim();

              let applyUrl = $el.find('a').first().attr('href') || '';
              if (applyUrl && !applyUrl.startsWith('http')) {
                applyUrl = `https://wellfound.com${applyUrl}`;
              }

              if (!title) return;

              jobs.push(this.buildJob({
                title,
                company,
                location: loc,
                salary,
                applyUrl,
              }));
            } catch (err) {
              // Skip
            }
          });
        }
      } catch (error) {
        // Continue
      }
    }

    return jobs;
  }

  extractListings(data, results = []) {
    if (!data || typeof data !== 'object') return results;
    if (data.title && (data.companyName || data.company)) {
      results.push(data);
    }
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) {
        for (const item of data[key]) {
          this.extractListings(item, results);
        }
      } else if (typeof data[key] === 'object') {
        this.extractListings(data[key], results);
      }
    }
    return results;
  }
}

module.exports = WellfoundScraper;
