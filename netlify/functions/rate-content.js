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
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    try {
        const { contentId, rating, review, ratingType } = JSON.parse(event.body);

        if (!contentId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Content ID is required' }) };
        }

        const ratingNum = parseInt(rating);
        if (!ratingNum || ratingNum < 1 || ratingNum > 10) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Rating must be 1-10' }) };
        }

        const type = ratingType === 'Video' ? 'Video' : 'Song';

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
        const userId = decoded.userId;
        const now = new Date().toISOString();

        // Get user name for review display
        let userName = 'Fan';
        try {
            const userRecord = await base('Users').find(userId);
            userName = userRecord.fields.Name || 'Fan';
        } catch (e) { /* use default */ }

        // Check if user already rated this content with this type
        const existing = [];
        await base('ContentRatings').select({
            filterByFormula: `AND({ContentID} = '${contentId}', {UserID} = '${userId}', {RatingType} = '${type}')`
        }).eachPage((records, fetchNextPage) => {
            existing.push(...records);
            fetchNextPage();
        });

        const ratingFields = {
            Rating: ratingNum,
            RatedAt: now,
            RatingType: type,
            UserName: userName
        };

        if (review && review.trim()) {
            ratingFields.ReviewText = review.trim();
            ratingFields.ReviewStatus = 'Pending';
        }

        if (existing.length > 0) {
            await base('ContentRatings').update(existing[0].id, ratingFields);
        } else {
            ratingFields.ContentID = contentId;
            ratingFields.UserID = userId;
            await base('ContentRatings').create(ratingFields);
        }

        // Recalculate averages separated by type
        const allRatings = [];
        await base('ContentRatings').select({
            filterByFormula: `{ContentID} = '${contentId}'`
        }).eachPage((records, fetchNextPage) => {
            allRatings.push(...records);
            fetchNextPage();
        });

        const songRatings = allRatings.filter(r => (r.fields.RatingType || 'Song') === 'Song');
        const videoRatings = allRatings.filter(r => r.fields.RatingType === 'Video');

        const calcAvg = (arr) => arr.length > 0
            ? Math.round((arr.reduce((sum, r) => sum + (r.fields.Rating || 0), 0) / arr.length) * 10) / 10
            : 0;

        const avgSong = calcAvg(songRatings);
        const avgVideo = calcAvg(videoRatings);
        const overallAvg = calcAvg(allRatings);

        try {
            await base('MusicContent').update(contentId, {
                AvgRating: overallAvg,
                RatingCount: allRatings.length,
                AvgSongRating: avgSong,
                SongRatingCount: songRatings.length,
                AvgVideoRating: avgVideo,
                VideoRatingCount: videoRatings.length
            });
        } catch (e) {
            console.warn('Could not update cached avg:', e.message);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                userRating: ratingNum,
                ratingType: type,
                avgRating: overallAvg,
                ratingCount: allRatings.length,
                avgSongRating: avgSong,
                songRatingCount: songRatings.length,
                avgVideoRating: avgVideo,
                videoRatingCount: videoRatings.length,
                reviewSubmitted: !!(review && review.trim())
            })
        };
    } catch (error) {
        console.error('Rate content error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to save rating' }) };
    }
};
