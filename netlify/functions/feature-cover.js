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

    if (event.httpMethod !== 'POST') {
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

        // Verify admin role
        const userRecord = await base('Users').find(decoded.userId);
        const role = userRecord.fields.Role || 'User';
        if (role !== 'Admin' && role !== 'SuperAdmin') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required' }) };
        }

        const { coverId, status } = JSON.parse(event.body);

        if (!coverId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Cover ID is required' })
            };
        }

        const validStatuses = ['Featured on Site', 'Shared by Yeng', 'Hall of Fame'];
        if (!status || !validStatuses.includes(status)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` })
            };
        }

        // Update the cover record
        const record = await base('Covers').update(coverId, {
            Status: status,
            FeaturedDate: new Date().toISOString()
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: `Cover status updated to "${status}"`,
                cover: {
                    id: record.id,
                    title: record.fields.Title,
                    contentURL: record.fields.ContentURL,
                    songTitle: record.fields.SongTitle || null,
                    arrangementStyle: record.fields.ArrangementStyle || null,
                    personalNote: record.fields.PersonalNote || null,
                    status: record.fields.Status,
                    upvotes: record.fields.Upvotes || 0,
                    featuredDate: record.fields.FeaturedDate || null,
                    submittedAt: record.fields.SubmittedAt || null,
                    user: {
                        id: record.fields.UserId || null,
                        name: record.fields.UserName || 'Anonymous'
                    }
                }
            })
        };
    } catch (error) {
        console.error('Feature cover error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to update cover status' })
        };
    }
};
