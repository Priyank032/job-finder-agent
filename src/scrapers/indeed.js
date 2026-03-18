const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');
const { isWithinWindow } = require('../utils/dateHelper');

class IndeedScraper extends BaseScraper {
  constructor() {
    super('Indeed');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const params = new URLSearchParams({
          q: query,
          l: location || 'India',
          fromage: '1', // last 1 day
          sort: 'date',
          limit: '25',
        });

        const { isMonday } = require('../utils/dateHelper');
        if (isMonday()) {
          params.set('fromage', '3'); // last 3 days
        }

        const url = `https://www.indeed.com/jobs?${params}`;
        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        // Indeed job cards
        $('[class*="job_seen_beacon"], [class*="resultContent"], .tapItem').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('[class*="jobTitle"] a, .jobTitle > a, h2 a').text().trim() ||
              $el.find('[class*="jobTitle"]').text().trim();
            const company = $el.find('[class*="companyName"], .company, [data-testid="company-name"]').text().trim();
            const loc = $el.find('[class*="companyLocation"], .location, [data-testid="text-location"]').text().trim();
            const salary = $el.find('[class*="salary"], .salary-snippet, [class*="estimated-salary"]').text().trim();
            const snippet = $el.find('.job-snippet, [class*="job-snippet"]').text().trim();
            const dateText = $el.find('.date, [class*="date"]').text().trim();

            let applyUrl = $el.find('[class*="jobTitle"] a, .jobTitle > a, h2 a').attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) {
              applyUrl = `https://www.indeed.com${applyUrl}`;
            }

            if (!title) return;

            jobs.push(this.buildJob({
              title,
              company,
              location: loc,
              salary,
              jobDescription: snippet,
              applyUrl,
              postedDate: dateText,
            }));
          } catch (err) {
            // Skip malformed cards
          }
        });

        // Also try Indeed India
        await this.delay();
        const indiaUrl = `https://www.indeed.co.in/jobs?${params}`;
        try {
          const indiaResponse = await this.fetch(indiaUrl);
          const $india = cheerio.load(indiaResponse.data);

          $india('[class*="job_seen_beacon"], .tapItem').each((i, el) => {
            try {
              const $el = $india(el);
              const title = $el.find('[class*="jobTitle"] a, h2 a').text().trim();
              const company = $el.find('[class*="companyName"], .company').text().trim();
              const loc = $el.find('[class*="companyLocation"], .location').text().trim();
              const salary = $el.find('[class*="salary"]').text().trim();
              const snippet = $el.find('.job-snippet').text().trim();

              let applyUrl = $el.find('[class*="jobTitle"] a, h2 a').attr('href') || '';
              if (applyUrl && !applyUrl.startsWith('http')) {
                applyUrl = `https://www.indeed.co.in${applyUrl}`;
              }

              if (!title) return;

              jobs.push(this.buildJob({
                title,
                company,
                location: loc,
                salary,
                jobDescription: snippet,
                applyUrl,
              }));
            } catch (err) {
              // Skip
            }
          });
        } catch (err) {
          // India site might be blocked, continue
        }
      } catch (error) {
        // Continue with next query
      }
    }

    return jobs;
  }
}

module.exports = IndeedScraper;
