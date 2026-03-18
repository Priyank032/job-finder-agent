const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');
const { isMonday } = require('../utils/dateHelper');

class NaukriScraper extends BaseScraper {
  constructor() {
    super('Naukri');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        // Naukri search URL format
        const slug = query.toLowerCase().replace(/\s+/g, '-');
        const locationSlug = (location || 'india').toLowerCase().replace(/\s+/g, '-');
        const freshness = isMonday() ? '3' : '1'; // days

        const url = `https://www.naukri.com/${slug}-jobs-in-${locationSlug}?freshness=${freshness}`;

        const response = await this.fetch(url, {
          headers: {
            ...this.getHeaders(),
            'Referer': 'https://www.naukri.com/',
          },
        });

        const $ = cheerio.load(response.data);

        // Naukri job cards
        $('.srp-jobtuple-wrapper, .jobTuple, [class*="cust-job-tuple"]').each((i, el) => {
          try {
            const $el = $(el);

            const title = $el.find('.title, .desig, [class*="title"]').first().text().trim();
            const company = $el.find('.comp-name, .subTitle, [class*="comp-name"]').first().text().trim();
            const loc = $el.find('.loc, .locWdth, [class*="loc-wrap"]').first().text().trim();
            const exp = $el.find('.exp, .expwdth, [class*="exp-wrap"]').first().text().trim();
            const salary = $el.find('.sal, .salary, [class*="sal-wrap"]').first().text().trim();
            const skills = [];

            $el.find('.tag-li, .dot-gt, [class*="tag-container"] li, .skill-tag').each((_, skill) => {
              const s = $(skill).text().trim();
              if (s) skills.push(s);
            });

            const snippet = $el.find('.job-desc, .job-description, [class*="job-desc"]').text().trim();
            const dateText = $el.find('.date, .job-post-day, [class*="date"]').text().trim();

            let applyUrl = $el.find('a.title, a[class*="title"], a').first().attr('href') || '';
            if (applyUrl && !applyUrl.startsWith('http')) {
              applyUrl = `https://www.naukri.com${applyUrl}`;
            }

            if (!title) return;

            jobs.push(this.buildJob({
              title,
              company,
              location: loc,
              salary,
              experienceRequired: exp,
              skillsRequired: skills,
              jobDescription: snippet,
              applyUrl,
              postedDate: dateText,
            }));
          } catch (err) {
            // Skip malformed cards
          }
        });

        // Try Naukri API endpoint as well
        await this.scrapeNaukriAPI(query, location, freshness, jobs);
      } catch (error) {
        // Continue with next query
      }
    }

    return jobs;
  }

  async scrapeNaukriAPI(query, location, freshness, jobs) {
    try {
      await this.delay();
      const response = await this.fetch(
        `https://www.naukri.com/jobapi/v3/search?noOfResults=20&urlType=search_by_keyword&searchType=adv&keyword=${encodeURIComponent(query)}&location=${encodeURIComponent(location || 'India')}&freshness=${freshness}&pageNo=1`,
        {
          headers: {
            ...this.getHeaders(),
            'appid': '109',
            'systemid': 'Naukri',
            'Referer': 'https://www.naukri.com/',
          },
        }
      );

      const data = response.data;
      const listings = data?.jobDetails || [];

      for (const item of listings) {
        jobs.push(this.buildJob({
          title: item.title,
          company: item.companyName,
          location: item.placeholders?.find(p => p.type === 'location')?.label || '',
          salary: item.placeholders?.find(p => p.type === 'salary')?.label || '',
          experienceRequired: item.placeholders?.find(p => p.type === 'experience')?.label || '',
          skillsRequired: item.tagsAndSkills?.split(',').map(s => s.trim()).filter(Boolean) || [],
          jobDescription: item.jobDescription || '',
          applyUrl: item.jdURL ? `https://www.naukri.com${item.jdURL}` : '',
          postedDate: item.createdDate || item.footerPlaceholderLabel,
        }));
      }
    } catch (error) {
      // API might be blocked, that's OK
    }
  }
}

module.exports = NaukriScraper;
