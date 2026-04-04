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
        const { items, shippingAddress, contactNumber, paymentMethod } = JSON.parse(event.body);

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

        // Calculate total from items
        let totalAmount = 0;
        for (const item of items) {
            if (!item.productId || !item.quantity || !item.price) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Each item must have productId, quantity, and price' })
                };
            }
            totalAmount += item.price * item.quantity;
        }

        // Generate order number (YC-XXXXXX)
        const orderNumber = 'YC-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        // Create order record
        const record = await base('Orders').create({
            OrderNumber: orderNumber,
            UserId: decoded.userId,
            Items: JSON.stringify(items),
            TotalAmount: totalAmount,
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
                    totalAmount,
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
