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

        const allRecords = [];
        await base('Orders').select({
            filterByFormula: `{UserId} = '${decoded.userId}'`,
            sort: [{ field: 'OrderDate', direction: 'desc' }]
        }).eachPage((records, fetchNextPage) => {
            allRecords.push(...records);
            fetchNextPage();
        });

        const orders = allRecords.map(record => ({
            id: record.id,
            orderNumber: record.fields.OrderNumber,
            items: record.fields.Items ? JSON.parse(record.fields.Items) : [],
            totalAmount: record.fields.TotalAmount || 0,
            shippingAddress: record.fields.ShippingAddress || null,
            contactNumber: record.fields.ContactNumber || null,
            paymentMethod: record.fields.PaymentMethod || null,
            status: record.fields.Status || 'Pending',
            orderDate: record.fields.OrderDate || null,
            trackingNumber: record.fields.TrackingNumber || null
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ orders })
        };
    } catch (error) {
        console.error('Get orders error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch orders' })
        };
    }
};
