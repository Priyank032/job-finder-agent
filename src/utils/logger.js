const winston = require('winston');
const path = require('path');
const chalk = require('chalk');

const today = new Date().toISOString().split('T')[0];
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

// Lambda: /var/task is read-only, use /tmp for logs. Local: use ./logs
const logDir = isLambda ? '/tmp/logs' : path.join(__dirname, '../../logs');

const transports = [];

// File transports only for local (Lambda logs go to CloudWatch via console)
if (!isLambda) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, `${today}.log`),
      maxsize: 5242880,
      maxFiles: 30,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    })
  );
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports,
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
    logger.info(`[OK] ${name}: ${count} jobs found`);
  } else {
    logger.warn(`[MISS] ${name}: no jobs found`);
  }
};

logger.platformError = (name, error) => {
  logger.error(`[FAIL] ${name}: ${error}`);
};

module.exports = logger;
