const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');
const { isMonday } = require('../utils/dateHelper');

class GlassdoorScraper extends BaseScraper {
  constructor() {
    super('Glassdoor');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const fromAge = isMonday() ? 3 : 1;
        const url = `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(query)}&locT=N&locId=115&fromAge=${fromAge}&sortBy=date_desc`;

        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        $('[data-test="jobListing"], .react-job-listing, .jobCard').each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('[data-test="job-title"], .job-title, .jobTitle').text().trim();
            const company = $el.find('[data-test="emp-name"], .employer-name, .jobCard-company').text().trim();
            const loc = $el.find('[data-test="emp-location"], .job-location, .jobCard-location').text().trim();
            const salary = $el.find('[data-test="detailSalary"], .salary-estimate').text().trim();

            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) {
              applyUrl = `https://www.glassdoor.com${applyUrl}`;
            }

            if (!title) return;

            jobs.push(this.buildJob({
              title,
              company: company.replace(/[\d.]+$/, '').trim(), // remove rating number
              location: loc,
              salary,
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

module.exports = GlassdoorScraper;
