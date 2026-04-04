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
        const { content, image, type } = JSON.parse(event.body);

        if (!content || content.trim().length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Post content is required' })
            };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Fetch user info for denormalized storage
        const user = await base('Users').find(decoded.userId);

        const record = await base('CommunityPosts').create({
            Content: content.trim(),
            Image: image || null,
            Type: type || 'Post',
            UserId: decoded.userId,
            UserName: user.fields.Name,
            UserAvatar: user.fields.Avatar || null,
            Status: 'Pending',
            Likes: 0,
            LikedBy: JSON.stringify([]),
            CreatedAt: new Date().toISOString()
        });

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                message: 'Post submitted for moderation',
                post: {
                    id: record.id,
                    content: record.fields.Content,
                    image: record.fields.Image || null,
                    type: record.fields.Type,
                    status: 'Pending',
                    likes: 0,
                    createdAt: record.fields.CreatedAt,
                    user: {
                        id: decoded.userId,
                        name: user.fields.Name,
                        avatar: user.fields.Avatar || null
                    }
                }
            })
        };
    } catch (error) {
        console.error('Create community post error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to create post' })
        };
    }
};
