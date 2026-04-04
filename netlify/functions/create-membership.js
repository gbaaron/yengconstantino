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
        const { tier, paymentReference } = JSON.parse(event.body);

        const validTiers = ['Sariwang Simula', 'Laging Nandito', 'Ikaw Lamang'];
        if (!tier || !validTiers.includes(tier)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` })
            };
        }

        if (!paymentReference) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Payment reference is required' })
            };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Calculate expiry date (1 year from now)
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        const expiryDateStr = expiryDate.toISOString().split('T')[0];

        // Create membership record
        const membershipRecord = await base('Memberships').create({
            UserId: decoded.userId,
            Tier: tier,
            PaymentReference: paymentReference,
            StartDate: new Date().toISOString().split('T')[0],
            ExpiryDate: expiryDateStr,
            Status: 'Active',
            CreatedAt: new Date().toISOString()
        });

        // Update user's membership tier and expiry
        await base('Users').update(decoded.userId, {
            MembershipTier: tier,
            MembershipExpiry: expiryDateStr
        });

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                message: `Membership upgraded to ${tier} successfully`,
                membership: {
                    id: membershipRecord.id,
                    tier,
                    startDate: new Date().toISOString().split('T')[0],
                    expiryDate: expiryDateStr,
                    status: 'Active',
                    paymentReference
                }
            })
        };
    } catch (error) {
        console.error('Create membership error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to create membership' })
        };
    }
};
