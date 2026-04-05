const Airtable = require('airtable');
const jwt = require('jsonwebtoken');

function verifyToken(event) {
    const auth = event.headers.authorization;
    if (!auth) return null;
    try { return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET); }
    catch { return null; }
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    const decoded = verifyToken(event);
    if (!decoded) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };

    try {
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const userRecord = await base('Users').find(decoded.userId);
        const role = userRecord.fields.Role || 'User';
        if (role !== 'Admin' && role !== 'SuperAdmin') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required' }) };
        }

        const { ticketId, status } = JSON.parse(event.body);
        if (!ticketId || !status) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'ticketId and status are required' }) };
        }

        const validStatuses = ['Confirmed', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid status' }) };
        }

        const ticketRecord = await base('EventTickets').find(ticketId);
        await base('EventTickets').update(ticketId, { Status: status });

        if (status === 'Cancelled' && ticketRecord.fields.EventId) {
            try {
                const eventRecord = await base('Events').find(ticketRecord.fields.EventId);
                const sold = eventRecord.fields.TicketsSold || 0;
                const qty = ticketRecord.fields.Quantity || 1;
                await base('Events').update(ticketRecord.fields.EventId, { TicketsSold: Math.max(0, sold - qty) });
            } catch (e) { console.warn('Could not update event ticket count:', e.message); }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'Ticket updated to ' + status, id: ticketId })
        };
    } catch (error) {
        console.error('Update ticket status error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update ticket' }) };
    }
};
