#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   SETUP — create every missing table and field
   ═══════════════════════════════════════════════════════

   Idempotent and resume-safe: it reads the live schema first, creates only
   what is absent, and never modifies or deletes an existing field.

   Why this exists: the previous release shipped four functions writing to
   `Leaderboard` and `ActivityEvents`, neither of which existed in the base.
   Every point ever "earned" went nowhere and nobody found out. Tables should
   be created from a checked-in definition, not by hand in the Airtable UI.

     node scripts/setup-airtable.js
     node scripts/setup-airtable.js --dry

   Needs a PAT with `schema.bases:read` and `schema.bases:write`.
   ═══════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

/* ── .env loader (no dotenv dependency) ── */
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

const KEY = process.env.AIRTABLE_API_KEY;
const BASE = process.env.AIRTABLE_BASE_ID;
const DRY = process.argv.includes('--dry');

if (!KEY || !BASE) {
    console.error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID.');
    process.exit(1);
}

/* ── Field shorthands ── */
const text = (name) => ({ name, type: 'singleLineText' });
const long = (name) => ({ name, type: 'multilineText' });
const num = (name, precision = 0) => ({ name, type: 'number', options: { precision } });
const check = (name) => ({ name, type: 'checkbox', options: { color: 'greenBright', icon: 'check' } });
const url = (name) => ({ name, type: 'url' });
const date = (name) => ({ name, type: 'date', options: { dateFormat: { name: 'iso' } } });
const stamp = (name) => ({
    name, type: 'dateTime',
    options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' },
});
const select = (name, choices) => ({
    name, type: 'singleSelect',
    options: { choices: choices.map((c) => ({ name: c })) },
});

/* ── Table definitions ──
   First field becomes the primary field, so it must be a text type. */
const TABLES = {
    YengPoints: [
        text('UserId'), text('UserName'),
        select('Type', ['site_visit','question_asked','question_clustered','cluster_answered',
            'ranking_session','game_played','lyric_round','trivia_daily','setlist_submitted',
            'setlist_scored','tour_pledge','comment','vote','archive_search','event_attended',
            'membership_grant','purchase','promote_question','mini_game_retry','refund']),
        num('Amount'), text('Reason'), text('RefTable'), text('RefId'), text('RefundOf'),
        date('Day'), stamp('CreatedAt'),
    ],

    Questions: [
        long('QuestionText'), text('UserId'), text('UserName'), text('ClusterId'),
        select('Language', ['en','tl','ceb','ilo']),
        select('Status', ['Clustered','Held','Answered']),
        check('Surfaced'), date('Day'), stamp('CreatedAt'),
    ],

    QuestionClusters: [
        long('MergedQuestion'), long('Signature'), text('Topic'), num('QuestionCount'),
        select('Status', ['Open','Shortlisted','Answered','Passed','Merged']),
        check('Promoted'), num('PromotionCount'),
        select('Language', ['en','tl','ceb','ilo']),
        check('TextRefreshed'), text('MergedInto'),
        stamp('AnsweredAt'), stamp('PassedAt'), url('AnswerAudioUrl'), long('AnswerTranscript'),
        text('ArchiveId'), text('PassReason'), stamp('CreatedAt'), stamp('UpdatedAt'),
    ],

    Promotions: [
        text('ClusterId'), text('UserId'), text('UserName'), num('PointsSpent'),
        text('LedgerId'), select('Status', ['Active','Refunded']),
        stamp('CycleStart'), stamp('CreatedAt'), stamp('RefundedAt'),
    ],

    ModerationFlags: [
        text('UserId'), text('UserName'),
        select('Category', ['mean','sexual','intrusive']),
        long('Excerpt'), stamp('CreatedAt'),
    ],

    ModerationState: [
        text('UserId'), text('UserName'), num('Tier'), text('Category'),
        num('FlagCount'), check('Shadowbanned'), num('NotifiedAtTier'), stamp('UpdatedAt'),
    ],

    Archive: [
        text('Title'),
        select('Kind', ['Answer','Interview','Performance','Other']),
        text('Source'), url('SourceUrl'), url('AudioUrl'), num('DurationSeconds'),
        long('Transcript'), long('TranscriptPlain'),
        select('TranscriptStatus', ['Pending','Queued','Running','Done','Failed','Provided']),
        text('TranscriptError'),
        select('Language', ['en','tl','ceb','ilo']),
        text('ClusterId'), num('ClusterSize'), check('Verified'), text('Signature'),
        select('Status', ['Candidate','Approved','Skipped']),
        long('Excerpt'), text('ApprovedBy'), text('SkippedBy'),
        stamp('RecordedAt'), stamp('PublishedAt'), stamp('ApprovedAt'),
        stamp('SkippedAt'), stamp('TranscribedAt'), stamp('CreatedAt'),
    ],

    TourDemand: [
        text('City'), text('Country'), text('UserId'), text('UserName'), num('PartySize'),
        num('Latitude', 6), num('Longitude', 6),
        select('GeoSource', ['dict','nominatim','unresolved']),
        check('IsDemo'), date('Day'), stamp('CreatedAt'), stamp('UpdatedAt'),
    ],

    Notifications: [
        text('Title'), text('UserId'), text('UserName'),
        select('Kind', ['cluster_answered','moderation','card_drop','info']),
        long('Body'), text('LinkUrl'), text('ClusterId'),
        check('Read'), stamp('CreatedAt'), stamp('ReadAt'),
    ],

    SongRankings: [
        text('SongTitle'), text('SongId'), num('Rating'), num('Appearances'), num('Wins'), stamp('UpdatedAt'),
    ],

    SongVotes: [
        text('WinnerTitle'), text('UserId'), text('UserName'), text('WinnerId'),
        text('LoserId'), text('LoserTitle'), text('City'), text('Country'),
        date('Day'), stamp('CreatedAt'),
    ],

    GameSessions: [
        text('UserName'), text('UserId'),
        select('Game', ['millionaire','lyric']),
        select('State', ['active','banked','won','lost']),
        num('Level'), num('PointsWon'), long('Questions'),
        long('LifelinesAvailable'), long('LifelinesUsed'), num('ElapsedSeconds', 1),
        date('Day'), stamp('StartedAt'), stamp('EndedAt'),
    ],

    Lyrics: [
        text('SongTitle'), long('PromptLine'), long('AnswerLine'),
        url('AudioUrl'), num('AudioStart', 1), num('AudioSeconds'),
        select('Status', ['Active','Draft']),
    ],

    SetlistPicks: [
        text('EventTitle'), text('EventId'), text('City'), text('UserId'), text('UserName'),
        long('SongIds'), num('Correct'), num('Accuracy'), check('Scored'),
        date('Day'), stamp('CreatedAt'), stamp('UpdatedAt'), stamp('ScoredAt'),
    ],

    CardCatalog: [
        text('Name'), text('CardTitle'),
        select('Rarity', ['Common','Uncommon','Rare','Legendary']),
        num('CardTotal'), text('FrontUrl'), text('BackUrl'),
        select('Perk', ['discount','multiplier','lifeline','lineskip']),
        text('PerkValue'), num('YengPoints'), check('PremiumExclusive'),
        select('Status', ['Active','Retired']),
    ],

    CardOwnership: [
        text('CardName'), text('UserId'), text('UserName'), text('CardId'),
        select('Rarity', ['Common','Uncommon','Rare','Legendary']),
        num('Serial'), text('Source'), stamp('AcquiredAt'),
    ],

    CardDrops: [
        text('UserName'), text('UserId'), text('CardId'), text('Reason'),
        text('Tier'), text('Rarity'), date('Day'), stamp('CreatedAt'),
    ],

    Translations: [
        text('RecordId'),
        select('Language', ['en','tl','ceb','ilo']),
        text('Field'), long('Value'), text('ApprovedBy'), stamp('UpdatedAt'),
    ],

    /* These two were referenced by shipped code but never existed. */
    ActivityEvents: [
        text('UserName'), text('UserId'), text('Type'), num('Points'),
        long('Metadata'), stamp('CreatedAt'),
    ],

    Leaderboard: [
        text('UserName'), text('UserId'), url('Avatar'), text('Tier'),
        num('Score'), num('Rank'), num('EventsAttended'), num('Comments'),
        num('Votes'), num('QACount'), stamp('UpdatedAt'),
    ],
};

/* Fields to add to tables that already exist. */
const ADDITIONS = {
    Users: [num('PointsBalance'), stamp('AcceptedTermsAt')],
    Events: [check('SetlistScored'), long('ActualSetlist'), stamp('SetlistScoredAt')],
    MessageRequests: [stamp('PaidAt'), num('AmountPaid'), stamp('RefundedAt')],
    Memberships: [stamp('PaidAt')],
};

const API = 'https://api.airtable.com/v0/meta/bases/' + BASE + '/tables';

async function req(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: 'Bearer ' + KEY,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error((body.error && (body.error.message || body.error.type)) || res.statusText);
        err.status = res.status;
        err.body = body;
        throw err;
    }
    return body;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function main() {
    console.log(`\nBase ${BASE}${DRY ? '  (dry run — nothing will change)' : ''}\n`);

    let schema;
    try {
        schema = await req(API);
    } catch (err) {
        if (err.status === 403 || err.status === 404) {
            console.error('Could not read the base schema.\n');
            console.error('The PAT needs the `schema.bases:read` and `schema.bases:write` scopes.');
            console.error('Add them at: Airtable → Developer hub → your token → Scopes,');
            console.error('and make sure this base is in the token\'s Access list.\n');
            process.exit(1);
        }
        throw err;
    }

    const existing = new Map(schema.tables.map((t) => [t.name, t]));
    let created = 0, fieldsAdded = 0, skipped = 0;

    /* ── New tables ── */
    for (const [name, fields] of Object.entries(TABLES)) {
        if (existing.has(name)) {
            // Table is there — top up any missing fields.
            const have = new Set(existing.get(name).fields.map((f) => f.name));
            const missing = fields.filter((f) => !have.has(f.name));
            if (!missing.length) { skipped++; continue; }
            console.log(`~ ${name}: adding ${missing.length} field(s)`);
            for (const f of missing) {
                if (DRY) { console.log(`    + ${f.name} (${f.type})`); fieldsAdded++; continue; }
                try {
                    await req(`${API}/${existing.get(name).id}/fields`, {
                        method: 'POST', body: JSON.stringify(f),
                    });
                    console.log(`    + ${f.name}`);
                    fieldsAdded++;
                    await sleep(220);
                } catch (err) {
                    console.log(`    ! ${f.name} — ${err.message}`);
                }
            }
            continue;
        }

        console.log(`+ ${name} (${fields.length} fields)`);
        if (DRY) { created++; continue; }
        try {
            await req(API, {
                method: 'POST',
                body: JSON.stringify({ name, fields }),
            });
            created++;
            await sleep(320);
        } catch (err) {
            console.log(`  ! could not create ${name} — ${err.message}`);
        }
    }

    /* ── Additions to existing tables ── */
    for (const [name, fields] of Object.entries(ADDITIONS)) {
        const table = existing.get(name);
        if (!table) { console.log(`? ${name} does not exist — skipping its additions`); continue; }
        const have = new Set(table.fields.map((f) => f.name));
        const missing = fields.filter((f) => !have.has(f.name));
        if (!missing.length) continue;
        console.log(`~ ${name}: adding ${missing.length} field(s)`);
        for (const f of missing) {
            if (DRY) { console.log(`    + ${f.name} (${f.type})`); fieldsAdded++; continue; }
            try {
                await req(`${API}/${table.id}/fields`, { method: 'POST', body: JSON.stringify(f) });
                console.log(`    + ${f.name}`);
                fieldsAdded++;
                await sleep(220);
            } catch (err) {
                console.log(`    ! ${f.name} — ${err.message}`);
            }
        }
    }

    console.log(`\n${created} table(s) created, ${fieldsAdded} field(s) added, ${skipped} already complete.`);
    if (DRY) console.log('Dry run — nothing was written.');
    else console.log('\nNext: node scripts/seed-demo-data.js   (optional, for the pitch)');
    console.log('');
})().catch((err) => {
    console.error('\nSetup failed:', err.message);
    process.exit(1);
});
