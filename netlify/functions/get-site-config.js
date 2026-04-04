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
        const category = params.category || null;

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        let filterFormula = '';
        if (category) {
            filterFormula = `{Category} = '${category.replace(/'/g, "\\'")}'`;
        }

        const selectConfig = {};
        if (filterFormula) {
            selectConfig.filterByFormula = filterFormula;
        }

        const allRecords = [];
        await base('SiteConfig').select(selectConfig).eachPage((records, fetchNextPage) => {
            records.forEach(record => {
                allRecords.push({
                    key: record.fields.Key || '',
                    value: record.fields.Value || '',
                    imageURL: record.fields.ImageURL || null,
                    description: record.fields.Description || '',
                    category: record.fields.Category || ''
                });
            });
            fetchNextPage();
        });

        // Convert to a key-value map for easy frontend consumption
        const config = {};
        allRecords.forEach(item => {
            config[item.key] = {
                value: item.value,
                imageURL: item.imageURL,
            };
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ config, records: allRecords })
        };
    } catch (error) {
        console.error('Get site config error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch site config' })
        };
    }
};
