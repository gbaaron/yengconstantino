const Airtable = require('airtable');
const jwt = require('jsonwebtoken');
const OpenAI = require('openai');

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
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    const decoded = verifyToken(event);
    if (!decoded) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };

    try {
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Verify admin
        const userRecord = await base('Users').find(decoded.userId);
        const role = userRecord.fields.Role || 'User';
        if (role !== 'Admin' && role !== 'SuperAdmin') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required' }) };
        }

        // Parse stats and goals from request body
        const { stats, goals } = JSON.parse(event.body || '{}');

        if (!stats) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Stats data is required' }) };
        }

        // Build context for GPT
        const goalsText = goals && goals.length > 0
            ? goals.map(g => `- ${g.title}: current progress toward target of ${g.target} by ${g.deadline} (tracking: ${g.metric})`).join('\n')
            : 'No specific goals set yet.';

        const prompt = `You are a strategic advisor for Yeng Constantino, a major Filipino OPM (Original Pilipino Music) artist. Analyze the following dashboard data from her official fan platform and provide 5-6 actionable strategic insights.

CURRENT PLATFORM DATA:
- Total users: ${stats.totalUsers || 0}
- New users this month: ${stats.newUsersThisMonth || 0}
- Membership breakdown: Free: ${stats.membershipBreakdown?.Free || 0}, Sariwang Simula (₱149/mo): ${stats.membershipBreakdown?.['Sariwang Simula'] || 0}, Laging Nandito (₱349/mo): ${stats.membershipBreakdown?.['Laging Nandito'] || 0}, Ikaw Lamang (₱799/mo): ${stats.membershipBreakdown?.['Ikaw Lamang'] || 0}
- Total orders: ${stats.totalOrders || 0}, Total revenue: ₱${stats.totalRevenue || 0}
- Pending content for review: ${stats.pendingPosts || 0} posts, ${stats.pendingCovers || 0} covers
- Active events: ${stats.activeEvents || 0}
- Pending message requests (Mensahe ni Yeng): ${stats.pendingMessages || 0}
- Pending event tickets: ${stats.pendingTickets || 0}
- Credits outstanding: ${stats.storeCreditOutstanding || 0}

ADMIN'S GOALS:
${goalsText}

PLATFORM FEATURES:
- Membership tiers with merch discounts (5%/10%/15%), early event access, free tickets for top tier
- Merch store with credits system
- Mensahe ni Yeng (personalized video/voice/written messages, like Cameo)
- Events (concerts link to external tickets, meet & greets + special events sold on-site)
- Music archive with song/video ratings and reviews
- Community posts, fan covers, fan art
- Yeng Covers (fan cover submissions)

Provide exactly 5-6 insights. Each insight must have:
1. A type: "growth" (revenue/membership growth), "action" (something to do now), "idea" (creative feature/campaign), or "alert" (urgent attention needed)
2. A specific, data-backed recommendation with numbers when possible
3. Be concise but actionable (2-3 sentences max each)

Format your response as a JSON array of objects with "type" and "text" fields. Use <strong> tags for emphasis on key numbers and actions. Example:
[{"type":"growth","text":"Your conversion rate is <strong>23%</strong>. Run a <strong>first-month 50% off</strong> campaign to convert more free users."}]

Return ONLY the JSON array, no other text.`;

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are a music industry strategist specializing in Filipino OPM artists. You give specific, data-driven recommendations. Always respond with valid JSON only.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 1000
        });

        const responseText = completion.choices[0]?.message?.content || '[]';

        // Parse the JSON response
        let insights;
        try {
            // Handle potential markdown code blocks
            const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            insights = JSON.parse(cleaned);
        } catch (parseErr) {
            console.error('Failed to parse GPT response:', responseText);
            insights = [{ type: 'alert', text: 'AI analysis completed but response format was unexpected. Please try again.' }];
        }

        // Validate and sanitize insights
        const validTypes = ['growth', 'action', 'idea', 'alert'];
        insights = insights.filter(i => i && i.type && i.text).map(i => ({
            type: validTypes.includes(i.type) ? i.type : 'idea',
            text: i.text
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                insights,
                model: 'gpt-4o-mini',
                generatedAt: new Date().toISOString()
            })
        };
    } catch (error) {
        console.error('AI insights error:', error);

        // Provide helpful error message
        let errorMsg = 'Failed to generate insights';
        if (error.message?.includes('API key')) errorMsg = 'OpenAI API key is missing or invalid. Add OPENAI_API_KEY to Netlify environment variables.';
        else if (error.message?.includes('quota')) errorMsg = 'OpenAI API quota exceeded. Check your billing at platform.openai.com.';

        return { statusCode: 500, headers, body: JSON.stringify({ error: errorMsg }) };
    }
};
