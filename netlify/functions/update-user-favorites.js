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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    const decoded = verifyToken(event);
    if (!decoded) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };

    try {
        const { favorites } = JSON.parse(event.body);

        if (!favorites || !Array.isArray(favorites)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'favorites array is required' }) };
        }

        if (favorites.length > 10) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Maximum 10 favorites allowed' }) };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
        const userId = decoded.userId;

        // Delete all existing favorites for this user
        const existing = [];
        await base('UserFavorites').select({
            filterByFormula: `{UserId} = '${userId}'`
        }).eachPage((records, fetchNextPage) => {
            existing.push(...records);
            fetchNextPage();
        });

        // Delete in batches of 10 (Airtable limit)
        for (let i = 0; i < existing.length; i += 10) {
            const batch = existing.slice(i, i + 10).map(r => r.id);
            await base('UserFavorites').destroy(batch);
        }

        // Create new favorites in batches of 10
        const now = new Date().toISOString();
        const newRecords = favorites.map((fav, index) => ({
            fields: {
                UserId: userId,
                ContentId: fav.contentId,
                ContentTitle: fav.contentTitle || '',
                Rank: index + 1,
                AddedAt: now
            }
        }));

        for (let i = 0; i < newRecords.length; i += 10) {
            const batch = newRecords.slice(i, i + 10);
            await base('UserFavorites').create(batch.map(r => r.fields));
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'Favorites updated', count: favorites.length })
        };
    } catch (error) {
        console.error('Update user favorites error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update favorites' }) };
    }
};
