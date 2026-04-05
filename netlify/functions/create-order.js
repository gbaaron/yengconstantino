const Airtable = require('airtable');
const jwt = require('jsonwebtoken');

function verifyToken(event) {
    const auth = event.headers.authorization;
    if (!auth) return null;
    try {
        return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET);
    } catch { return null; }
}

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
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Authentication required' })
        };
    }

    try {
        const { items, shippingAddress, contactNumber, paymentMethod, storeCreditUsed } = JSON.parse(event.body);

        if (!items || !Array.isArray(items) || items.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'At least one item is required' })
            };
        }

        if (!shippingAddress || !contactNumber || !paymentMethod) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Shipping address, contact number, and payment method are required' })
            };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Fetch user for tier and store credit
        const userRecord = await base('Users').find(decoded.userId);
        const userTier = userRecord.fields.MembershipTier || 'Free';
        const availableCredit = userRecord.fields.StoreCredit || 0;

        // Calculate subtotal from items
        let subtotal = 0;
        for (const item of items) {
            if (!item.productId || !item.quantity || !item.price) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Each item must have productId, quantity, and price' })
                };
            }
            subtotal += item.price * item.quantity;
        }

        // Apply tier discount
        const discountPercent = TIER_DISCOUNTS[userTier] || 0;
        const discountAmount = Math.round(subtotal * discountPercent / 100);
        let totalAfterDiscount = subtotal - discountAmount;

        // Apply store credit
        let creditUsed = 0;
        if (storeCreditUsed && storeCreditUsed > 0) {
            creditUsed = Math.min(storeCreditUsed, availableCredit, totalAfterDiscount);
            totalAfterDiscount -= creditUsed;

            // Deduct from user's store credit
            await base('Users').update(decoded.userId, {
                StoreCredit: availableCredit - creditUsed
            });
        }

        // Generate order number (YC-XXXXXX)
        const orderNumber = 'YC-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        // Create order record
        const record = await base('Orders').create({
            OrderNumber: orderNumber,
            UserId: decoded.userId,
            Items: JSON.stringify(items),
            Subtotal: subtotal,
            DiscountPercent: discountPercent,
            DiscountAmount: discountAmount,
            StoreCreditUsed: creditUsed,
            TotalAmount: totalAfterDiscount,
            ShippingAddress: shippingAddress,
            ContactNumber: contactNumber,
            PaymentMethod: paymentMethod,
            Status: 'Pending',
            OrderDate: new Date().toISOString()
        });

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                message: 'Order placed successfully',
                order: {
                    id: record.id,
                    orderNumber,
                    items,
                    subtotal,
                    discountPercent,
                    discountAmount,
                    storeCreditUsed: creditUsed,
                    totalAmount: totalAfterDiscount,
                    shippingAddress,
                    contactNumber,
                    paymentMethod,
                    status: 'Pending',
                    orderDate: new Date().toISOString()
                }
            })
        };
    } catch (error) {
        console.error('Create order error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to create order' })
        };
    }
};
