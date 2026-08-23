const Airtable = require('airtable');
const jwt = require('jsonwebtoken');

function verifyToken(event) {
    const auth = event.headers.authorization;
    if (!auth) return null;
    try {
        return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET);
    } catch { return null; }
}


/* Missing-table guard.
   `Leaderboard` and `ActivityEvents` do not exist in the base — the commit
   that shipped these functions never created them, so every request 500'd and
   every point "earned" went nowhere (AUDIT.md §0). Until
   `node scripts/setup-airtable.js` runs, return an honest empty state rather
   than a server error. */
function isMissingTable(err) {
    if (!err) return false;
    const code = err.error || err.type || '';
    return code === 'NOT_FOUND' || code === 'NOT_AUTHORIZED' ||
        code === 'TABLE_NOT_FOUND' || code === 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND' ||
        err.statusCode === 404 ||
        (err.statusCode === 403 && /INVALID_PERMISSIONS|MODEL_NOT_FOUND|NOT_AUTHORIZED|not authorized/i.test((err.message || '') + code));
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const decoded = verifyToken(event);
    if (!decoded) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    try {
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // The cache (rebuilt hourly by compute-leaderboard) is the fast path.
        const cached = await base('Leaderboard').select({
            filterByFormula: `{UserId} = '${decoded.userId}'`,
            maxRecords: 1
        }).firstPage();

        // Total fan count so the widget can show "Rank 4 of 128".
        let totalFans = 0;
        await base('Leaderboard').select({ fields: ['UserId'] }).eachPage((records, next) => {
            totalFans += records.length;
            next();
        });

        if (cached.length > 0) {
            const f = cached[0].fields;
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    score: f.Score || 0,
                    rank: f.Rank || null,
                    totalFans,
                    tier: f.Tier || 'Free',
                    breakdown: {
                        eventsAttended: f.EventsAttended || 0,
                        comments: f.Comments || 0,
                        votes: f.Votes || 0,
                        qaQuestions: f.QACount || 0
                    },
                    updatedAt: f.UpdatedAt || null
                })
            };
        }

        // Cache miss (brand-new fan before the first hourly run): aggregate the
        // raw log on the fly so the widget still shows a live number.
        const breakdown = { eventsAttended: 0, comments: 0, votes: 0, qaQuestions: 0 };
        let score = 0;
        const countMap = {
            event_attended: 'eventsAttended', comment: 'comments',
            vote: 'votes', qa_question: 'qaQuestions'
        };
        await base('ActivityEvents').select({
            filterByFormula: `{UserId} = '${decoded.userId}'`,
            fields: ['Type', 'Points']
        }).eachPage((records, next) => {
            records.forEach(r => {
                score += Number(r.fields.Points) || 0;
                const key = countMap[r.fields.Type];
                if (key) breakdown[key] += 1;
            });
            next();
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                score,
                rank: null,
                totalFans,
                tier: 'Free',
                breakdown,
                updatedAt: null,
                pending: true
            })
        };
    } catch (error) {
        if (isMissingTable(error)) {
            // Not configured yet — the page shows its "rankings refresh hourly" state.
            return {
                statusCode: 200, headers,
                body: JSON.stringify({
                    score: 0, rank: null, tier: null, pending: true, notConfigured: true,
                    breakdown: { eventsAttended: 0, comments: 0, votes: 0, qaCount: 0 },
                }),
            };
        }
        console.error('Get fan score error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch fan score' }) };
    }
};
