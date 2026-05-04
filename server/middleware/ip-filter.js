'use strict';

const net = require('net');

// ── IP arithmetic helpers ─────────────────────────────────────────────────────

/**
 * Normalise a raw client IP from Express (may carry IPv6-mapped IPv4 prefix).
 * "::ffff:192.168.1.5"  →  "192.168.1.5"
 * "::1"                 →  "::1"
 */
function normaliseIp(raw) {
  if (!raw) return '';
  if (raw.startsWith('::ffff:')) return raw.slice(7);
  return raw;
}

/** Convert an IPv4 dotted-decimal string to a 32-bit unsigned integer. */
function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc * 256 + parseInt(octet, 10)) >>> 0, 0);
}

/** Convert an IPv6 address string to a BigInt (128-bit). Returns null on parse failure. */
function ipv6ToBigInt(ip) {
  try {
    // Expand "::" shorthand
    const halves = ip.split('::');
    let left = halves[0] ? halves[0].split(':') : [];
    let right = halves[1] ? halves[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    const middle = new Array(missing).fill('0');
    const groups = [...left, ...middle, ...right];
    if (groups.length !== 8) return null;
    return groups.reduce((acc, g) => {
      const val = parseInt(g || '0', 16);
      if (isNaN(val)) throw new Error('invalid group');
      return (acc << 16n) | BigInt(val);
    }, 0n);
  } catch {
    return null;
  }
}

/** Return true when `ip` is a loopback address (IPv4 or IPv6). */
function isLoopback(ip) {
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  // 127.x.x.x range
  if (/^127\./.test(ip)) return true;
  return false;
}

/**
 * Test whether a given IP matches a single allowlist entry address.
 * Supported formats:
 *   - Single IP:  "192.168.1.5" or "2001:db8::1"
 *   - CIDR:       "192.168.1.0/24" or "2001:db8::/32"
 *   - Range:      "10.0.0.1-10.0.0.50" (IPv4 only)
 */
function matchesAddress(clientIp, address) {
  if (!address || typeof address !== 'string') return false;

  // ── CIDR ─────────────────────────────────────────────────────────────────
  if (address.includes('/')) {
    const [base, prefixStr] = address.split('/');
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix)) return false;

    if (net.isIPv4(base) && net.isIPv4(clientIp)) {
      const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
      return (ipv4ToInt(clientIp) & mask) === (ipv4ToInt(base) & mask);
    }

    if (net.isIPv6(base) && net.isIPv6(clientIp)) {
      const clientBig = ipv6ToBigInt(clientIp);
      const baseBig   = ipv6ToBigInt(base);
      if (clientBig === null || baseBig === null) return false;
      // prefix === 0 matches all (/0 CIDR — any address)
      const shift = BigInt(128 - prefix);
      const mask = prefix === 0 ? 0n : (~0n << shift) & ((1n << 128n) - 1n);
      return (clientBig & mask) === (baseBig & mask);
    }
    return false;
  }

  // ── Range (IPv4 only) ────────────────────────────────────────────────────
  if (address.includes('-')) {
    const [startStr, endStr] = address.split('-');
    if (!net.isIPv4(startStr.trim()) || !net.isIPv4(endStr.trim()) || !net.isIPv4(clientIp)) return false;
    const start = ipv4ToInt(startStr.trim());
    const end   = ipv4ToInt(endStr.trim());
    const client = ipv4ToInt(clientIp);
    return client >= start && client <= end;
  }

  // ── Single IP ────────────────────────────────────────────────────────────
  return address.trim() === clientIp;
}

/**
 * Find the first allowlist entry that covers the given IP.
 * Returns the entry object, or null if none matches.
 */
function findMatchingEntry(clientIp, entries) {
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    if (entry && matchesAddress(clientIp, entry.address)) return entry;
  }
  return null;
}

// ── Middleware factories ──────────────────────────────────────────────────────

/**
 * apiFilter — blocks API access from IPs not on the allowlist.
 * Localhost is always permitted. When the allowlist is disabled, all traffic passes.
 */
function apiFilter(req, res, next) {
  const { getConfig } = require('../config');
  const cfg = getConfig();
  const al = cfg.security && cfg.security.ip_allowlist;

  if (!al || !al.enabled) return next();

  const clientIp = normaliseIp(req.ip || (req.socket && req.socket.remoteAddress) || '');

  if (isLoopback(clientIp)) return next();

  const entry = findMatchingEntry(clientIp, al.entries);
  if (!entry) {
    return res.status(403).json({ error: 'Forbidden: your IP address is not on the allowlist.' });
  }
  next();
}

/**
 * adminFilter — additionally requires the matching entry to have allow_admin: true.
 * Localhost is always permitted regardless of the allowlist.
 */
function adminFilter(req, res, next) {
  const { getConfig } = require('../config');
  const cfg = getConfig();
  const al = cfg.security && cfg.security.ip_allowlist;

  if (!al || !al.enabled) return next();

  const clientIp = normaliseIp(req.ip || (req.socket && req.socket.remoteAddress) || '');

  if (isLoopback(clientIp)) return next();

  const entry = findMatchingEntry(clientIp, al.entries);
  if (!entry) {
    return res.status(403).json({ error: 'Forbidden: your IP address is not on the allowlist.' });
  }
  if (!entry.allow_admin) {
    return res.status(403).json({ error: 'Forbidden: your IP address is not permitted to access the admin interface.' });
  }
  next();
}

module.exports = { apiFilter, adminFilter };
