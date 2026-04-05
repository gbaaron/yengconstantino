const Airtable = require('airtable');
const jwt = require('jsonwebtoken');

function verifyToken(event) {
    const auth = event.headers.authorization;
    if (!auth) return null;
    try {
        return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET);
    } catch { return null; }
}

const MESSAGE_PRICES = { 'Video': 1500, 'Voice': 800, 'Written': 300 };
const TIER_DISCOUNTS = { 'Sariwang Simula': 5, 'Laging Nandito': 10, 'Ikaw Lamang': 15 };

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
        const { type, occasion, recipientName, instructions, paymentMethod, paymentReference } = JSON.parse(event.body);

        if (!type || !occasion || !recipientName || !paymentMethod || !paymentReference) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

        const basePrice = MESSAGE_PRICES[type];
        if (!basePrice) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid message type. Choose Video, Voice, or Written.' }) };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Fetch user for tier info
        const userRecord = await base('Users').find(decoded.userId);
        const userTier = userRecord.fields.MembershipTier || 'Free';
        const userName = userRecord.fields.Name || 'Fan';
        const userEmail = userRecord.fields.Email || '';

        // Apply tier discount
        const discountPercent = TIER_DISCOUNTS[userTier] || 0;
        const finalPrice = discountPercent > 0 ? Math.round(basePrice * (1 - discountPercent / 100)) : basePrice;
        const discountApplied = discountPercent > 0 ? discountPercent + '%' : 'None';

        const record = await base('MessageRequests').create({
            UserId: decoded.userId,
            UserName: userName,
            UserEmail: userEmail,
            Type: type,
            Occasion: occasion,
            RecipientName: recipientName,
            PersonalInstructions: instructions || '',
            Status: 'Pending',
            Price: finalPrice,
            DiscountApplied: discountApplied,
            PaymentMethod: paymentMethod,
            PaymentReference: paymentReference,
            RequestedAt: new Date().toISOString()
        });

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                message: 'Message request submitted successfully!',
                request: {
                    id: record.id,
                    type,
                    occasion,
                    recipientName,
                    price: finalPrice,
                    discountApplied,
                    status: 'Pending'
                }
            })
        };
    } catch (error) {
        console.error('Create message request error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to submit message request' }) };
    }
};
