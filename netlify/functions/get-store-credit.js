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

    const decoded = verifyToken(event);
    if (!decoded) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    try {
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const userRecord = await base('Users').find(decoded.userId);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                storeCredit: userRecord.fields.StoreCredit || 0,
                tier: userRecord.fields.MembershipTier || 'Free'
            })
        };
    } catch (error) {
        console.error('Get store credit error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch store credit' }) };
    }
};
