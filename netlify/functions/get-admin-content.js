const Airtable = require('airtable');
const jwt = require('jsonwebtoken');

function verifyToken(event) {
    const auth = event.headers.authorization;
    if (!auth) return null;
    try { return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET); }
    catch { return null; }
}

const TABLE_MAP = {
    posts: { table: 'CommunityPosts', defaultStatus: 'Pending', sort: 'CreatedAt' },
    covers: { table: 'Covers', defaultStatus: 'Submitted', sort: 'SubmittedAt' },
    orders: { table: 'Orders', defaultStatus: null, sort: 'OrderDate' },
    tickets: { table: 'EventTickets', defaultStatus: 'Pending', sort: 'PurchasedAt' },
    messages: { table: 'MessageRequests', defaultStatus: 'Pending', sort: 'RequestedAt' },
    memberships: { table: 'Memberships', defaultStatus: null, sort: 'CreatedAt' },
    reviews: { table: 'ContentRatings', defaultStatus: 'Pending', sort: 'RatedAt', statusField: 'ReviewStatus', extraFilter: `{ReviewText} != ''` }
};

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    const decoded = verifyToken(event);
    if (!decoded) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };

    try {
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const userRecord = await base('Users').find(decoded.userId);
        const role = userRecord.fields.Role || 'User';
        if (role !== 'Admin' && role !== 'SuperAdmin') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required' }) };
        }

        const params = event.queryStringParameters || {};
        const type = params.type || 'posts';
        const status = params.status;
        const page = parseInt(params.page) || 1;
        const limit = parseInt(params.limit) || 20;

        const config = TABLE_MAP[type];
        if (!config) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid content type' }) };

        const filterStatus = status || config.defaultStatus;
        const statusField = config.statusField || 'Status';
        const selectConfig = {
            sort: [{ field: config.sort, direction: 'desc' }]
        };
        const filterParts = [];
        if (filterStatus) {
            filterParts.push(`{${statusField}} = '${filterStatus.replace(/'/g, "\\'")}'`);
        }
        if (config.extraFilter) {
            filterParts.push(config.extraFilter);
        }
        if (filterParts.length === 1) {
            selectConfig.filterByFormula = filterParts[0];
        } else if (filterParts.length > 1) {
            selectConfig.filterByFormula = `AND(${filterParts.join(', ')})`;
        }

        const allRecords = [];
        await base(config.table).select(selectConfig).eachPage((records, next) => {
            allRecords.push(...records);
            next();
        });

        const totalRecords = allRecords.length;
        const totalPages = Math.ceil(totalRecords / limit);
        const start = (page - 1) * limit;
        const paged = allRecords.slice(start, start + limit);

        const items = paged.map(r => ({ id: r.id, ...r.fields }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                items,
                pagination: { page, limit, totalRecords, totalPages, hasNext: page < totalPages, hasPrev: page > 1 }
            })
        };
    } catch (error) {
        console.error('Get admin content error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch admin content' }) };
    }
};
