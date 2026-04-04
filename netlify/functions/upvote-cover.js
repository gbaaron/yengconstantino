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
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Authentication required' })
        };
    }

    try {
        const { coverId } = JSON.parse(event.body);

        if (!coverId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Cover ID is required' })
            };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Fetch the cover
        const record = await base('Covers').find(coverId);
        const upvotedBy = record.fields.UpvotedBy ? JSON.parse(record.fields.UpvotedBy) : [];

        // Toggle upvote
        const userIndex = upvotedBy.indexOf(decoded.userId);
        let voted;
        if (userIndex === -1) {
            // Add upvote
            upvotedBy.push(decoded.userId);
            voted = true;
        } else {
            // Remove upvote
            upvotedBy.splice(userIndex, 1);
            voted = false;
        }

        // Update the cover
        await base('Covers').update(coverId, {
            UpvotedBy: JSON.stringify(upvotedBy),
            Upvotes: upvotedBy.length
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                voted,
                upvotes: upvotedBy.length
            })
        };
    } catch (error) {
        console.error('Upvote cover error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to update vote' })
        };
    }
};
