const Airtable = require('airtable');

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const params = event.queryStringParameters || {};
        const type = params.type;
        const upcoming = params.upcoming;
        const limit = parseInt(params.limit) || 50;

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        const filters = [];
        if (upcoming === 'true') {
            filters.push(`{Status} = 'Upcoming'`);
        }
        if (type) {
            filters.push(`{Type} = '${type.replace(/'/g, "\\'")}'`);
        }

        let filterFormula = '';
        if (filters.length === 1) filterFormula = filters[0];
        else if (filters.length > 1) filterFormula = `AND(${filters.join(', ')})`;

        const selectConfig = {
            sort: [{ field: 'Date', direction: 'asc' }]
        };
        if (filterFormula) selectConfig.filterByFormula = filterFormula;

        const allRecords = [];
        await base('Events').select(selectConfig).eachPage((records, fetchNextPage) => {
            allRecords.push(...records);
            fetchNextPage();
        });

        const limitedRecords = allRecords.slice(0, limit);

        const events = limitedRecords.map(record => {
            const imgField = record.fields.Image || null;
            let image = null;
            if (Array.isArray(imgField) && imgField.length > 0) {
                image = imgField[0].url || imgField[0];
            } else if (typeof imgField === 'string') {
                image = imgField;
            }

            return {
                id: record.id,
                title: record.fields.Title || '',
                date: record.fields.Date || null,
                endDate: record.fields.EndDate || null,
                venue: record.fields.Venue || '',
                city: record.fields.City || '',
                country: record.fields.Country || 'Philippines',
                type: record.fields.Type || 'Concert',
                description: record.fields.Description || '',
                image,
                ticketUrl: record.fields.TicketURL || null,
                price: record.fields.Price || 0,
                earlyAccessDate: record.fields.EarlyAccessDate || null,
                memberDiscountPercent: record.fields.MemberDiscountPercent || null,
                maxTickets: record.fields.MaxTickets || null,
                ticketsSold: record.fields.TicketsSold || 0,
                status: record.fields.Status || 'Upcoming',
                featured: !!record.fields.Featured
            };
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ events })
        };
    } catch (error) {
        console.error('Get events error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch events' })
        };
    }
};
