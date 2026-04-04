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

    if (event.httpMethod !== 'PUT') {
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
        const { name, bio, avatar } = JSON.parse(event.body);

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Build update object with only provided fields
        const updateFields = {};
        if (name !== undefined) updateFields.Name = name;
        if (bio !== undefined) updateFields.Bio = bio;
        if (avatar !== undefined) updateFields.Avatar = avatar;

        if (Object.keys(updateFields).length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No fields to update. Allowed fields: name, bio, avatar' })
            };
        }

        const record = await base('Users').update(decoded.userId, updateFields);
        const fields = record.fields;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Profile updated successfully',
                user: {
                    id: record.id,
                    name: fields.Name,
                    username: fields.Username,
                    email: fields.Email,
                    membershipTier: fields.MembershipTier || 'Free',
                    avatar: fields.Avatar || null,
                    bio: fields.Bio || null
                }
            })
        };
    } catch (error) {
        console.error('Update user error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to update profile' })
        };
    }
};
