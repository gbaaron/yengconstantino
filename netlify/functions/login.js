const Airtable = require('airtable');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

    try {
        const { email, login, password } = JSON.parse(event.body);
        const identifier = (login || email || '').trim();

        if (!identifier || !password) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Email/username and password are required' })
            };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Find user by email OR username
        const escaped = identifier.replace(/'/g, "\\'");
        const records = await base('Users').select({
            filterByFormula: `OR({Email} = '${escaped}', {Username} = '${escaped}')`,
            maxRecords: 1
        }).firstPage();

        if (records.length === 0) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Invalid email/username or password' })
            };
        }

        const user = records[0];
        const fields = user.fields;

        // Compare password
        const isValid = await bcrypt.compare(password, fields.Password);
        if (!isValid) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Invalid email or password' })
            };
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: fields.Email, username: fields.Username, role: fields.Role || 'User' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    name: fields.Name,
                    email: fields.Email,
                    username: fields.Username,
                    membershipTier: fields.MembershipTier || 'Free',
                    avatar: fields.Avatar || null,
                    bio: fields.Bio || null,
                    role: fields.Role || 'User'
                }
            })
        };
    } catch (error) {
        console.error('Login error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to authenticate' })
        };
    }
};
