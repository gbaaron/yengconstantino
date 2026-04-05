const Airtable = require('airtable');
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    // Verify admin auth
    try {
        const authHeader = event.headers.authorization || event.headers.Authorization || '';
        const token = authHeader.replace('Bearer ', '');
        if (!token) throw new Error('No token');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'yeng-nation-secret-2026');
        if (decoded.role !== 'Admin' && decoded.role !== 'SuperAdmin') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required' }) };
        }
    } catch (err) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    try {
        const body = JSON.parse(event.body);
        const records = body.records || [];

        if (!records.length) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'No records to update' }) };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Load all existing config records to find their Airtable record IDs
        const existing = {};
        await base('SiteConfig').select().eachPage((recs, fetchNextPage) => {
            recs.forEach(rec => {
                existing[rec.fields.Key] = rec.id;
            });
            fetchNextPage();
        });

        // Split into updates (existing keys) and creates (new keys)
        const toUpdate = [];
        const toCreate = [];

        records.forEach(rec => {
            const fields = { Key: rec.key, Value: rec.value || '' };
            if (rec.imageURL !== undefined) fields.ImageURL = rec.imageURL;

            if (existing[rec.key]) {
                toUpdate.push({ id: existing[rec.key], fields });
            } else if (rec.value || rec.imageURL) {
                // Only create if there's actually a value
                toCreate.push({ fields });
            }
        });

        // Airtable batch update (max 10 per call)
        for (let i = 0; i < toUpdate.length; i += 10) {
            const batch = toUpdate.slice(i, i + 10);
            await base('SiteConfig').update(batch);
        }

        // Airtable batch create (max 10 per call)
        for (let i = 0; i < toCreate.length; i += 10) {
            const batch = toCreate.slice(i, i + 10);
            await base('SiteConfig').create(batch);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                updated: toUpdate.length,
                created: toCreate.length
            })
        };
    } catch (error) {
        console.error('Update site config error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to update site config: ' + error.message })
        };
    }
};
