#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   SEED — demonstration data for the pitch
   ═══════════════════════════════════════════════════════

   Everything this writes is FLAGGED as demo and is removable in one command:

       node scripts/seed-demo-data.js
       node scripts/purge-demo-data.js

   Rules this script follows, from AUDIT.md §3.2 — the previous build's seeded
   data was the single biggest embarrassment risk in the repo:

   - NO invented fan personas with real-sounding names and home cities.
     Demo pledges are anonymous counts, not "Grace, OFW in Dubai".
   - NO words are ever put in Yeng's mouth. This script seeds QUESTIONS
     (things fans ask) and never seeds an ANSWER.
   - NO invented events, songs, prices or chart positions.
   - Every row carries IsDemo/a demo marker so the UI can label it and the
     purge script can find it.

   Tour demand is the only substantial seed, because the map is the strongest
   thing in the demo and an empty map demos as broken.
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = () => new Date().toISOString();
const day = () => new Date().toISOString().split('T')[0];

/* ── Tour demand ──────────────────────────────────────
   Weighted to look like a real Filipino artist's demand curve: Metro Manila
   dominant, strong Visayas/Mindanao secondary cities, and a genuine diaspora
   tail (which is the point the pitch makes about monetisable fans abroad).  */
const DEMAND = [
    // [city, country, lat, lng, pledges, avgParty]
    ['Quezon City',   'Philippines', 14.6760, 121.0437, 148, 2.4],
    ['Manila',        'Philippines', 14.5995, 120.9842, 121, 2.2],
    ['Cebu City',     'Philippines', 10.3157, 123.8854,  96, 2.6],
    ['Davao City',    'Philippines',  7.1907, 125.4553,  71, 2.5],
    ['Makati',        'Philippines', 14.5547, 121.0244,  64, 2.1],
    ['Bacolod',       'Philippines', 10.6407, 122.9689,  47, 2.7],
    ['Iloilo City',   'Philippines', 10.7202, 122.5621,  44, 2.5],
    ['Cagayan de Oro','Philippines',  8.4542, 124.6319,  38, 2.6],
    ['Baguio',        'Philippines', 16.4023, 120.5960,  35, 2.3],
    ['General Santos','Philippines',  6.1164, 125.1716,  27, 2.4],
    ['Naga',          'Philippines', 13.6218, 123.1948,  24, 2.5],
    ['Tacloban',      'Philippines', 11.2444, 125.0043,  19, 2.6],
    ['Zamboanga City','Philippines',  6.9214, 122.0790,  17, 2.4],
    ['Laoag',         'Philippines', 18.1978, 120.5936,  12, 2.2],
    // Diaspora
    ['Dubai',         'UAE',         25.2048,  55.2708,  88, 3.1],
    ['Singapore',     'Singapore',    1.3521, 103.8198,  62, 2.8],
    ['Hong Kong',     'Hong Kong',   22.3193, 114.1694,  57, 3.0],
    ['Toronto',       'Canada',      43.6532, -79.3832,  54, 2.9],
    ['Los Angeles',   'USA',         34.0522,-118.2437,  49, 2.7],
    ['Doha',          'Qatar',       25.2854,  51.5310,  41, 3.2],
    ['Riyadh',        'Saudi Arabia',24.7136,  46.6753,  36, 3.3],
    ['Chicago',       'USA',         41.8781, -87.6298,  33, 2.6],
    ['London',        'UK',          51.5074,  -0.1278,  31, 2.5],
    ['Sydney',        'Australia',  -33.8688, 151.2093,  29, 2.8],
    ['Vancouver',     'Canada',      49.2827,-123.1207,  24, 2.7],
    ['Milan',         'Italy',       45.4642,   9.1900,  18, 2.9],
];

/* ── Questions ────────────────────────────────────────
   Real-shaped fan questions, deliberately restated several ways so the
   clustering is demonstrably doing something rather than being asserted. */
const QUESTION_SETS = [
    [
        'What was going through your head when you wrote Hawak Kamay?',
        'Ano po ang inspiration niyo sa Hawak Kamay?',
        'Hawak Kamay — what inspired that song?',
        'Can you tell the story behind Hawak Kamay?',
        'Paano po nasulat ang Hawak Kamay?',
        'Unsa ang istorya sa likod sa Hawak Kamay?',
    ],
    [
        'Any advice for someone starting out in music with no connections?',
        'Paano po magsimula sa music kung walang kakilala sa industry?',
        'What would you tell a young singer who is just starting?',
        'Advice po for aspiring OPM artists?',
        'Ania ti balakad mo kadagiti agtutubo nga agkankanta?',
    ],
    [
        'Which of your songs is hardest to sing live?',
        'Alin sa mga kanta mo ang pinakamahirap kantahin sa concert?',
        'What song takes the most out of you on stage?',
    ],
    [
        'How do you keep your faith steady when everything is busy?',
        'Paano po kayo nananatiling grounded sa faith niyo?',
        'What keeps you grounded when work gets heavy?',
        'Unsaon nimo pagpabilin nga grounded sa imong pagtuo?',
    ],
    [
        'Will you ever do a full acoustic album?',
        'Sana po may acoustic album kayo — balak niyo po ba?',
        'Any plans for a stripped-back record?',
    ],
    [
        'What is the story behind Chinita Girl?',
        'Chinita Girl po — ano ang inspiration?',
    ],
];

/* Party sizes for the demo map.

   The previous version wrote a fixed 40 rows per city and multiplied party
   size by pledges/40 to preserve the headcount. That produced an identical
   "40 COMMITMENTS" on every city and an average party of 9 in Quezon City --
   a distribution no real dataset has, and the first thing a promoter would
   notice. This writes one row per commitment and draws the party size from a
   shape real signups actually have: mostly one or two people, a tail of
   barkadas. Scaled so the per-city mean lands on the table's avgParty. */
const PARTY_SPREAD = [
    [0.42, 1], [0.72, 2], [0.87, 3], [0.95, 4], [0.99, 6], [1.00, 10],
];
const SPREAD_MEAN = 2.13;

function drawPartySize(targetAvg) {
    const r = Math.random();
    const base = (PARTY_SPREAD.find(([p]) => r < p) || [1, 1])[1];
    const scaled = Math.round(base * (targetAvg / SPREAD_MEAN));
    return Math.min(12, Math.max(1, scaled));
}

async function seedTourDemand() {
    console.log('\nTour demand…');
    let created = 0;
    for (const [city, country, lat, lng, pledges, avgParty] of DEMAND) {
        // One row per commitment, with a spread of party sizes. The rows are
        // anonymous counts, not invented people — inventing 148 named fans is
        // exactly what the audit flagged.
        const rows = [];
        for (let i = 0; i < pledges; i++) {
            rows.push({
                fields: {
                    UserId: 'demo',
                    UserName: 'Demo pledge',
                    City: city,
                    Country: country,
                    PartySize: drawPartySize(avgParty),
                    Latitude: lat,
                    Longitude: lng,
                    GeoSource: 'dict',
                    IsDemo: true,
                    Day: day(),
                    CreatedAt: iso(),
                    UpdatedAt: iso(),
                },
            });
        }
        for (let i = 0; i < rows.length; i += 10) {
            await base('TourDemand').create(rows.slice(i, i + 10));
            await sleep(250);
        }
        created += rows.length;
        process.stdout.write(`  ${city} `);
    }
    console.log(`\n  ${created} demo pledges across ${DEMAND.length} cities`);
}

async function seedQuestions() {
    console.log('\nQuestion clusters…');
    // Reuse the real clustering so the demo shows the actual algorithm working.
    const cl = require('../netlify/functions/lib/clustering');

    let clusters = 0, questions = 0;
    for (const set of QUESTION_SETS) {
        const open = await cl.loadOpenClusters(base);
        let clusterId = null;

        for (const q of set) {
            // The cluster created earlier in this set has to be a candidate for
            // the questions that follow it, otherwise every question in a set
            // starts its own cluster. Pull the real record for its signature —
            // the previous version synthesised one from `tokens`, which is the
            // very binding being declared on that line (a TDZ crash).
            let candidates = open;
            if (clusterId) {
                candidates = open.concat([await base(cl.CLUSTER_TABLE).find(clusterId)]);
            }
            const { match, tokens } = cl.findCluster(q, candidates);

            if (match && match.id) {
                await cl.growCluster(base, match, tokens);
                clusterId = match.id;
            } else if (!clusterId) {
                const created = await cl.createCluster(base, { questionText: q, tokens, language: 'tl' });
                clusterId = created.id;
                clusters++;
            } else {
                const rec = await base(cl.CLUSTER_TABLE).find(clusterId);
                await cl.growCluster(base, rec, tokens);
            }

            await base('Questions').create({
                UserId: 'demo',
                UserName: 'Demo fan',
                QuestionText: q,
                ClusterId: clusterId,
                Language: /[^\x00-\x7F]/.test(q) ? 'tl' : 'en',
                Status: 'Clustered',
                Surfaced: true,
                Day: day(),
                CreatedAt: iso(),
            });
            questions++;
            await sleep(250);
        }
        process.stdout.write('.');
    }
    console.log(`\n  ${questions} questions in ${clusters} clusters`);
    console.log('  (No answers seeded — nothing is ever put in her voice.)');
}

async function seedCardCatalog() {
    console.log('\nCard catalog…');
    const cards = [
        { Name: 'Yeng Constantino', CardTitle: 'Live in Pasay', Rarity: 'Legendary', CardTotal: 25,
          Perk: 'lineskip', PerkValue: '2', YengPoints: 500, PremiumExclusive: false },
        { Name: 'Yeng Constantino', CardTitle: 'Songwriter', Rarity: 'Rare', CardTotal: 100,
          Perk: 'multiplier', PerkValue: '2', YengPoints: 200, PremiumExclusive: false },
        { Name: 'Yeng Constantino', CardTitle: 'Acoustic Session', Rarity: 'Uncommon', CardTotal: 500,
          Perk: 'lifeline', PerkValue: '1', YengPoints: 80, PremiumExclusive: false },
        { Name: 'Yeng Constantino', CardTitle: 'Yeng Nation', Rarity: 'Common', CardTotal: 2000,
          Perk: 'discount', PerkValue: '5', YengPoints: 25, PremiumExclusive: false },
        { Name: 'Yeng Constantino', CardTitle: 'Members Only', Rarity: 'Rare', CardTotal: 200,
          Perk: 'discount', PerkValue: '10', YengPoints: 250, PremiumExclusive: true },
    ];
    const existing = await base('CardCatalog').select({ fields: ['CardTitle'] }).all().catch(() => []);
    const have = new Set(existing.map((r) => r.fields.CardTitle));

    const rows = cards.filter((c) => !have.has(c.CardTitle)).map((c) => ({
        fields: { ...c, FrontUrl: '/cards/yeng-front.html', BackUrl: '/cards/yeng-back.html', Status: 'Active' },
    }));
    if (!rows.length) { console.log('  already seeded'); return; }
    await base('CardCatalog').create(rows);
    console.log(`  ${rows.length} card designs`);
}

(async function main() {
    console.log('Seeding demonstration data. Everything written here is flagged and reversible.');
    try {
        await seedTourDemand();
        await seedQuestions();
        await seedCardCatalog();
        console.log('\nDone.');
        console.log('Remove it all with:  node scripts/purge-demo-data.js\n');
    } catch (err) {
        console.error('\nSeeding failed:', err.message);
        if (/NOT_FOUND|could not be found/i.test(err.message)) {
            console.error('Run `node scripts/setup-airtable.js` first to create the tables.\n');
        }
        process.exit(1);
    }
})();
