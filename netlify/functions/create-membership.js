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

        // Expiry matches the billing period. The tiers are priced and sold as
        // MONTHLY (membership.html shows "/month"), but this previously granted
        // a full YEAR — one month's payment bought twelve (AUDIT.md §3.6).
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 1);
        const expiryDateStr = expiryDate.toISOString().split('T')[0];

        // Is a real payment processor connected? If Stripe is configured the
        // ONLY thing that may activate a membership is the signed webhook
        // (stripe-webhook.js). Any authenticated fan could previously POST an
        // arbitrary reference string and be granted Ikaw Lamang instantly
        // (AUDIT.md §3.5 #2), so without a processor this now lands in
        // 'Pending' for a human to confirm rather than granting access.
        const stripeConnected = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
        const status = stripeConnected ? 'AwaitingPayment' : 'Pending';

        const membershipRecord = await base('Memberships').create({
            UserId: decoded.userId,
            Tier: tier,
            PaymentReference: paymentReference,
            StartDate: new Date().toISOString().split('T')[0],
            ExpiryDate: expiryDateStr,
            Status: status,
            CreatedAt: new Date().toISOString()
        });

        // Deliberately NOT writing MembershipTier onto the Users record here.
        // Tier is granted by stripe-webhook.js on verified payment, or by an
        // admin confirming the reference. Self-reported payment never unlocks
        // a paid tier.

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                message: `Request received. Your ${tier} membership activates once payment is confirmed.`,
                pendingVerification: true,
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
