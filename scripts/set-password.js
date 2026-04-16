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
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    // Hide input on terminals that support it
    const { stdout } = process;
    if (stdout.isTTY && stdout.write) {
      stdout.write('New admin password (min 6 chars): ');
    } else {
      process.stdout.write('New admin password (min 6 chars): ');
    }

    let password = '';
    const onData = (ch) => {
      ch = ch + '';
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        process.stdin.pause();
        process.stdin.setRawMode && process.stdin.setRawMode(false);
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password);
      } else if (ch === '\u0003') {
        process.stdout.write('\n');
        process.exit(0);
      } else {
        password += ch;
      }
    };

    try {
      process.stdin.setRawMode(true);
    } catch (_) {
      // Non-TTY — just read normally
      rl.question('', (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }
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
