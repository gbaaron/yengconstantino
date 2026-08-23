#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   PURGE — remove every seeded demonstration record
   ═══════════════════════════════════════════════════════
       node scripts/purge-demo-data.js --dry     # count only
       node scripts/purge-demo-data.js           # delete

   Only touches rows this project marked as demo:
     TourDemand      → IsDemo = true
     Questions       → UserId = 'demo'
     QuestionClusters→ clusters whose every question is a demo row
   Real fan data is never matched by any of these filters.
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
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const DRY = process.argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function all(table, opts) {
    try {
        return await base(table).select(opts).all();
    } catch (err) {
        if (/NOT_FOUND|could not be found|INVALID_PERMISSIONS/i.test(err.message)) {
            console.log(`  ${table}: table not present, skipping`);
            return [];
        }
        throw err;
    }
}

async function destroy(table, records) {
    if (DRY || !records.length) return records.length;
    for (let i = 0; i < records.length; i += 10) {
        await base(table).destroy(records.slice(i, i + 10).map((r) => r.id));
        await sleep(250);
    }
    return records.length;
}

(async function main() {
    console.log(`\nPurging demonstration data${DRY ? ' (dry run)' : ''}…\n`);
    let total = 0;

    // 1. Tour pledges
    const pledges = await all('TourDemand', { filterByFormula: '{IsDemo} = TRUE()' });
    console.log(`  TourDemand: ${pledges.length}`);
    total += await destroy('TourDemand', pledges);

    // 2. Demo questions
    const questions = await all('Questions', { filterByFormula: "{UserId} = 'demo'" });
    console.log(`  Questions: ${questions.length}`);
    const demoClusterIds = new Set(questions.map((q) => q.fields.ClusterId).filter(Boolean));
    total += await destroy('Questions', questions);

    // 3. Clusters that were entirely demo. A cluster containing even one real
    //    fan question is left alone — its count is recomputed hourly anyway.
    const clusters = await all('QuestionClusters', {});
    const toDelete = [];
    for (const c of clusters) {
        if (!demoClusterIds.has(c.id)) continue;
        const remaining = await all('Questions', { filterByFormula: `{ClusterId} = '${c.id}'` });
        if (remaining.length === 0) toDelete.push(c);
    }
    console.log(`  QuestionClusters: ${toDelete.length}`);
    total += await destroy('QuestionClusters', toDelete);

    // 4. Demo point ledger rows, if any were written.
    const points = await all('YengPoints', { filterByFormula: "{UserId} = 'demo'" });
    if (points.length) {
        console.log(`  YengPoints: ${points.length}`);
        total += await destroy('YengPoints', points);
    }

    console.log(`\n${DRY ? 'Would remove' : 'Removed'} ${total} record(s).`);
    if (DRY) console.log('Nothing was deleted. Re-run without --dry to purge.\n');
    else console.log('The tour map and question clusters now show only real fan data.\n');
})().catch((err) => {
    console.error('\nPurge failed:', err.message);
    process.exit(1);
});
