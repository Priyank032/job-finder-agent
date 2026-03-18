const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');

class CutshortScraper extends BaseScraper {
  constructor() {
    super('Cutshort');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        const url = `https://cutshort.io/jobs?q=${encodeURIComponent(query)}`;
        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        // Try Next.js data first
        const nextData = $('script#__NEXT_DATA__').html();
        if (nextData) {
          try {
            const data = JSON.parse(nextData);
            const listings = data?.props?.pageProps?.jobs ||
              data?.props?.pageProps?.initialJobs || [];
            for (const item of listings) {
              jobs.push(this.buildJob({
                title: item.title || item.name,
                company: item.company?.name || item.companyName || '',
                location: item.location || item.cities?.join(', ') || '',
                salary: item.salary || item.ctc || '',
                skillsRequired: item.skills?.map(s => s.name || s) || [],
                jobDescription: item.description || '',
                applyUrl: `https://cutshort.io/job/${item.slug || item.id || ''}`,
                postedDate: item.createdAt || item.publishedAt,
              }));
            }
          } catch (err) { /* not valid */ }
        }

        // HTML fallback
        if (jobs.length === 0) {
          $('[class*="job-card"], .opportunity, [class*="listing"]').each((i, el) => {
            const $el = $(el);
            const title = $el.find('h3, h2, [class*="title"]').first().text().trim();
            const company = $el.find('[class*="company"]').first().text().trim();
            let applyUrl = $el.find('a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) applyUrl = `https://cutshort.io${applyUrl}`;
            if (title) jobs.push(this.buildJob({ title, company, applyUrl }));
          });
        }
      } catch (error) { /* continue */ }
    }
    return jobs;
  }
}

module.exports = CutshortScraper;
