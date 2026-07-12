const Airtable = require('airtable');

/*
 * Scheduled hourly job. Reads the append-only ActivityEvents log, sums each
 * fan's points, ranks everyone, and rewrites the Leaderboard cache table so
 * that get-leaderboard / get-fan-score stay cheap (no on-request aggregation).
 *
 * Scoring itself lives in track-activity.js (server-authoritative). This job
 * only tallies what was already recorded, so ranks can never be gamed here.
 */

// Signal buckets we surface as per-fan breakdown counts on the cache.
const COUNT_FIELDS = {
    event_attended: 'EventsAttended',
    comment: 'Comments',
    vote: 'Votes',
    qa_question: 'QACount'
};

async function fetchAllEvents(base) {
    const events = [];
    await base('ActivityEvents').select({
        fields: ['UserId', 'UserName', 'Type', 'Points', 'CreatedAt']
    }).eachPage((records, next) => {
        events.push(...records);
        next();
    });
    return events;
}

async function fetchUserMeta(base) {
    // Denormalize avatar + tier so the leaderboard renders without extra joins.
    const meta = {};
    await base('Users').select({
        fields: ['Name', 'Username', 'Avatar', 'MembershipTier']
    }).eachPage((records, next) => {
        records.forEach(r => {
            meta[r.id] = {
                name: r.fields.Name || r.fields.Username || 'Fan',
                avatar: r.fields.Avatar || '',
                tier: r.fields.MembershipTier || 'Free'
            };
        });
        next();
    });
    return meta;
}

exports.handler = async () => {
    try {
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const [events, userMeta] = await Promise.all([
            fetchAllEvents(base),
            fetchUserMeta(base)
        ]);

        // Aggregate points + signal counts per user.
        const tally = {};
        for (const rec of events) {
            const f = rec.fields;
            const uid = f.UserId;
            if (!uid) continue;

            if (!tally[uid]) {
                tally[uid] = {
                    userId: uid,
                    userName: f.UserName || 'Fan',
                    score: 0,
                    EventsAttended: 0,
                    Comments: 0,
                    Votes: 0,
                    QACount: 0
                };
            }
            tally[uid].score += Number(f.Points) || 0;

            const countField = COUNT_FIELDS[f.Type];
            if (countField) tally[uid][countField] += 1;

            // Prefer the freshest denormalized name we saw in the log.
            if (f.UserName) tally[uid].userName = f.UserName;
        }

        // Rank: highest score first.
        const ranked = Object.values(tally).sort((a, b) => b.score - a.score);
        ranked.forEach((row, i) => { row.rank = i + 1; });

        const now = new Date().toISOString();

        // Wipe the existing cache, then rewrite. Simpler + safer than diffing
        // and the row count (one per active fan) stays small.
        const stale = [];
        await base('Leaderboard').select({ fields: ['UserId'] }).eachPage((records, next) => {
            stale.push(...records.map(r => r.id));
            next();
        });
        for (let i = 0; i < stale.length; i += 10) {
            await base('Leaderboard').destroy(stale.slice(i, i + 10));
        }

        // Insert fresh ranked rows (batches of 10, throttled for the 5 req/s cap).
        const rows = ranked.map(row => {
            const meta = userMeta[row.userId] || {};
            return {
                fields: {
                    UserId: row.userId,
                    UserName: meta.name || row.userName,
                    Avatar: meta.avatar || '',
                    Tier: meta.tier || 'Free',
                    Score: row.score,
                    Rank: row.rank,
                    EventsAttended: row.EventsAttended,
                    Comments: row.Comments,
                    Votes: row.Votes,
                    QACount: row.QACount,
                    UpdatedAt: now
                }
            };
        });
        for (let i = 0; i < rows.length; i += 10) {
            await base('Leaderboard').create(rows.slice(i, i + 10));
            await new Promise(r => setTimeout(r, 250));
        }

        return { statusCode: 200, body: JSON.stringify({ computed: rows.length, at: now }) };
    } catch (error) {
        console.error('Compute leaderboard error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to compute leaderboard' }) };
    }
};
