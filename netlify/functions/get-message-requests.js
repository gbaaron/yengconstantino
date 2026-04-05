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

        const allRecords = [];
        await base('MessageRequests').select({
            filterByFormula: `{UserId} = '${decoded.userId}'`,
            sort: [{ field: 'RequestedAt', direction: 'desc' }]
        }).eachPage((records, fetchNextPage) => {
            allRecords.push(...records);
            fetchNextPage();
        });

        const requests = allRecords.map(record => ({
            id: record.id,
            type: record.fields.Type || '',
            occasion: record.fields.Occasion || '',
            recipientName: record.fields.RecipientName || '',
            instructions: record.fields.PersonalInstructions || '',
            status: record.fields.Status || 'Pending',
            price: record.fields.Price || 0,
            discountApplied: record.fields.DiscountApplied || 'None',
            deliveryUrl: record.fields.DeliveryURL || null,
            requestedAt: record.fields.RequestedAt || '',
            deliveredAt: record.fields.DeliveredAt || null
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ requests })
        };
    } catch (error) {
        console.error('Get message requests error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch message requests' }) };
    }
};
