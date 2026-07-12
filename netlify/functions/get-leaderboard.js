const Airtable = require('airtable');
const jwt = require('jsonwebtoken');

function verifyToken(event) {
    const auth = event.headers.authorization;
    if (!auth) return null;
    try {
        return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET);
    } catch { return null; }
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

    // Semi-public: login required to view the leaderboard.
    const decoded = verifyToken(event);
    if (!decoded) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    try {
        const params = event.queryStringParameters || {};
        const limit = Math.min(parseInt(params.limit) || 50, 200);

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const all = [];
        await base('Leaderboard').select({
            sort: [{ field: 'Rank', direction: 'asc' }]
        }).eachPage((records, next) => {
            all.push(...records);
            next();
        });

        const leaders = all.slice(0, limit).map(record => {
            const f = record.fields;
            return {
                userId: f.UserId,
                name: f.UserName || 'Fan',
                avatar: f.Avatar || null,
                tier: f.Tier || 'Free',
                score: f.Score || 0,
                rank: f.Rank || null,
                breakdown: {
                    eventsAttended: f.EventsAttended || 0,
                    comments: f.Comments || 0,
                    votes: f.Votes || 0,
                    qaQuestions: f.QACount || 0
                }
            };
        });

        // Pull out the requesting fan's own row so the page can pin it even if
        // they rank below the visible cutoff.
        const me = all.find(r => r.fields.UserId === decoded.userId);
        const myRank = me ? {
            userId: me.fields.UserId,
            name: me.fields.UserName || 'You',
            avatar: me.fields.Avatar || null,
            tier: me.fields.Tier || 'Free',
            score: me.fields.Score || 0,
            rank: me.fields.Rank || null,
            breakdown: {
                eventsAttended: me.fields.EventsAttended || 0,
                comments: me.fields.Comments || 0,
                votes: me.fields.Votes || 0,
                qaQuestions: me.fields.QACount || 0
            }
        } : null;

        const updatedAt = all.length > 0 ? (all[0].fields.UpdatedAt || null) : null;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ leaders, myRank, totalFans: all.length, updatedAt })
        };
    } catch (error) {
        console.error('Get leaderboard error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch leaderboard' }) };
    }
};
