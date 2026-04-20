'use strict';

/**
 * formatDuration - converts milliseconds to a human-readable "Xh Ym Zs" string.
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (!ms || ms < 0) return '0s';

  const totalSeconds = Math.floor(ms / 1000);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours)   parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

/**
 * formatDateTime - returns a human-readable date/time string in local server timezone.
 * @param {Date} date
 * @returns {string}
 */
function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * calculateDowntime - milliseconds elapsed since the given timestamp.
 * @param {number|string|Date} createdAt
 * @returns {number}
 */
function calculateDowntime(createdAt) {
  const start = createdAt instanceof Date ? createdAt.getTime() : Number(createdAt);
  return Date.now() - start;
}

module.exports = { formatDuration, formatDateTime, calculateDowntime };
