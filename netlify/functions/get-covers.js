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
        const sort = params.sort || 'newest';
        const song = params.song;
        const style = params.style;
        const status = params.status;
        const page = parseInt(params.page) || 1;
        const limit = parseInt(params.limit) || 20;

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Build filter formula
        const filters = [];
        if (song) {
            filters.push(`{SongTitle} = '${song.replace(/'/g, "\\'")}'`);
        }
        if (style) {
            filters.push(`{ArrangementStyle} = '${style.replace(/'/g, "\\'")}'`);
        }
        if (status) {
            filters.push(`{Status} = '${status.replace(/'/g, "\\'")}'`);
        }

        let filterFormula = '';
        if (filters.length === 1) {
            filterFormula = filters[0];
        } else if (filters.length > 1) {
            filterFormula = `AND(${filters.join(', ')})`;
        }

        // Build sort configuration
        let sortConfig = [];
        switch (sort) {
            case 'votes':
                sortConfig = [{ field: 'Upvotes', direction: 'desc' }];
                break;
            case 'newest':
            default:
                sortConfig = [{ field: 'SubmittedAt', direction: 'desc' }];
                break;
        }

        const selectConfig = { sort: sortConfig };
        if (filterFormula) {
            selectConfig.filterByFormula = filterFormula;
        }

        const allRecords = [];
        await base('Covers').select(selectConfig).eachPage((records, fetchNextPage) => {
            allRecords.push(...records);
            fetchNextPage();
        });

        // Paginate results
        const totalRecords = allRecords.length;
        const totalPages = Math.ceil(totalRecords / limit);
        const startIndex = (page - 1) * limit;
        const paginatedRecords = allRecords.slice(startIndex, startIndex + limit);

        const covers = paginatedRecords.map(record => ({
            id: record.id,
            title: record.fields.Title,
            contentURL: record.fields.ContentURL,
            songTitle: record.fields.SongTitle || null,
            arrangementStyle: record.fields.ArrangementStyle || null,
            personalNote: record.fields.PersonalNote || null,
            status: record.fields.Status,
            upvotes: record.fields.Upvotes || 0,
            upvotedBy: record.fields.UpvotedBy ? JSON.parse(record.fields.UpvotedBy) : [],
            submittedAt: record.fields.SubmittedAt || null,
            featuredDate: record.fields.FeaturedDate || null,
            user: {
                id: record.fields.UserId || null,
                name: record.fields.UserName || 'Anonymous'
            }
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                covers,
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
        console.error('Get covers error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch covers' })
        };
    }
};
