const winston = require('winston');
const path = require('path');
const chalk = require('chalk');

const today = new Date().toISOString().split('T')[0];

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // File transport - daily log files
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs', `${today}.log`),
      maxsize: 5242880, // 5MB
      maxFiles: 30,
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs', 'error.log'),
      level: 'error',
    }),
  ],
});

// Console transport with colors
if (process.env.NODE_ENV !== 'test') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const colorMap = {
          error: chalk.red,
          warn: chalk.yellow,
          info: chalk.cyan,
          debug: chalk.gray,
        };
        const colorFn = colorMap[level] || chalk.white;
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${chalk.gray(timestamp)} ${colorFn(`[${level.toUpperCase()}]`)} ${message}${metaStr}`;
      })
    ),
  }));
}

// Platform-specific logging helpers
logger.platform = (name, count) => {
  if (count > 0) {
    logger.info(`${chalk.green('✅')} ${name}: ${count} jobs found`);
  } else {
    logger.warn(`${chalk.red('❌')} ${name}: no jobs found`);
  }
};

logger.platformError = (name, error) => {
  logger.error(`${chalk.red('❌')} ${name}: ${error}`);
};

module.exports = logger;
