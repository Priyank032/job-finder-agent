/**
 * Date helper with Monday special logic.
 * On Monday, fetches Saturday + Sunday jobs (72h window).
 * On Tue-Sat, fetches last 24h only.
 */

function isMonday() {
  return new Date().getDay() === 1;
}

function isSunday() {
  return new Date().getDay() === 0;
}

/** Get the cutoff date for job filtering (adds 2h buffer to avoid edge cases) */
function getDateCutoff() {
  const now = new Date();
  const hours = (isMonday() ? 72 : 24) + 2; // 2h buffer
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

/** Get window hours based on current day */
function getWindowHours() {
  return isMonday() ? 72 : 24;
}

/** Check if a job's posted date falls within the fetch window */
function isWithinWindow(postedDate) {
  if (!postedDate) return true; // include if unknown
  const posted = new Date(postedDate);
  const cutoff = getDateCutoff();
  return posted >= cutoff;
}

/** Get label for the current run */
function getRunLabel() {
  if (isMonday()) return 'Weekend + Monday Posted';
  return 'Posted Today';
}

/** Format date as YYYY-MM-DD */
function formatDate(date = new Date()) {
  return date.toISOString().split('T')[0];
}

/** Format date as readable string */
function formatDateReadable(date = new Date()) {
  return new Date(date).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Get start of current week (Monday) */
function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now.setDate(diff));
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Get end of current week (Sunday) */
function getWeekEnd() {
  const start = getWeekStart();
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Convert relative time strings like "2 days ago" to Date */
function parseRelativeDate(text) {
  if (!text) return null;
  const now = new Date();
  const lower = text.toLowerCase().trim();

  if (lower.includes('just now') || lower.includes('moment')) return now;
  if (lower.includes('today')) return now;
  if (lower.includes('yesterday')) {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  const match = lower.match(/(\d+)\s*(minute|hour|day|week|month)s?\s*ago/);
  if (match) {
    const [, num, unit] = match;
    const multipliers = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };
    return new Date(now.getTime() - parseInt(num) * multipliers[unit]);
  }

  // Try direct date parse
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

module.exports = {
  isMonday,
  isSunday,
  getDateCutoff,
  getWindowHours,
  isWithinWindow,
  getRunLabel,
  formatDate,
  formatDateReadable,
  getWeekStart,
  getWeekEnd,
  parseRelativeDate,
};
