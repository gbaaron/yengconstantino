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
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const userRecord = await base('Users').find(decoded.userId);
        const role = userRecord.fields.Role || 'User';
        if (role !== 'Admin' && role !== 'SuperAdmin') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required' }) };
        }

        const { orderId, status, trackingNumber } = JSON.parse(event.body);
        if (!orderId || !status) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'orderId and status are required' }) };
        }

        const validStatuses = ['Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid status' }) };
        }

        const updateFields = { Status: status };
        if (trackingNumber) updateFields.TrackingNumber = trackingNumber;

        const record = await base('Orders').update(orderId, updateFields);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'Order updated to ' + status, id: record.id })
        };
    } catch (error) {
        console.error('Update order status error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update order' }) };
    }
};
