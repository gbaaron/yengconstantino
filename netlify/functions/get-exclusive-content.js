const Airtable = require('airtable');
const jwt = require('jsonwebtoken');

function verifyToken(event) {
    const auth = event.headers.authorization;
    if (!auth) return null;
    try {
        return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET);
    } catch { return null; }
}

// Tier hierarchy: Free < Sariwang Simula < Laging Nandito < Ikaw Lamang
const TIER_LEVELS = {
    'Free': 0,
    'Sariwang Simula': 1,
    'Laging Nandito': 2,
    'Ikaw Lamang': 3
};

function getTierLevel(tier) {
    return TIER_LEVELS[tier] !== undefined ? TIER_LEVELS[tier] : 0;
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

    if (event.httpMethod !== 'GET') {
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
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Fetch user to get membership tier
        const user = await base('Users').find(decoded.userId);
        const userTier = user.fields.MembershipTier || 'Free';
        const userTierLevel = getTierLevel(userTier);

        // Fetch all exclusive content
        const allRecords = [];
        await base('ExclusiveContent').select({
            sort: [{ field: 'PublishedAt', direction: 'desc' }]
        }).eachPage((records, fetchNextPage) => {
            allRecords.push(...records);
            fetchNextPage();
        });

        const content = allRecords.map(record => {
            const minTier = record.fields.MinTier || 'Sariwang Simula';
            const minTierLevel = getTierLevel(minTier);
            const hasAccess = userTierLevel >= minTierLevel;

            const item = {
                id: record.id,
                title: record.fields.Title,
                description: record.fields.Description || null,
                type: record.fields.Type || null,
                thumbnail: record.fields.Thumbnail || null,
                minTier,
                publishedAt: record.fields.PublishedAt || null,
                locked: !hasAccess
            };

            // Only include full content if user has access
            if (hasAccess) {
                item.contentUrl = record.fields.ContentUrl || null;
                item.content = record.fields.Content || null;
                item.mediaUrl = record.fields.MediaUrl || null;
            } else {
                // Provide locked preview info
                item.contentUrl = null;
                item.content = null;
                item.mediaUrl = null;
                item.unlockTier = minTier;
            }

            return item;
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                content,
                userTier,
                tierLevel: userTierLevel
            })
        };
    } catch (error) {
        console.error('Get exclusive content error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch exclusive content' })
        };
    }
};
