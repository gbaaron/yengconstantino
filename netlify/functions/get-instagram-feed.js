const Airtable = require('airtable');

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
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const allRecords = [];
        await base('InstagramFeed').select({
            filterByFormula: `{Active} = TRUE()`,
            sort: [{ field: 'SortOrder', direction: 'asc' }]
        }).eachPage((records, fetchNextPage) => {
            allRecords.push(...records);
            fetchNextPage();
        });

        const posts = allRecords.map(record => ({
            id: record.id,
            shortcode: record.fields.Shortcode || '',
            postUrl: record.fields.PostURL || '',
            caption: record.fields.Caption || ''
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ posts })
        };
    } catch (error) {
        console.error('Get instagram feed error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch Instagram feed' })
        };
    }
};
