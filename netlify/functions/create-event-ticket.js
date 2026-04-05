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
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    try {
        const { eventId, quantity, paymentMethod, paymentReference, useFreeTicket } = JSON.parse(event.body);

        if (!eventId || !quantity || !paymentMethod || !paymentReference) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Fetch event
        const eventRecord = await base('Events').find(eventId);
        const eventFields = eventRecord.fields;

        if (eventFields.Status !== 'Upcoming') {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Event is not available for booking' }) };
        }

        if (eventFields.Type === 'Concert') {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Concert tickets are handled externally' }) };
        }

        // Check capacity
        const sold = eventFields.TicketsSold || 0;
        const max = eventFields.MaxTickets || null;
        if (max && (sold + quantity) > max) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Not enough tickets available' }) };
        }

        // Fetch user for tier info
        const userRecord = await base('Users').find(decoded.userId);
        const userTier = userRecord.fields.MembershipTier || 'Free';
        const userName = userRecord.fields.Name || 'Fan';
        const userEmail = userRecord.fields.Email || '';

        // Calculate price with discount
        const basePrice = eventFields.Price || 0;
        let discountApplied = 'None';
        let finalPrice = basePrice * quantity;

        // Check for free tickets (Ikaw Lamang, 2 per year)
        if (useFreeTicket && userTier === 'Ikaw Lamang') {
            const currentYear = new Date().getFullYear();
            const freeTicketRecords = [];
            await base('EventTickets').select({
                filterByFormula: `AND({UserId} = '${decoded.userId}', {DiscountApplied} = 'Free', YEAR({PurchasedAt}) = ${currentYear})`
            }).eachPage((records, fetchNextPage) => {
                freeTicketRecords.push(...records);
                fetchNextPage();
            });

            const freeUsed = freeTicketRecords.reduce((sum, r) => sum + (r.fields.Quantity || 0), 0);
            if (freeUsed + quantity <= 2) {
                finalPrice = 0;
                discountApplied = 'Free';
            } else {
                return { statusCode: 400, headers, body: JSON.stringify({ error: `You have ${2 - freeUsed} free ticket(s) remaining this year` }) };
            }
        } else {
            // Tier-based percentage discount
            const discountPercent = TIER_DISCOUNTS[userTier] || 0;
            if (discountPercent > 0) {
                finalPrice = Math.round(basePrice * quantity * (1 - discountPercent / 100));
                discountApplied = discountPercent + '%';
            }
        }

        // Create ticket record
        const ticketRecord = await base('EventTickets').create({
            EventId: eventId,
            EventTitle: eventFields.Title || '',
            UserId: decoded.userId,
            UserName: userName,
            UserEmail: userEmail,
            TicketType: 'General Admission',
            Quantity: quantity,
            Price: finalPrice,
            DiscountApplied: discountApplied,
            PaymentMethod: paymentMethod,
            PaymentReference: paymentReference,
            Status: 'Pending',
            PurchasedAt: new Date().toISOString()
        });

        // Update tickets sold on event
        await base('Events').update(eventId, {
            TicketsSold: sold + quantity
        });

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                message: 'Ticket purchase submitted successfully',
                ticket: {
                    id: ticketRecord.id,
                    eventTitle: eventFields.Title,
                    quantity,
                    price: finalPrice,
                    discountApplied,
                    status: 'Pending'
                }
            })
        };
    } catch (error) {
        console.error('Create event ticket error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to create ticket' }) };
    }
};
