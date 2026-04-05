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
        await base('EventTickets').select({
            filterByFormula: `{UserId} = '${decoded.userId}'`,
            sort: [{ field: 'PurchasedAt', direction: 'desc' }]
        }).eachPage((records, fetchNextPage) => {
            allRecords.push(...records);
            fetchNextPage();
        });

        const tickets = allRecords.map(record => ({
            id: record.id,
            eventId: record.fields.EventId || '',
            eventTitle: record.fields.EventTitle || 'Event',
            quantity: record.fields.Quantity || 1,
            price: record.fields.Price || 0,
            discountApplied: record.fields.DiscountApplied || 'None',
            paymentMethod: record.fields.PaymentMethod || '',
            status: record.fields.Status || 'Pending',
            purchasedAt: record.fields.PurchasedAt || ''
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ tickets })
        };
    } catch (error) {
        console.error('Get user tickets error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch tickets' }) };
    }
};
