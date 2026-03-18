const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');

class UnstopScraper extends BaseScraper {
  constructor() {
    super('Unstop');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        // Unstop API endpoint
        const url = `https://unstop.com/api/public/jobs?keyword=${encodeURIComponent(query)}&type=jobs&per_page=25`;

        const response = await this.fetch(url, {
          headers: { ...this.getHeaders(), 'Accept': 'application/json' },
        });

        const listings = response.data?.data?.data || response.data?.data || [];

        for (const item of listings) {
          jobs.push(this.buildJob({
            title: item.title || item.name,
            company: item.organisation?.name || item.company || '',
            location: item.city || item.location || '',
            applyUrl: item.public_url || `https://unstop.com/jobs/${item.slug || item.id}`,
            postedDate: item.created_at || item.start_date,
            skillsRequired: item.skills?.map(s => s.name || s) || [],
            jobDescription: item.description || '',
          }));
        }
      } catch (error) {
        // Try HTML scraping fallback
        try {
          await this.delay();
          const htmlUrl = `https://unstop.com/jobs?keyword=${encodeURIComponent(query)}`;
          const res = await this.fetch(htmlUrl);
          const $ = cheerio.load(res.data);

          $('.single_opportunity, .opportunity-card, [class*="job-card"]').each((i, el) => {
            const $el = $(el);
            const title = $el.find('.opportunity-title, h3, h2').first().text().trim();
            const company = $el.find('.company, .org-name').first().text().trim();
            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) applyUrl = `https://unstop.com${applyUrl}`;
            if (title) jobs.push(this.buildJob({ title, company, applyUrl }));
          });
        } catch (err) { /* skip */ }
      }
    }
    return jobs;
  }
}

module.exports = UnstopScraper;
