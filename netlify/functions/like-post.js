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
        const { postId } = JSON.parse(event.body);

        if (!postId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Post ID is required' })
            };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Fetch the post
        const record = await base('CommunityPosts').find(postId);
        const likedBy = record.fields.LikedBy ? JSON.parse(record.fields.LikedBy) : [];

        // Toggle like
        const userIndex = likedBy.indexOf(decoded.userId);
        let liked;
        if (userIndex === -1) {
            // Add like
            likedBy.push(decoded.userId);
            liked = true;
        } else {
            // Remove like
            likedBy.splice(userIndex, 1);
            liked = false;
        }

        // Update the post
        await base('CommunityPosts').update(postId, {
            LikedBy: JSON.stringify(likedBy),
            Likes: likedBy.length
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                liked,
                likes: likedBy.length
            })
        };
    } catch (error) {
        console.error('Like post error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to update like' })
        };
    }
};
