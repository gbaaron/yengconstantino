const Airtable = require('airtable');

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    try {
        const params = event.queryStringParameters || {};
        const contentId = params.contentId;

        if (!contentId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'contentId is required' }) };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const allRecords = [];
        await base('ContentRatings').select({
            filterByFormula: `AND({ContentID} = '${contentId}', {ReviewStatus} = 'Approved', {ReviewText} != '')`,
            sort: [{ field: 'RatedAt', direction: 'desc' }]
        }).eachPage((records, fetchNextPage) => {
            allRecords.push(...records);
            fetchNextPage();
        });

        const reviews = allRecords.slice(0, 20).map(r => ({
            id: r.id,
            rating: r.fields.Rating || 0,
            ratingType: r.fields.RatingType || 'Song',
            review: r.fields.ReviewText || '',
            userName: r.fields.UserName || 'Fan',
            ratedAt: r.fields.RatedAt || ''
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ reviews })
        };
    } catch (error) {
        console.error('Get content reviews error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch reviews' }) };
    }
};
