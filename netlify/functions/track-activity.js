const Airtable = require('airtable');
const jwt = require('jsonwebtoken');

function verifyToken(event) {
    const auth = event.headers.authorization;
    if (!auth) return null;
    try {
        return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET);
    } catch { return null; }
}

/*
 * Server-side point values. Scoring is authoritative here so the client can
 * NEVER submit its own point amount (no pay-to-win, no tampering). Merch
 * purchases are deliberately excluded — engagement, not spending, earns rank.
 */
const POINTS = {
    site_visit: 1,      // one meaningful visit (capped once/day below)
    comment: 5,         // posting a community comment
    vote: 2,            // upvoting a cover / liking a post
    qa_question: 8,     // asking Yeng a question
    cover_submit: 15,   // submitting a fan cover
    event_attended: 50  // confirmed attendance at an event
};

// Types that may only score once per calendar day per user (anti-farming).
const DAILY_CAPPED = new Set(['site_visit']);

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const decoded = verifyToken(event);
    if (!decoded) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const type = body.type;

        if (!type || !(type in POINTS)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid or missing activity type' }) };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Resolve display name (denormalized so the leaderboard compute stays cheap).
        let userName = decoded.username || 'Fan';
        try {
            const userRecord = await base('Users').find(decoded.userId);
            userName = userRecord.fields.Name || userRecord.fields.Username || userName;
        } catch { /* fall back to token username */ }

        // Daily-cap enforcement for high-frequency low-value signals.
        if (DAILY_CAPPED.has(type)) {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const existing = await base('ActivityEvents').select({
                filterByFormula: `AND({UserId} = '${decoded.userId}', {Type} = '${type}', IS_AFTER({CreatedAt}, '${startOfDay.toISOString()}'))`,
                maxRecords: 1
            }).firstPage();
            if (existing.length > 0) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ recorded: false, reason: 'daily_cap', points: 0 })
                };
            }
        }

        const points = POINTS[type];
        const metadata = body.metadata ? JSON.stringify(body.metadata).slice(0, 5000) : '';

        await base('ActivityEvents').create({
            UserId: decoded.userId,
            UserName: userName,
            Type: type,
            Points: points,
            Metadata: metadata,
            CreatedAt: new Date().toISOString()
        });

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({ recorded: true, type, points })
        };
    } catch (error) {
        console.error('Track activity error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to track activity' }) };
    }
};
