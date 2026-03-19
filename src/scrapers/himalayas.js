const BaseScraper = require('./baseScraper');
const { isWithinWindow } = require('../utils/dateHelper');

class HimalayasScraper extends BaseScraper {
  constructor() {
    super('Himalayas');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const response = await this.fetch(
          `https://himalayas.app/jobs/api?q=${encodeURIComponent(query)}&limit=50`,
          { headers: { ...this.getHeaders(), 'Accept': 'application/json' } }
        );

        const listings = response.data?.jobs || response.data || [];

        for (const item of listings) {
          if (!isWithinWindow(item.pubDate)) continue;

          jobs.push(this.buildJob({
            title: item.title,
            company: item.companyName || '',
            location: item.locationRestrictions?.join(', ') || 'Remote',
            salary: item.minSalary && item.maxSalary
              ? `${item.currency || '$'}${item.minSalary}-${item.maxSalary}` : '',
            skillsRequired: item.categories || [],
            jobDescription: (item.description || item.excerpt || '').replace(/<[^>]*>/g, ''),
            applyUrl: item.applicationLink || `https://himalayas.app/jobs/${item.guid || ''}`,
            postedDate: item.pubDate,
          }));
        }
      } catch (error) {
        // Continue with other queries
      }
    }

    return jobs;
  }
}

module.exports = HimalayasScraper;
