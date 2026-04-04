const Airtable = require('airtable');

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

    try {
        const params = event.queryStringParameters || {};
        const type = params.type;
        const featured = params.featured;
        const page = parseInt(params.page) || 1;
        const limit = parseInt(params.limit) || 20;

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Build filter formula — only show approved posts
        const filters = [`{Status} = 'Approved'`];

        if (type) {
            filters.push(`{Type} = '${type.replace(/'/g, "\\'")}'`);
        }
        if (featured === 'true') {
            filters.push(`{Featured} = TRUE()`);
        }

        let filterFormula = '';
        if (filters.length === 1) {
            filterFormula = filters[0];
        } else {
            filterFormula = `AND(${filters.join(', ')})`;
        }

        const allRecords = [];
        await base('CommunityPosts').select({
            filterByFormula: filterFormula,
            sort: [{ field: 'CreatedAt', direction: 'desc' }]
        }).eachPage((records, fetchNextPage) => {
            allRecords.push(...records);
            fetchNextPage();
        });

        // Paginate results
        const totalRecords = allRecords.length;
        const totalPages = Math.ceil(totalRecords / limit);
        const startIndex = (page - 1) * limit;
        const paginatedRecords = allRecords.slice(startIndex, startIndex + limit);

        const posts = paginatedRecords.map(record => ({
            id: record.id,
            content: record.fields.Content || '',
            image: record.fields.Image || null,
            type: record.fields.Type || 'general',
            likes: record.fields.Likes || 0,
            likedBy: record.fields.LikedBy ? JSON.parse(record.fields.LikedBy) : [],
            featured: record.fields.Featured || false,
            createdAt: record.fields.CreatedAt || null,
            user: {
                id: record.fields.UserId || null,
                name: record.fields.UserName || 'Anonymous',
                avatar: record.fields.UserAvatar || null
            }
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                posts,
                pagination: {
                    page,
                    limit,
                    totalRecords,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            })
        };
    } catch (error) {
        console.error('Get community posts error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch community posts' })
        };
    }
};
