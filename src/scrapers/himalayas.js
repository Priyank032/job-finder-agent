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
          if (!isWithinWindow(item.pubDate || item.created_at || item.publishedAt)) continue;

          jobs.push(this.buildJob({
            title: item.title,
            company: item.companyName || item.company?.name || '',
            location: item.location || 'Remote',
            salary: item.salary || (item.minSalary && item.maxSalary
              ? `$${item.minSalary}-$${item.maxSalary}` : ''),
            skillsRequired: item.tags || item.skills || [],
            jobDescription: (item.description || '').replace(/<[^>]*>/g, ''),
            applyUrl: item.url || item.applicationUrl || `https://himalayas.app/jobs/${item.slug || item.id}`,
            postedDate: item.pubDate || item.created_at || item.publishedAt,
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
