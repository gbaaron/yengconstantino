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

        const { type, recordId, status } = JSON.parse(event.body);
        if (!type || !recordId || !status) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'type, recordId, and status are required' }) };
        }

        let table, validStatuses, statusField = 'Status';
        if (type === 'post') {
            table = 'CommunityPosts';
            validStatuses = ['Approved', 'Rejected', 'Pending'];
        } else if (type === 'cover') {
            table = 'Covers';
            validStatuses = ['Under Review', 'Featured on Site', 'Shared by Yeng', 'Hall of Fame', 'Rejected'];
        } else if (type === 'review') {
            table = 'ContentRatings';
            validStatuses = ['Approved', 'Rejected', 'Pending'];
            statusField = 'ReviewStatus';
        } else {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid type. Use post, cover, or review.' }) };
        }

        if (!validStatuses.includes(status)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid status for ' + type }) };
        }

        const updateFields = { [statusField]: status };
        if (type === 'cover' && ['Featured on Site', 'Shared by Yeng', 'Hall of Fame'].includes(status)) {
            updateFields.FeaturedDate = new Date().toISOString();
        }

        const record = await base(table).update(recordId, updateFields);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: type + ' status updated to ' + status, id: record.id })
        };
    } catch (error) {
        console.error('Update content status error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update content status' }) };
    }
};
