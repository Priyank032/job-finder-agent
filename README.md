# AI Job Finder Agent

An intelligent job finder agent that scrapes jobs from 30+ platforms daily, matches them to your resume using AI (Claude/Gemini/GPT), and sends the best matches to your email and WhatsApp.

## Features

- **Multi-platform scraping**: 30+ job platforms (LinkedIn, Indeed, Naukri, RemoteOK, Glassdoor, and more)
- **AI-powered matching**: Uses Claude API (primary), Gemini (fallback), or OpenAI GPT (fallback) to score job matches
- **Smart deduplication**: Never sends the same job twice (tracked in MongoDB)
- **Email reports**: Beautiful HTML email with top matches, cold email opportunities, and apply links
- **WhatsApp notifications**: Concise daily summary via Twilio
- **Monday logic**: On Monday, fetches Saturday + Sunday jobs (72h window instead of 24h)
- **LinkedIn HR extraction**: Finds recruiter emails for cold outreach
- **Resume parsing**: Supports PDF upload, portfolio URL scraping, or plain text
- **Weekly summaries**: Automatic weekly stats email every Monday
- **Cron scheduler**: Runs at 7 AM Mon-Sat (IST), never on Sunday

## Prerequisites

- **Node.js** v18 or later
- **MongoDB Atlas** account (free tier works)
- At least one AI API key (Anthropic Claude recommended)
- Gmail account with App Password (for email notifications)
- Twilio account (optional, for WhatsApp notifications)

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd job-finder-agent

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your API keys and settings
```

## Setting Up API Keys

### 1. MongoDB Atlas (Required)

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free cluster
3. Create a database user with password
4. Get your connection string from **Connect > Drivers**
5. Add it to `.env` as `MONGODB_URI`

### 2. Anthropic Claude API (Recommended)

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create an API key
3. Add to `.env` as `ANTHROPIC_API_KEY`

### 3. Gemini API (Optional fallback)

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create an API key
3. Add to `.env` as `GEMINI_API_KEY`

### 4. OpenAI API (Optional fallback)

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an API key
3. Add to `.env` as `OPENAI_API_KEY`

### 5. Gmail App Password (For email notifications)

1. Go to [Google Account](https://myaccount.google.com/)
2. Navigate to **Security > 2-Step Verification** (enable if not already)
3. Go to **Security > 2-Step Verification > App passwords**
4. Select **Mail** and your device, click **Generate**
5. Copy the 16-character password
6. Add to `.env`:
   ```
   GMAIL_USER=your.email@gmail.com
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   RECIPIENT_EMAIL=your.email@gmail.com
   ```

### 6. Twilio WhatsApp (Optional)

1. Sign up at [Twilio](https://www.twilio.com/)
2. Go to **Messaging > Try it out > Send a WhatsApp message**
3. Follow the sandbox setup instructions (send "join <word>" to the Twilio number)
4. Get your Account SID and Auth Token from the dashboard
5. Add to `.env`:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxx
   TWILIO_AUTH_TOKEN=xxxxx
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
   RECIPIENT_WHATSAPP=whatsapp:+91XXXXXXXXXX
   ```

### 7. ScrapingBee (Optional - anti-bot fallback)

1. Sign up at [ScrapingBee](https://www.scrapingbee.com/)
2. Get your API key (free tier: 1000 credits)
3. Add to `.env` as `SCRAPINGBEE_API_KEY`

## First-Time Setup

```bash
node index.js --setup
```

This will guide you through:
1. Providing your resume (PDF, URL, or text)
2. Setting job preferences
3. Testing email and WhatsApp notifications

## Usage

```bash
# Start the scheduler (runs at 7 AM Mon-Sat, IST)
node index.js

# Run immediately (one-time)
node index.js --run-now

# Test email notification
node index.js --test-email

# Test WhatsApp notification
node index.js --test-whatsapp

# Send weekly summary
node index.js --weekly-summary

# View recent run history
node index.js --status

# Clean old cached jobs (30+ days)
node index.js --clean-cache

# Show help
node index.js --help
```

## Configuration

Edit `config.js` to customize:

- **targetRoles**: Job titles to search for
- **targetLocations**: Cities or "Remote"
- **experienceYears**: Your experience level
- **minMatchScore**: Minimum AI match score (0-100, default: 60)
- **maxJobsPerDay**: Max jobs per report (default: 30)
- **platforms**: Toggle individual platforms on/off
- **scheduleCron**: Cron expression (default: `0 7 * * 1-6`)

### Toggling Platforms

In `config.js`, set any platform to `false` to disable it:

```js
platforms: {
  linkedin: true,    // enabled
  naukri: true,      // enabled
  glassdoor: false,  // disabled (slow/blocked)
  internshala: false, // disabled (for freshers only)
}
```

## Project Structure

```
job-finder-agent/
├── src/
│   ├── scrapers/          # Platform-specific scrapers
│   │   ├── baseScraper.js # Base class with shared logic
│   │   ├── remoteok.js    # RemoteOK (JSON API)
│   │   ├── himalayas.js   # Himalayas (public API)
│   │   ├── linkedin.js    # LinkedIn (public search)
│   │   ├── indeed.js      # Indeed
│   │   ├── naukri.js      # Naukri (India)
│   │   ├── glassdoor.js   # Glassdoor
│   │   ├── wellfound.js   # Wellfound (AngelList)
│   │   ├── dice.js        # Dice (tech jobs)
│   │   ├── companyPages.js# Google, Microsoft, Amazon, etc.
│   │   └── index.js       # Scraper orchestrator
│   ├── ai/
│   │   ├── claude.js      # Claude API integration
│   │   ├── gemini.js      # Gemini API integration
│   │   ├── openai.js      # OpenAI API integration
│   │   └── matcher.js     # Fallback chain + batch matching
│   ├── resume/
│   │   ├── parser.js      # PDF, URL, text resume parser
│   │   └── resume_data.json (generated)
│   ├── notifications/
│   │   ├── email.js       # HTML email builder + sender
│   │   └── whatsapp.js    # Twilio WhatsApp integration
│   ├── database/
│   │   ├── schema.js      # Mongoose schemas + connection
│   │   └── queries.js     # Database operations
│   ├── scheduler/
│   │   └── cron.js        # Cron scheduler with Monday logic
│   └── utils/
│       ├── dateHelper.js  # Date utilities, Monday logic
│       ├── deduplicator.js# Job deduplication
│       └── logger.js      # Winston logger with colors
├── templates/
│   └── emailTemplate.html
├── resume/                # Place your PDF resume here
├── logs/                  # Daily log files
├── .env.example
├── config.js
├── index.js               # Entry point + CLI
├── package.json
└── README.md
```

## How It Works

1. **Scraping**: At 7 AM (Mon-Sat), the agent scrapes all enabled platforms for jobs matching your target roles
2. **Deduplication**: New jobs are checked against the MongoDB database to filter out previously sent jobs
3. **AI Matching**: Each unique job is sent to Claude (or fallback AI) along with your resume for scoring (0-100)
4. **Filtering**: Only jobs scoring above `minMatchScore` (default 60) are kept, sorted by score
5. **Notification**: Top jobs are sent via email (HTML report) and WhatsApp (concise summary)
6. **Database**: Sent jobs are recorded to prevent future duplicates

### Monday Special Logic

On Monday, the agent uses a 72-hour window instead of 24 hours, catching jobs posted on Saturday and Sunday.

## Deployment

### Railway / Render

1. Push your code to GitHub
2. Connect your repo on Railway/Render
3. Set all environment variables from `.env`
4. The app will start the cron scheduler automatically

### VPS (DigitalOcean, AWS, etc.)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start index.js --name "job-finder"

# Auto-start on reboot
pm2 startup
pm2 save

# View logs
pm2 logs job-finder
```

## Adding a New Scraper

1. Create `src/scrapers/yourPlatform.js`:

```js
const BaseScraper = require('./baseScraper');

class YourPlatformScraper extends BaseScraper {
  constructor() {
    super('YourPlatform');
  }

  async scrape(searchQuery, location, dateFilter) {
    const jobs = [];
    // Your scraping logic here
    // Use this.fetch(url) for HTTP requests
    // Use this.delay() between requests
    // Use this.buildJob({...}) to create job objects
    return jobs;
  }
}

module.exports = YourPlatformScraper;
```

2. Add to `src/scrapers/index.js`:
```js
const YourPlatformScraper = require('./yourPlatform');
// In scraperMap:
yourplatform: new YourPlatformScraper(),
```

3. Add to `config.js`:
```js
platforms: {
  yourplatform: true,
}
```

## Troubleshooting

### "No jobs found from any platform"
- Check if the platforms are accessible from your location
- Try enabling ScrapingBee API as fallback
- Some platforms may block scraping - disable them in config

### Email not sending
- Ensure you're using a Gmail **App Password**, not your regular password
- Enable 2-Factor Authentication on your Google account first
- Check that `RECIPIENT_EMAIL` is set in `.env`

### WhatsApp not working
- Make sure you've joined the Twilio sandbox (send "join <word>" to the Twilio number)
- Sandbox numbers expire after 72 hours of inactivity - rejoin if needed
- Check your Twilio account balance

### MongoDB connection failed
- Verify your connection string includes the database name
- Whitelist your IP in MongoDB Atlas (Network Access > Add IP Address)
- For deployment, use `0.0.0.0/0` to allow all IPs

### AI matching returns low scores
- Ensure your resume has detailed skills and experience
- Re-run `--setup` to update your resume data
- Lower `MIN_MATCH_SCORE` in `.env` if needed

## License

MIT
