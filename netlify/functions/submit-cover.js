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
        const { title, contentURL, songTitle, arrangementStyle, personalNote } = JSON.parse(event.body);

        if (!title || !contentURL || !songTitle) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Title, content URL, and song title are required' })
            };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Fetch user info
        const user = await base('Users').find(decoded.userId);

        const record = await base('Covers').create({
            Title: title,
            ContentURL: contentURL,
            SongTitle: songTitle,
            ArrangementStyle: arrangementStyle || null,
            PersonalNote: personalNote || null,
            UserId: decoded.userId,
            UserName: user.fields.Name,
            Status: 'Submitted',
            Upvotes: 0,
            UpvotedBy: JSON.stringify([]),
            SubmittedAt: new Date().toISOString()
        });

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                message: 'Cover submitted successfully',
                cover: {
                    id: record.id,
                    title: record.fields.Title,
                    contentURL: record.fields.ContentURL,
                    songTitle: record.fields.SongTitle,
                    arrangementStyle: record.fields.ArrangementStyle || null,
                    personalNote: record.fields.PersonalNote || null,
                    status: 'Submitted',
                    upvotes: 0,
                    submittedAt: record.fields.SubmittedAt,
                    user: {
                        id: decoded.userId,
                        name: user.fields.Name
                    }
                }
            })
        };
    } catch (error) {
        console.error('Submit cover error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to submit cover' })
        };
    }
};
