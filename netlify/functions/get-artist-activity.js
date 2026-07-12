const Airtable = require('airtable');

// Yeng's own activity feed — her posts in the community, surfaced separately
// from the general Yeng Nation wall. "Yeng" is identified as any account with
// an Admin/SuperAdmin role (per the design decision to filter by her admin
// UserId). An optional YENG_ADMIN_USER_ID env var (comma-separated record IDs)
// can pin specific accounts if the role lookup ever needs overriding.
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

    try {
        const params = event.queryStringParameters || {};
        // filter=answered → only Q&A answers (question-type posts).
        const answeredOnly = params.filter === 'answered';
        const limit = Math.min(parseInt(params.limit) || 30, 100);

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // 1) Resolve which accounts count as "Yeng" (admin roles), building a
        //    UserId set + a denormalized name/avatar map for display.
        const adminIds = new Set();
        const adminMeta = {};

        const envIds = (process.env.YENG_ADMIN_USER_ID || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        envIds.forEach(id => adminIds.add(id));

        await base('Users').select({
            filterByFormula: `OR({Role} = 'Admin', {Role} = 'SuperAdmin')`
        }).eachPage((records, next) => {
            records.forEach(r => {
                adminIds.add(r.id);
                adminMeta[r.id] = {
                    name: r.fields.Name || r.fields.Username || 'Yeng',
                    avatar: r.fields.Avatar || null
                };
            });
            next();
        });

        // 2) Pull approved community posts (newest first) and keep only Yeng's.
        const filters = [`{Status} = 'Approved'`];
        if (answeredOnly) {
            filters.push(`{Type} = 'question'`);
        }
        const filterFormula = filters.length === 1 ? filters[0] : `AND(${filters.join(', ')})`;

        const all = [];
        await base('CommunityPosts').select({
            filterByFormula: filterFormula,
            sort: [{ field: 'CreatedAt', direction: 'desc' }]
        }).eachPage((records, next) => {
            all.push(...records);
            next();
        });

        const mine = all
            .filter(r => adminIds.has(r.fields.UserId))
            .slice(0, limit)
            .map(r => {
                const meta = adminMeta[r.fields.UserId] || {};
                return {
                    id: r.id,
                    content: r.fields.Content || '',
                    image: r.fields.Image || null,
                    type: r.fields.Type || 'general',
                    likes: r.fields.Likes || 0,
                    createdAt: r.fields.CreatedAt || null,
                    author: {
                        id: r.fields.UserId || null,
                        name: r.fields.UserName || meta.name || 'Yeng',
                        avatar: r.fields.UserAvatar || meta.avatar || null
                    }
                };
            });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                activity: mine,
                filter: answeredOnly ? 'answered' : 'all',
                count: mine.length
            })
        };
    } catch (error) {
        console.error('Get artist activity error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch activity' }) };
    }
};
