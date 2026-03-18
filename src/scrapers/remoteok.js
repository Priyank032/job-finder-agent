const BaseScraper = require('./baseScraper');
const { isWithinWindow } = require('../utils/dateHelper');

class RemoteOKScraper extends BaseScraper {
  constructor() {
    super('RemoteOK');
  }

  async scrape(searchQuery, location, dateFilter) {
    // RemoteOK returns all recent jobs as JSON - we filter locally
    const response = await this.fetch('https://remoteok.com/api', {
      headers: {
        'User-Agent': this.getRandomUA(),
        'Accept': 'application/json',
      },
    });

    const data = response.data;
    const listings = Array.isArray(data) ? data.slice(1) : []; // first element is metadata

    // Build search terms from comma-separated query
    const searchTerms = searchQuery.split(',')
      .map(q => q.trim().toLowerCase())
      .flatMap(q => {
        // Also split multi-word terms into individual words for broader matching
        const words = q.split(/\s+/).filter(w => w.length > 2);
        return [q, ...words];
      });

    // Dedupe search terms
    const terms = [...new Set(searchTerms)];

    const jobs = [];
    for (const item of listings) {
      // Filter by date window
      if (!isWithinWindow(item.date)) continue;

      const title = (item.position || '').toLowerCase();
      const tags = (item.tags || []).map(t => t.toLowerCase());
      const description = (item.description || '').toLowerCase();

      // Check if any search term matches title, tags, or description
      const matches = terms.some(term =>
        title.includes(term) ||
        tags.some(t => t.includes(term)) ||
        description.includes(term)
      );

      if (!matches) continue;

      jobs.push(this.buildJob({
        title: item.position,
        company: item.company,
        location: item.location || 'Remote',
        salary: item.salary || '',
        skillsRequired: item.tags || [],
        jobDescription: (item.description || '').replace(/<[^>]*>/g, '').substring(0, 2000),
        applyUrl: item.url ? `https://remoteok.com${item.url}` : item.apply_url || '',
        postedDate: item.date,
      }));
    }

    return jobs;
  }
}

module.exports = RemoteOKScraper;
