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
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    const decoded = verifyToken(event);
    if (!decoded) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };

    try {
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const userRecord = await base('Users').find(decoded.userId);
        const role = userRecord.fields.Role || 'User';
        if (role !== 'Admin' && role !== 'SuperAdmin') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required' }) };
        }

        // Query all tables in parallel
        const fetchAll = (table) => {
            const records = [];
            return base(table).select().eachPage((page, next) => { records.push(...page); next(); }).then(() => records);
        };

        const [users, orders, posts, covers, events, tickets, messages, memberships] = await Promise.all([
            fetchAll('Users'),
            fetchAll('Orders'),
            fetchAll('CommunityPosts'),
            fetchAll('Covers'),
            fetchAll('Events'),
            fetchAll('EventTickets'),
            fetchAll('MessageRequests'),
            fetchAll('Memberships')
        ]);

        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();

        // User stats
        const totalUsers = users.length;
        const newUsersThisMonth = users.filter(u => {
            const d = u.fields.JoinDate ? new Date(u.fields.JoinDate) : null;
            return d && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        }).length;

        const membershipBreakdown = { Free: 0, 'Sariwang Simula': 0, 'Laging Nandito': 0, 'Ikaw Lamang': 0 };
        users.forEach(u => {
            const tier = u.fields.MembershipTier || 'Free';
            if (membershipBreakdown[tier] !== undefined) membershipBreakdown[tier]++;
            else membershipBreakdown['Free']++;
        });

        // Order stats
        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((sum, o) => sum + (o.fields.TotalAmount || 0), 0);
        const pendingOrders = orders.filter(o => o.fields.Status === 'Pending').length;

        // Content stats
        const pendingPosts = posts.filter(p => p.fields.Status === 'Pending').length;
        const pendingCovers = covers.filter(c => (c.fields.Status || 'Submitted') === 'Submitted').length;
        const activeEvents = events.filter(e => e.fields.Status === 'Upcoming').length;
        const pendingTickets = tickets.filter(t => t.fields.Status === 'Pending').length;
        const pendingMessages = messages.filter(m => m.fields.Status === 'Pending').length;

        // Store credit
        const storeCreditOutstanding = users.reduce((sum, u) => sum + (u.fields.StoreCredit || 0), 0);

        // Recent data
        const recentOrders = orders
            .sort((a, b) => new Date(b.fields.OrderDate || 0) - new Date(a.fields.OrderDate || 0))
            .slice(0, 10)
            .map(o => ({
                id: o.id,
                orderNumber: o.fields.OrderNumber,
                userId: o.fields.UserId,
                totalAmount: o.fields.TotalAmount || 0,
                status: o.fields.Status || 'Pending',
                paymentMethod: o.fields.PaymentMethod || '',
                orderDate: o.fields.OrderDate || '',
                items: o.fields.Items ? JSON.parse(o.fields.Items) : []
            }));

        const recentSignups = users
            .sort((a, b) => new Date(b.fields.JoinDate || 0) - new Date(a.fields.JoinDate || 0))
            .slice(0, 10)
            .map(u => ({
                id: u.id,
                name: u.fields.Name || '',
                email: u.fields.Email || '',
                membershipTier: u.fields.MembershipTier || 'Free',
                joinDate: u.fields.JoinDate || '',
                role: u.fields.Role || 'User'
            }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                stats: {
                    totalUsers, newUsersThisMonth, membershipBreakdown,
                    totalOrders, totalRevenue, pendingOrders,
                    pendingPosts, pendingCovers, activeEvents,
                    pendingTickets, pendingMessages, storeCreditOutstanding
                },
                recentOrders,
                recentSignups
            })
        };
    } catch (error) {
        console.error('Get admin stats error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch admin stats' }) };
    }
};
