#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   MIGRATE — hash every plaintext password in the Users table
   ═══════════════════════════════════════════════════════

   The audit's most serious finding: signup.js wrote `Password: password`
   verbatim and login.js compared with `!==`, while bcryptjs sat unused in
   package.json. Anyone with read access to the base could read every fan's
   password in cleartext (AUDIT.md §3.5 #1).

   login.js now upgrades a row transparently on that fan's next login, so this
   script is not strictly required — but it closes the window immediately
   rather than waiting for everyone to log in again. Run it once.

       node scripts/hash-existing-passwords.js --dry
       node scripts/hash-existing-passwords.js

   Idempotent: rows that already hold a bcrypt hash are skipped.
   Nobody has to reset anything — the same password keeps working.
   ═══════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
        const t = line.trim();
        if (t && !t.startsWith('#') && t.includes('=')) {
            const [k, ...v] = t.split('=');
            if (!process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
        }
    }
}

const Airtable = require('airtable');
const bcrypt = require('bcryptjs');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const DRY = process.argv.includes('--dry');
const ROUNDS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isHashed = (v) => typeof v === 'string' && /^\$2[aby]\$\d{2}\$.{53}$/.test(v);

(async function main() {
    console.log(`\nHashing plaintext passwords${DRY ? ' (dry run)' : ''}…\n`);

    const users = await base('Users').select({ fields: ['Email', 'Username', 'Password'] }).all();

    let hashed = 0, already = 0, empty = 0;

    for (const u of users) {
        const pw = u.fields.Password;
        const who = u.fields.Username || u.fields.Email || u.id;

        if (!pw) { empty++; console.log(`  – ${who}: no password set, skipped`); continue; }
        if (isHashed(pw)) { already++; continue; }

        if (DRY) {
            console.log(`  ~ ${who}: would hash`);
            hashed++;
            continue;
        }

        const hash = await bcrypt.hash(pw, ROUNDS);
        await base('Users').update(u.id, { Password: hash });
        console.log(`  ✓ ${who}`);
        hashed++;
        await sleep(250);
    }

    console.log(`\n${hashed} ${DRY ? 'would be hashed' : 'hashed'}, ${already} already hashed, ${empty} with no password.`);
    if (DRY) {
        console.log('Nothing was written. Re-run without --dry to migrate.\n');
    } else if (hashed) {
        console.log('Done. Everyone\'s existing password still works — nothing to reset.\n');
    } else {
        console.log('Nothing to do.\n');
    }
})().catch((err) => {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
});
