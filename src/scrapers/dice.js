const BaseScraper = require('./baseScraper');
const { isMonday } = require('../utils/dateHelper');

class DiceScraper extends BaseScraper {
  constructor() {
    super('Dice');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const postedDate = isMonday() ? 'THREE' : 'ONE'; // days
        const url = `https://job-search-api.svc.dhigroupinc.com/v1/dice/jobs/search?q=${encodeURIComponent(query)}&countryCode2=US&radius=30&radiusUnit=mi&page=1&pageSize=25&facets=employmentType|postedDate&filters.postedDate=${postedDate}&language=en`;

        const response = await this.fetch(url, {
          headers: {
            ...this.getHeaders(),
            'x-api-key': '1YAt0R9wBg4WfsF9VB2778F5CHLAPMVW3WAZcKd8',
          },
        });

        const data = response.data;
        const listings = data?.data || [];

        for (const item of listings) {
          jobs.push(this.buildJob({
            title: item.title,
            company: item.companyName,
            location: item.jobLocation?.displayName || '',
            salary: item.compensation || '',
            jobDescription: item.summary || '',
            applyUrl: item.detailsPageUrl || `https://www.dice.com/job-detail/${item.id}`,
            postedDate: item.postedDate,
            skillsRequired: item.skills?.map(s => s.displayName || s.name || s) || [],
          }));
        }
      } catch (error) {
        // Continue
      }
    }

    return jobs;
  }
}

module.exports = DiceScraper;
