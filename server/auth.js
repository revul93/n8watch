'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Credential storage ────────────────────────────────────────────────────────

function getCredentialsPath() {
  const dataDir = process.env.n8watch_DATA_DIR
    ? path.resolve(process.env.n8watch_DATA_DIR)
    : path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, '.admin-credentials.json');
}

function loadCredentials() {
  const credPath = getCredentialsPath();
  if (!fs.existsSync(credPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(credPath, 'utf8'));
  } catch {
    return null;
  }
}

function saveCredentials(creds) {
  const credPath = getCredentialsPath();
  fs.writeFileSync(credPath, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

// ── Password hashing (scrypt, no external dependencies) ──────────────────────

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN  = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto
    .scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
    .toString('hex');
  return { salt, hash };
}

function verifyPassword(password, stored) {
  try {
    const derived = crypto
      .scryptSync(password, stored.salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
      .toString('hex');
    return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(stored.hash, 'hex'));
  } catch {
    return false;
  }
}

// ── Session tokens (in-memory) ────────────────────────────────────────────────

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const _sessions = new Map(); // token -> expiresAt

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  _sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function verifySession(token) {
  if (!token) return false;
  const exp = _sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    _sessions.delete(token);
    return false;
  }
  return true;
}

function destroySession(token) {
  _sessions.delete(token);
}

// Periodically clean up expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [token, exp] of _sessions.entries()) {
    if (now > exp) _sessions.delete(token);
  }
}, 60 * 60 * 1000);

// ── Public API ────────────────────────────────────────────────────────────────

function hasPassword() {
  const creds = loadCredentials();
  return creds !== null && typeof creds.hash === 'string';
}

function setPassword(password) {
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
  const { salt, hash } = hashPassword(password);
  saveCredentials({ salt, hash });
}

function checkPassword(password) {
  const creds = loadCredentials();
  if (!creds) return false;
  return verifyPassword(password, creds);
}

module.exports = { hasPassword, setPassword, checkPassword, createSession, verifySession, destroySession };
