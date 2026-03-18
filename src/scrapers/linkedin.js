const BaseScraper = require('./baseScraper');
const cheerio = require('cheerio');
const { isWithinWindow } = require('../utils/dateHelper');
const logger = require('../utils/logger');

class LinkedInScraper extends BaseScraper {
  constructor() {
    super('LinkedIn');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    const queries = searchQuery.split(',').map(q => q.trim());

    for (const query of queries) {
      await this.delay();
      try {
        // LinkedIn public job search (no login required)
        const params = new URLSearchParams({
          keywords: query,
          location: location || 'India',
          f_TPR: 'r86400', // past 24 hours (r259200 for past 3 days)
          position: '1',
          pageNum: '0',
          start: '0',
        });

        // For Monday, use past 3 days filter
        const { isMonday } = require('../utils/dateHelper');
        if (isMonday()) {
          params.set('f_TPR', 'r259200'); // past 3 days
        }

        const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`;

        const response = await this.fetch(url);
        const $ = cheerio.load(response.data);

        const jobCards = $('li');

        jobCards.each((i, el) => {
          try {
            const $el = $(el);
            const title = $el.find('.base-search-card__title').text().trim();
            const company = $el.find('.base-search-card__subtitle a').text().trim();
            const loc = $el.find('.job-search-card__location').text().trim();
            const applyUrl = $el.find('.base-card__full-link').attr('href') || '';
            const dateText = $el.find('time').attr('datetime') || $el.find('time').text().trim();

            if (!title || !company) return;

            const job = this.buildJob({
              title,
              company,
              location: loc,
              applyUrl: applyUrl.split('?')[0], // clean tracking params
              postedDate: dateText,
            });

            jobs.push(job);
          } catch (err) {
            // Skip malformed cards
          }
        });

        // Try to get more details and HR info for each job
        await this.enrichJobs(jobs.slice(-10)); // last batch, max 10
      } catch (error) {
        logger.warn(`LinkedIn search for "${query}" failed: ${error.message}`);
      }
    }

    return jobs;
  }

  /** Try to extract HR/recruiter info from job detail pages */
  async enrichJobs(jobs) {
    for (const job of jobs) {
      if (!job.applyUrl) continue;
      await this.delay();

      try {
        const response = await this.fetch(job.applyUrl);
        const $ = cheerio.load(response.data);

        // Extract job description
        const description = $('.show-more-less-html__markup').text().trim() ||
          $('.description__text').text().trim();
        if (description) job.jobDescription = description;

        // Extract salary if visible
        const salary = $('.compensation__salary').text().trim() ||
          $('.salary-main-rail__current-range').text().trim();
        if (salary) job.salary = salary;

        // Look for email addresses in the description
        const emailMatch = description.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
        if (emailMatch) {
          // Filter out common non-HR emails
          const hrEmail = emailMatch.find(e =>
            !e.includes('noreply') && !e.includes('info@') &&
            !e.includes('support@') && !e.includes('careers@')
          ) || emailMatch[0];
          job.hrEmail = hrEmail;
        }

        // Look for recruiter/posted by info
        const postedBy = $('.message-the-recruiter__cta-container').text().trim() ||
          $('[class*="poster"]').text().trim();
        if (postedBy) job.hrName = postedBy;

        // Extract skills from description
        const skillKeywords = [
          'JavaScript', 'TypeScript', 'React', 'Angular', 'Vue', 'Node.js',
          'Python', 'Java', 'C++', 'Go', 'Rust', 'Ruby', 'PHP', 'Swift',
          'Kotlin', 'SQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'Redis',
          'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Git',
          'REST', 'GraphQL', 'HTML', 'CSS', 'Sass', 'Tailwind',
          'Next.js', 'Express', 'Django', 'Flask', 'Spring',
          'Machine Learning', 'AI', 'Deep Learning', 'TensorFlow',
          'PyTorch', 'NLP', 'Computer Vision', 'Data Science',
          'Agile', 'Scrum', 'CI/CD', 'DevOps', 'Linux',
        ];

        job.skillsRequired = skillKeywords.filter(skill =>
          description.toLowerCase().includes(skill.toLowerCase())
        );

      } catch (error) {
        // Non-critical, skip enrichment
      }
    }
  }
}

module.exports = LinkedInScraper;
