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
        const { name, username, email, password } = JSON.parse(event.body);

        if (!name || !username || !email || !password) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'All fields are required: name, username, email, password' })
            };
        }

        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

        // Check for existing email
        const existingEmail = await base('Users').select({
            filterByFormula: `{Email} = '${email.replace(/'/g, "\\'")}'`,
            maxRecords: 1
        }).firstPage();

        if (existingEmail.length > 0) {
            return {
                statusCode: 409,
                headers,
                body: JSON.stringify({ error: 'An account with this email already exists' })
            };
        }

        // Check for existing username
        const existingUsername = await base('Users').select({
            filterByFormula: `{Username} = '${username.replace(/'/g, "\\'")}'`,
            maxRecords: 1
        }).firstPage();

        if (existingUsername.length > 0) {
            return {
                statusCode: 409,
                headers,
                body: JSON.stringify({ error: 'This username is already taken' })
            };
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user record
        const record = await base('Users').create({
            Name: name,
            Username: username,
            Email: email,
            Password: hashedPassword,
            MembershipTier: 'Free',
            JoinDate: new Date().toISOString().split('T')[0]
        });

        // Generate JWT token
        const token = jwt.sign(
            { userId: record.id, email, username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                message: 'Account created successfully',
                token,
                user: {
                    id: record.id,
                    name,
                    username,
                    email,
                    membershipTier: 'Free',
                    joinDate: new Date().toISOString().split('T')[0]
                }
            })
        };
    } catch (error) {
        console.error('Signup error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to create account' })
        };
    }
};
