#!/usr/bin/env node
'use strict';

/**
 * set-password.js  — Set or reset the n8watch admin dashboard password.
 *
 * Usage:
 *   node scripts/set-password.js
 *   node scripts/set-password.js --password "myNewPassword"
 */

const readline = require('readline');
const path = require('path');

// Allow running from any working directory by resolving the auth module relative
// to this script's location.
const auth = require(path.join(__dirname, '..', 'server', 'auth'));

async function promptPassword() {
  const PROMPT = 'New admin password (min 6 chars): ';
  return new Promise((resolve) => {
    process.stdout.write(PROMPT);

    // Try raw mode for hidden input (TTY)
    try {
      process.stdin.setRawMode(true);
    } catch (_) {
      // Non-TTY fallback (e.g. piped input): password will be visible
      process.stdout.write('\n(warning: terminal does not support hidden input — password will be visible)\n');
      process.stdout.write(PROMPT);
      // Use readline with output suppressed so it doesn't echo
      const rl = readline.createInterface({ input: process.stdin, output: null, terminal: false });
      rl.once('line', (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    let password = '';
    const onData = (ch) => {
      ch = ch + '';
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        process.stdin.pause();
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password);
      } else if (ch === '\u0003') {
        process.stdout.write('\n');
        process.exit(0);
      } else if (ch === '\u007f' || ch === '\b') {
        // Handle backspace
        if (password.length > 0) password = password.slice(0, -1);
      } else {
        password += ch;
      }
    };

    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
  });
}

async function main() {
  console.log('=== n8watch — Set Admin Password ===\n');

  // Check for --password flag
  const flagIndex = process.argv.indexOf('--password');
  let password;
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    password = process.argv[flagIndex + 1];
    console.log('Using password supplied via --password flag.');
  } else {
    password = await promptPassword();
  }

  try {
    auth.setPassword(password);
    console.log('\n✓ Admin password has been set successfully.');
    console.log('  You can now log in to the n8watch dashboard Settings page.');
  } catch (err) {
    console.error('\n✗ Failed to set password:', err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
