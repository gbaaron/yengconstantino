#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   SEED — showcase data for the pitch
   ═══════════════════════════════════════════════════════

   seed-demo-data.js fills the three fan surfaces. This fills everything
   else, so the games, cards, leaderboard, activity feed and archive are
   demonstrable instead of empty.

   Reversible in one command:
       node scripts/seed-showcase-data.js
       node scripts/purge-demo-data.js

   ── The lines this script does not cross ──────────────────────────────

   NO WORDS IN HER MOUTH. The Archive is the hard case: it is the one
   surface whose entire point is that the text on it is verbatim hers. So
   the seeded transcripts are third-person descriptions of what a segment
   covers, prefixed [demo transcript], never first-person speech. They
   render the timestamp rail, the cue list, the verified stamp and the
   play-from-second affordance, and they are searchable — which is the
   whole design — without a single fabricated quote.

   NO REAL LYRICS. Finish the Lyric needs lyric text, and reproducing OPM
   lyrics is a licensing problem, not a design one. The seeded rounds are
   original placeholder couplets under an explicitly non-real song title,
   so nothing is ever attributed to her. Swap in licensed content later.

   NO INVENTED PEOPLE. Demo fans are fandom-style handles, not
   "Grace Santos, 24, Dubai". A handle is a plausible account. A name plus
   a home city is a fabricated person.

   SONG TITLES COME FROM THE MusicContent TABLE, not from memory. An earlier
   draft listed them by hand and had "Chinita Girl" instead of "Chinito".
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
const iso = (d) => (d || new Date()).toISOString();
const day = (d) => iso(d).slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rint = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** Airtable takes 10 records per create and rate-limits at 5 req/sec. */
async function createAll(table, rows, label) {
    let n = 0;
    for (let i = 0; i < rows.length; i += 10) {
        await base(table).create(rows.slice(i, i + 10));
        n += Math.min(10, rows.length - i);
        await sleep(230);
    }
    console.log(`  ${label || table}: ${n}`);
    return n;
}

async function count(table, formula) {
    const out = [];
    await base(table).select(formula ? { filterByFormula: formula } : {})
        .eachPage((recs, next) => { out.push(...recs); next(); });
    return out;
}

/* ── Demo fans ────────────────────────────────────────
   Handles, not identities. Cities are attached to votes (which are
   aggregate signal) and never used to construct a person.            */
const FANS = [
    { id: 'demo-01', name: 'yengster_ph',    tier: 'Ikaw Lamang',      city: 'Quezon City', country: 'Philippines' },
    { id: 'demo-02', name: 'hawakkamay04',   tier: 'Laging Nandito',   city: 'Cebu City',   country: 'Philippines' },
    { id: 'demo-03', name: 'opm_forever',    tier: 'Laging Nandito',   city: 'Davao City',  country: 'Philippines' },
    { id: 'demo-04', name: 'dubai_yengster', tier: 'Ikaw Lamang',      city: 'Dubai',       country: 'UAE' },
    { id: 'demo-05', name: 'chinitagurl',    tier: 'Sariwang Simula',  city: 'Manila',      country: 'Philippines' },
    { id: 'demo-06', name: 'tita_ng_opm',    tier: 'Laging Nandito',   city: 'Toronto',     country: 'Canada' },
    { id: 'demo-07', name: 'bisdak_sings',   tier: 'Sariwang Simula',  city: 'Cebu City',   country: 'Philippines' },
    { id: 'demo-08', name: 'sgyengfam',      tier: 'Laging Nandito',   city: 'Singapore',   country: 'Singapore' },
    { id: 'demo-09', name: 'jeepneylovestry',tier: 'Free',             city: 'Bacolod',     country: 'Philippines' },
    { id: 'demo-10', name: 'kuya_acoustic',  tier: 'Sariwang Simula',  city: 'Baguio',      country: 'Philippines' },
    { id: 'demo-11', name: 'riyadh_kabayan', tier: 'Laging Nandito',   city: 'Riyadh',      country: 'Saudi Arabia' },
    { id: 'demo-12', name: 'lapit_lang',     tier: 'Free',             city: 'Iloilo City', country: 'Philippines' },
    { id: 'demo-13', name: 'hk_yengnation',  tier: 'Sariwang Simula',  city: 'Hong Kong',   country: 'Hong Kong' },
    { id: 'demo-14', name: 'ilocano_ako',    tier: 'Free',             city: 'Laoag',       country: 'Philippines' },
    { id: 'demo-15', name: 'chicago_opm',    tier: 'Ikaw Lamang',      city: 'Chicago',     country: 'USA' },
    { id: 'demo-16', name: 'sandata_fan',    tier: 'Free',             city: 'Naga',        country: 'Philippines' },
];

/* ── Catalogue ────────────────────────────────────────
   Read from the MusicContent table rather than hand-written. An earlier
   draft of this file listed titles from memory and got one wrong -- it had
   "Chinita Girl" when the song is "Chinito". Guessing a living artist's
   discography on a page pitched to her management is not a risk worth
   taking, so the source of truth is the table.                         */
let SONGS = [];

async function loadSongs() {
    const rows = await count('MusicContent');
    SONGS = rows
        .map((r) => ({
            title: r.fields.Title,
            id: r.id,
            year: r.fields.Year || null,
            era: r.fields.Era || '',
        }))
        .filter((s) => s.title);
    if (!SONGS.length) throw new Error('MusicContent is empty — nothing to rank.');
    console.log(`  catalogue: ${SONGS.length} real songs (${SONGS.map((s) => s.title).join(', ')})`);
}

/* ── Archive ──────────────────────────────────────────
   Metadata is real and checkable. Transcript text is a third-person
   description of the segment, never speech. See the header.           */
const ARCHIVE = [
    {
        title: 'Pinoy Dream Academy — grand finals night',
        kind: 'Performance', source: 'ABS-CBN', year: 2006, secs: 268, lang: 'tl',
        cues: [
            'the final performance of the season, before the grand star dreamer result was announced',
            'the moment the result is read out and the crowd reaction that follows',
            'closing remarks from the hosts as the season ends',
        ],
    },
    {
        title: 'On writing at nineteen — radio interview',
        kind: 'Interview', source: 'OPM radio', year: 2008, secs: 842, lang: 'tl',
        cues: [
            'a segment about starting out with no industry connections and writing songs in a bedroom',
            'discussion of what changed after the first album and how the workload shifted',
            'a question about staying motivated when music felt uncertain as a career',
            'closing segment covering plans for the next record',
        ],
    },
    {
        title: 'Hawak Kamay — the writing process',
        kind: 'Interview', source: 'MYX', year: 2010, secs: 1124, lang: 'en',
        cues: [
            'a segment on how the song came together and how quickly it was written',
            'discussion of what listeners assume the song is about versus what prompted it',
            'the arrangement choices made in the studio and why the demo was kept',
            'audience questions about performing the song live years later',
        ],
    },
    {
        title: 'Acoustic session — three songs, one take',
        kind: 'Performance', source: 'Studio session', year: 2013, secs: 631, lang: 'tl',
        cues: [
            'an unaccompanied opening before the guitar comes in',
            'a stripped-back arrangement of a track from the second album',
            'closing song of the session and a short word to the room',
        ],
    },
    {
        title: 'On faith, touring and staying grounded',
        kind: 'Interview', source: 'Podcast', year: 2016, secs: 2410, lang: 'tl',
        cues: [
            'a segment about keeping faith steady while the schedule is heavy',
            'discussion of how touring changed her relationship with the songs',
            'a question about which songs are hardest to sing live and why',
            'reflection on the fans who have followed since the 2006 season',
            'closing segment on what she wants the next decade to look like',
        ],
    },
    {
        title: 'Chinita Girl — ten years on',
        kind: 'Interview', source: 'Magazine', year: 2018, secs: 954, lang: 'en',
        cues: [
            'the origin of the song and what prompted it at the time',
            'how the reception changed over a decade of performing it',
            'a segment on whether older songs get rearranged for current sets',
        ],
    },
    {
        title: 'Live in Pasay — full set',
        kind: 'Performance', source: 'Concert', year: 2019, secs: 5280, lang: 'tl',
        cues: [
            'opening number and the crowd singing the first chorus back',
            'a mid-set acoustic block performed solo',
            'the audience singalong section before the encore',
            'encore and closing remarks to the room',
        ],
    },
    {
        title: 'On songwriting and the years since',
        kind: 'Interview', source: 'Online interview', year: 2022, secs: 1680, lang: 'tl',
        cues: [
            'a segment about writing melody first versus words first',
            'discussion of advice for someone starting out in music today',
            'reflection on what twenty years of an archive would be worth',
            'closing thoughts on an acoustic record',
        ],
    },
];

/* ── Placeholder lyric rounds ─────────────────────────
   Original couplets under an explicitly non-real title, so the mechanic
   is demonstrable and nothing is attributed to her. Replace with
   licensed content before launch.                                     */
const LYRIC_ROUNDS = [
    { prompt: 'Demo round one, the line before the chorus', answer: 'and the placeholder answer line completes it' },
    { prompt: 'Demo round two, an opening line', answer: 'followed by its placeholder second line' },
    { prompt: 'Demo round three, a bridge line', answer: 'resolving into a placeholder closing line' },
    { prompt: 'Demo round four, the first half of a couplet', answer: 'and the second half of that couplet' },
    { prompt: 'Demo round five, a verse opener', answer: 'with a placeholder line to finish the verse' },
];

const POINT_TYPES = [
    ['site_visit', 2, 'Daily visit'],
    ['ranking_session', 6, 'Finished a song ranking session'],
    ['game_played', 10, 'Played Yeng Millionaire'],
    ['lyric_round', 4, 'Finished a lyric round'],
    ['tour_pledge', 15, 'Asked for a show'],
    ['question_asked', 8, 'Asked a question'],
    ['setlist_submitted', 12, 'Submitted a setlist prediction'],
    ['archive_search', 1, 'Searched the archive'],
    ['trivia_daily', 20, 'Daily trivia'],
];

/* ═══════════════════════════════════════════════════════
   SEEDERS
   ═══════════════════════════════════════════════════════ */

async function seedSongs() {
    console.log('\nSong catalogue…');
    if ((await count('SongRankings')).length) {
        console.log('  already seeded'); return;
    }
    // Elo spread that looks like real play: a clear top tier, a long middle,
    // and a couple that keep losing. Uniform ratings read as fake.
    const rows = SONGS.map((song, i) => {
        const apps = rint(40, 260);
        const winRate = Math.max(0.18, Math.min(0.82, 0.72 - i * 0.038 + (Math.random() - 0.5) * 0.12));
        return {
            fields: {
                SongTitle: song.title,
                SongId: song.id,
                Rating: Math.round(1500 + (winRate - 0.5) * 620 + (Math.random() - 0.5) * 40),
                Appearances: apps,
                Wins: Math.round(apps * winRate),
                UpdatedAt: iso(daysAgo(rint(0, 6))),
            },
        };
    });
    await createAll('SongRankings', rows, 'songs');
}

async function seedVotes() {
    console.log('\nHead-to-head votes…');
    if ((await count('SongVotes', "FIND('demo-', {UserId}) = 1")).length) {
        console.log('  already seeded'); return;
    }
    const rows = [];
    for (let i = 0; i < 180; i++) {
        const fan = pick(FANS);
        let a = rint(0, SONGS.length - 1), b = rint(0, SONGS.length - 1);
        while (b === a) b = rint(0, SONGS.length - 1);
        // Lower index = more popular, so it wins more often. Not always.
        const aWins = Math.random() < (a < b ? 0.68 : 0.32);
        const w = aWins ? a : b, l = aWins ? b : a;
        const when = daysAgo(rint(0, 45));
        rows.push({
            fields: {
                WinnerTitle: SONGS[w].title, WinnerId: SONGS[w].id,
                LoserTitle: SONGS[l].title,  LoserId:  SONGS[l].id,
                UserId: fan.id, UserName: fan.name,
                City: fan.city, Country: fan.country,
                Day: day(when), CreatedAt: iso(when),
            },
        });
    }
    await createAll('SongVotes', rows, 'votes');
}

async function seedArchive() {
    console.log('\nArchive…');
    if ((await count('Archive', "{ApprovedBy} = 'demo'")).length) {
        console.log('  already seeded'); return;
    }
    const rows = ARCHIVE.map((a) => {
        // Spread the cues across the real duration so the timestamp rail and
        // the play-from-second links land on plausible offsets.
        const step = Math.floor(a.secs / (a.cues.length + 1));
        const cues = a.cues.map((text, i) => ({
            t: step * (i + 1) + rint(-8, 8),
            text: '[demo transcript] ' + text,
        }));
        const recorded = new Date(Date.UTC(a.year, rint(0, 11), rint(1, 28)));
        return {
            fields: {
                Title: a.title,
                Kind: a.kind,
                Source: a.source,
                DurationSeconds: a.secs,
                Language: a.lang,
                Transcript: JSON.stringify(cues),
                TranscriptPlain: cues.map((c) => c.text).join(' '),
                TranscriptStatus: 'Provided',
                Verified: true,
                Status: 'Approved',
                Excerpt: cues[0].text,
                ApprovedBy: 'demo',
                Signature: 'demo' + Math.random().toString(16).slice(2, 12) + Math.random().toString(16).slice(2, 12),
                RecordedAt: iso(recorded),
                ApprovedAt: iso(daysAgo(rint(1, 30))),
                CreatedAt: iso(daysAgo(rint(30, 60))),
            },
        };
    });
    await createAll('Archive', rows, 'archive items');
    console.log('  (Transcripts describe each segment. None of them are her words.)');
}

async function seedLyrics() {
    console.log('\nLyric rounds…');
    if ((await count('Lyrics', "FIND('Demo round', {SongTitle}) = 1")).length) {
        console.log('  already seeded'); return;
    }
    const rows = LYRIC_ROUNDS.map((r, i) => ({
        fields: {
            SongTitle: 'Demo round ' + (i + 1) + ' (placeholder, not a real song)',
            PromptLine: r.prompt,
            AnswerLine: r.answer,
            Status: 'Active',
        },
    }));
    await createAll('Lyrics', rows, 'rounds');
    console.log('  (Placeholder text — swap in licensed lyrics before launch.)');
}

async function seedPointsAndActivity() {
    console.log('\nPoints ledger and activity…');
    if ((await count('YengPoints', "FIND('demo-', {UserId}) = 1")).length) {
        console.log('  already seeded'); return;
    }
    const ledger = [];
    const activity = [];
    const totals = new Map();

    for (const fan of FANS) {
        // Heavier users near the top of the list, so the leaderboard has shape.
        const n = rint(8, 46) + (FANS.indexOf(fan) < 5 ? rint(20, 50) : 0);
        for (let i = 0; i < n; i++) {
            const [type, amount, reason] = pick(POINT_TYPES);
            const when = daysAgo(rint(0, 55));
            ledger.push({
                fields: {
                    UserId: fan.id, UserName: fan.name,
                    Type: type, Amount: amount, Reason: reason,
                    Day: day(when), CreatedAt: iso(when),
                },
            });
            totals.set(fan.id, (totals.get(fan.id) || 0) + amount);
            if (Math.random() < 0.35) {
                activity.push({
                    fields: {
                        UserId: fan.id, UserName: fan.name,
                        Type: type, Points: amount,
                        Metadata: JSON.stringify({ city: fan.city, demo: true }),
                        CreatedAt: iso(when),
                    },
                });
            }
        }
    }
    await createAll('YengPoints', ledger, 'ledger rows');
    await createAll('ActivityEvents', activity, 'activity events');
    return totals;
}

async function seedLeaderboard(totals) {
    console.log('\nLeaderboard…');
    if ((await count('Leaderboard', "FIND('demo-', {UserId}) = 1")).length) {
        console.log('  already seeded'); return;
    }
    const ranked = FANS
        .map((f) => ({ f, score: (totals && totals.get(f.id)) || rint(80, 900) }))
        .sort((a, b) => b.score - a.score);
    const rows = ranked.map(({ f, score }, i) => ({
        fields: {
            UserId: f.id, UserName: f.name, Tier: f.tier,
            Score: score, Rank: i + 1,
            EventsAttended: rint(0, 4),
            Comments: rint(0, 38),
            Votes: rint(2, 46),
            QACount: rint(0, 9),
            UpdatedAt: iso(daysAgo(0)),
        },
    }));
    await createAll('Leaderboard', rows, 'ranked fans');
}

async function seedCards() {
    console.log('\nCard ownership…');
    if ((await count('CardOwnership', "FIND('demo-', {UserId}) = 1")).length) {
        console.log('  already seeded'); return;
    }
    const catalog = await count('CardCatalog');
    if (!catalog.length) { console.log('  no card catalog — run seed-demo-data.js first'); return; }

    const owned = [];
    const drops = [];
    const serials = new Map();
    const REASONS = [
        ['ranking_session', 'Finished a ranking session'],
        ['tour_pledge', 'Asked for a show'],
        ['question_asked', 'Asked a question'],
        ['trivia_daily', 'Daily trivia streak'],
        ['setlist_submitted', 'Submitted a setlist'],
    ];

    for (const fan of FANS) {
        const n = rint(0, 4);
        const seen = new Set();
        for (let i = 0; i < n; i++) {
            const card = pick(catalog);
            if (seen.has(card.id)) continue;
            seen.add(card.id);
            const rarity = card.fields.Rarity || 'Common';
            const serial = (serials.get(card.id) || 0) + 1;
            serials.set(card.id, serial);
            const [reason, label] = pick(REASONS);
            const when = daysAgo(rint(0, 40));
            owned.push({
                fields: {
                    CardId: card.id,
                    CardName: card.fields.CardTitle || card.fields.Name || 'Card',
                    UserId: fan.id, UserName: fan.name,
                    Rarity: rarity, Serial: serial,
                    Source: reason, AcquiredAt: iso(when),
                },
            });
            drops.push({
                fields: {
                    UserId: fan.id, UserName: fan.name,
                    CardId: card.id, Reason: label,
                    Tier: fan.tier, Rarity: rarity,
                    Day: day(when), CreatedAt: iso(when),
                },
            });
        }
    }
    await createAll('CardOwnership', owned, 'cards owned');
    await createAll('CardDrops', drops, 'drops');
}

async function seedGameSessions() {
    console.log('\nGame sessions…');
    if ((await count('GameSessions', "FIND('demo-', {UserId}) = 1")).length) {
        console.log('  already seeded'); return;
    }
    const rows = [];
    for (let i = 0; i < 60; i++) {
        const fan = pick(FANS);
        const game = Math.random() < 0.6 ? 'millionaire' : 'lyric';
        const state = pick(['banked', 'banked', 'lost', 'lost', 'won', 'active']);
        const level = state === 'won' ? 15 : rint(1, 13);
        const when = daysAgo(rint(0, 40));
        rows.push({
            fields: {
                UserId: fan.id, UserName: fan.name,
                Game: game, State: state, Level: level,
                PointsWon: state === 'lost' ? 0 : level * rint(6, 22),
                ElapsedSeconds: rint(45, 480),
                Day: day(when),
                StartedAt: iso(when),
                EndedAt: state === 'active' ? undefined : iso(new Date(when.getTime() + rint(60, 500) * 1000)),
            },
        });
    }
    await createAll('GameSessions', rows, 'sessions');
}

async function seedNotifications() {
    console.log('\nNotifications…');
    if ((await count('Notifications', "FIND('demo-', {UserId}) = 1")).length) {
        console.log('  already seeded'); return;
    }
    const rows = [];
    for (const fan of FANS.slice(0, 9)) {
        const when = daysAgo(rint(0, 12));
        const kind = pick(['card_drop', 'card_drop', 'info', 'cluster_answered']);
        rows.push({
            fields: {
                UserId: fan.id, UserName: fan.name, Kind: kind,
                Title: kind === 'card_drop' ? 'A card dropped'
                     : kind === 'cluster_answered' ? 'A question you joined was answered'
                     : 'Your points were updated',
                Body: kind === 'card_drop' ? 'You earned a card for finishing a ranking session.'
                     : kind === 'cluster_answered' ? 'Open it to hear the original recording.'
                     : 'Points from this week have been added to your balance.',
                LinkUrl: kind === 'card_drop' ? '/cards.html' : '/ask.html',
                Read: Math.random() < 0.5,
                CreatedAt: iso(when),
            },
        });
    }
    await createAll('Notifications', rows, 'notifications');
}

/* ═══════════════════════════════════════════════════════ */

(async function main() {
    console.log('Seeding showcase data. Everything written here is flagged and reversible.');
    try {
        await loadSongs();
        await seedSongs();
        await seedVotes();
        await seedArchive();
        await seedLyrics();
        const totals = await seedPointsAndActivity();
        await seedLeaderboard(totals);
        await seedCards();
        await seedGameSessions();
        await seedNotifications();
        console.log('\nDone.');
        console.log('Remove it all with:  node scripts/purge-demo-data.js');
    } catch (err) {
        console.error('\nSeeding failed:', err.message);
        process.exit(1);
    }
})();
