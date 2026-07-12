const Airtable = require('airtable');
const { geocodeCity } = require('./lib/geocode');

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

        // When asking for upcoming events, drop anything whose date has already
        // passed even if it's still flagged 'Upcoming' in Airtable. Otherwise a
        // stale past event sorts first and the countdown widget shows "0 days".
        let workingRecords = allRecords;
        if (upcoming === 'true') {
            // Today at 00:00 in Manila (the artist + fanbase timezone).
            const manilaToday = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
            manilaToday.setHours(0, 0, 0, 0);
            workingRecords = allRecords.filter(record => {
                const raw = record.fields.EndDate || record.fields.Date;
                if (!raw) return false;
                const when = new Date(raw);
                if (isNaN(when.getTime())) return false;
                return when >= manilaToday;
            });
        }

        const limitedRecords = workingRecords.slice(0, limit);

        const events = await Promise.all(limitedRecords.map(async record => {
            const imgField = record.fields.Image || null;
            let image = null;
            if (Array.isArray(imgField) && imgField.length > 0) {
                image = imgField[0].url || imgField[0];
            } else if (typeof imgField === 'string') {
                image = imgField;
            }

            // Coordinates for the "near me" location filter. Prefer any Latitude /
            // Longitude already stored on the record; otherwise auto-derive them
            // from the City (per the product decision — no manual lat/lng entry).
            let lat = null;
            let lng = null;
            const storedLat = parseFloat(record.fields.Latitude);
            const storedLng = parseFloat(record.fields.Longitude);
            if (!isNaN(storedLat) && !isNaN(storedLng)) {
                lat = storedLat;
                lng = storedLng;
            } else if (record.fields.City) {
                const geo = await geocodeCity(record.fields.City, record.fields.Country);
                if (geo) {
                    lat = geo.lat;
                    lng = geo.lng;
                }
            }

            return {
                id: record.id,
                title: record.fields.Title || '',
                date: record.fields.Date || null,
                endDate: record.fields.EndDate || null,
                venue: record.fields.Venue || '',
                city: record.fields.City || '',
                country: record.fields.Country || 'Philippines',
                lat,
                lng,
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
        }));

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
