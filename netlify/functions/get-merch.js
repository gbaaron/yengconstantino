const Airtable = require('airtable');

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

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const params = event.queryStringParameters || {};
        const category = params.category;
        const sort = params.sort || 'newest';
        const status = params.status || 'all';

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Build filter formula
        const filters = [];
        // Only filter by Status if explicitly passed (many tables leave Status empty)
        if (status && status !== 'all') {
            filters.push(`{Status} = '${status.replace(/'/g, "\\'")}'`);
        }

        if (category) {
            filters.push(`{Category} = '${category.replace(/'/g, "\\'")}'`);
        }

        let filterFormula = '';
        if (filters.length === 1) {
            filterFormula = filters[0];
        } else if (filters.length > 1) {
            filterFormula = `AND(${filters.join(', ')})`;
        }

        // Build sort configuration
        let sortConfig = [];
        switch (sort) {
            case 'price-asc':
                sortConfig = [{ field: 'Price', direction: 'asc' }];
                break;
            case 'price-desc':
                sortConfig = [{ field: 'Price', direction: 'desc' }];
                break;
            case 'newest':
            default:
                sortConfig = [{ field: 'SortOrder', direction: 'asc' }];
                break;
        }

        const allRecords = [];
        await base('MerchProducts').select({
            filterByFormula: filterFormula,
            sort: sortConfig
        }).eachPage((records, fetchNextPage) => {
            allRecords.push(...records);
            fetchNextPage();
        });

        const products = allRecords.map(record => {
            // Extract image URL from Airtable attachment array or plain URL string
            const imgField = record.fields.Images || record.fields.Image || null;
            let images = null;
            if (Array.isArray(imgField) && imgField.length > 0) {
                images = imgField[0].url || imgField[0];
            } else if (typeof imgField === 'string') {
                images = imgField;
            }

            return {
                id: record.id,
                slug: record.fields.Slug || null,
                name: record.fields.Name,
                description: record.fields.Description || null,
                price: record.fields.Price || 0,
                comparePrice: record.fields.ComparePrice || null,
                image: images,
                images: images,
                category: record.fields.Category || null,
                sizes: record.fields.Sizes || null,
                colors: record.fields.Colors || null,
                stock: record.fields.Stock != null ? record.fields.Stock : 0,
                status: record.fields.Status || 'Active',
                badge: record.fields.Badge || null,
                isLimitedDrop: !!record.fields.IsLimitedDrop,
                dropName: record.fields.DropName || null,
                dropDate: record.fields.DropDate || null,
                sales: record.fields.Sales || 0,
                sortOrder: record.fields.SortOrder || 0,
                createdDate: record.fields.CreatedDate || null
            };
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ products })
        };
    } catch (error) {
        console.error('Get merch error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to fetch products' })
        };
    }
};
