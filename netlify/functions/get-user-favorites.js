const Airtable = require('airtable');
const jwt = require('jsonwebtoken');

function verifyToken(event) {
    const auth = event.headers.authorization;
    if (!auth) return null;
    try { return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET); }
    catch { return null; }
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    const decoded = verifyToken(event);
    if (!decoded) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };

    try {
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const allRecords = [];
        await base('UserFavorites').select({
            filterByFormula: `{UserId} = '${decoded.userId}'`,
            sort: [{ field: 'Rank', direction: 'asc' }]
        }).eachPage((records, fetchNextPage) => {
            allRecords.push(...records);
            fetchNextPage();
        });

        const favorites = allRecords.map(r => ({
            id: r.id,
            contentId: r.fields.ContentId || '',
            contentTitle: r.fields.ContentTitle || '',
            rank: r.fields.Rank || 0,
            addedAt: r.fields.AddedAt || ''
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ favorites })
        };
    } catch (error) {
        console.error('Get user favorites error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch favorites' }) };
    }
};
