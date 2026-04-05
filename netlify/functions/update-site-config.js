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

        const { records } = JSON.parse(event.body);
        if (!records || !Array.isArray(records)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'records array is required' }) };
        }

        let updated = 0;
        for (const rec of records) {
            if (!rec.key) continue;
            const existing = await base('SiteConfig').select({
                filterByFormula: `{Key} = '${rec.key.replace(/'/g, "\\'")}'`,
                maxRecords: 1
            }).firstPage();

            if (existing.length > 0) {
                const updateFields = {};
                if (rec.value !== undefined) updateFields.Value = rec.value;
                if (rec.imageURL !== undefined) updateFields.ImageURL = rec.imageURL;
                await base('SiteConfig').update(existing[0].id, updateFields);
                updated++;
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: updated + ' config records updated' })
        };
    } catch (error) {
        console.error('Update site config error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update site config' }) };
    }
};
