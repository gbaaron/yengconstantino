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
        const search = params.search || '';
        const tier = params.tier || '';
        const page = parseInt(params.page) || 1;
        const limit = parseInt(params.limit) || 25;

        const filters = [];
        if (search) {
            filters.push(`OR(FIND(LOWER('${search.replace(/'/g, "\\'")}'), LOWER({Name})), FIND(LOWER('${search.replace(/'/g, "\\'")}'), LOWER({Email})))`);
        }
        if (tier) {
            filters.push(`{MembershipTier} = '${tier.replace(/'/g, "\\'")}'`);
        }

        let filterFormula = '';
        if (filters.length === 1) filterFormula = filters[0];
        else if (filters.length > 1) filterFormula = `AND(${filters.join(', ')})`;

        const selectConfig = { sort: [{ field: 'JoinDate', direction: 'desc' }] };
        if (filterFormula) selectConfig.filterByFormula = filterFormula;

        const allRecords = [];
        await base('Users').select(selectConfig).eachPage((records, next) => {
            allRecords.push(...records);
            next();
        });

        const totalRecords = allRecords.length;
        const totalPages = Math.ceil(totalRecords / limit);
        const start = (page - 1) * limit;
        const paged = allRecords.slice(start, start + limit);

        const users = paged.map(r => ({
            id: r.id,
            name: r.fields.Name || '',
            username: r.fields.Username || '',
            email: r.fields.Email || '',
            membershipTier: r.fields.MembershipTier || 'Free',
            role: r.fields.Role || 'User',
            avatar: r.fields.Avatar || null,
            joinDate: r.fields.JoinDate || '',
            storeCredit: r.fields.StoreCredit || 0,
            membershipExpiry: r.fields.MembershipExpiry || null
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                users,
                pagination: { page, limit, totalRecords, totalPages, hasNext: page < totalPages, hasPrev: page > 1 }
            })
        };
    } catch (error) {
        console.error('Get admin users error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch users' }) };
    }
};
