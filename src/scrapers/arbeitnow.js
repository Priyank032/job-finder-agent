const BaseScraper = require('./baseScraper');
const { isWithinWindow } = require('../utils/dateHelper');

class ArbeitnowScraper extends BaseScraper {
  constructor() {
    super('Arbeitnow');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());
    const searchTerms = queries.flatMap(q => {
      const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      return [q.toLowerCase(), ...words];
    });
    const terms = [...new Set(searchTerms)];

    try {
      const response = await this.fetch('https://www.arbeitnow.com/api/job-board-api', {
        headers: { ...this.getHeaders(), 'Accept': 'application/json' },
      });

      const listings = response.data?.data || [];

      for (const item of listings) {
        if (!isWithinWindow(item.created_at)) continue;

        const title = (item.title || '').toLowerCase();
        const description = (item.description || '').toLowerCase();
        const tags = (item.tags || []).map(t => t.toLowerCase());

        const matches = terms.some(term =>
          title.includes(term) ||
          tags.some(t => t.includes(term)) ||
          description.includes(term)
        );

        if (!matches) continue;

        // Only include remote-friendly jobs
        const loc = (item.location || '').toLowerCase();
        const remote = item.remote === true;
        if (!remote && !loc.includes('remote') && !loc.includes('worldwide') &&
            !loc.includes('anywhere') && !loc.includes('india')) continue;

        jobs.push(this.buildJob({
          title: item.title,
          company: item.company_name || '',
          location: item.location || (remote ? 'Remote' : ''),
          salary: item.salary || '',
          skillsRequired: item.tags || [],
          jobDescription: (item.description || '').replace(/<[^>]*>/g, '').substring(0, 2000),
          applyUrl: item.url || '',
          postedDate: item.created_at,
        }));
      }
    } catch (error) {
      // API failed
    }

    return jobs;
  }
}

module.exports = ArbeitnowScraper;
