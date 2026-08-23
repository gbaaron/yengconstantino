/* ═══════════════════════════════════════════════════════
   SIGNUP
   ═══════════════════════════════════════════════════════
   Now hashes with bcrypt (the old version wrote `Password: password`
   verbatim — AUDIT.md §3.5 #1), and returns the token directly so the
   client no longer has to make a second round trip to /login.

   Role and MembershipTier stay hardcoded server-side so a crafted request
   cannot self-elevate at signup — that part the original got right.
   ═══════════════════════════════════════════════════════ */

const bcrypt = require('bcryptjs');
const { preflight, json, getBase, esc, signToken, todayISO } = require('./lib/common');

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD = 8;

exports.handler = async (event) => {
    const pre = preflight(event, ['POST']);
    if (pre) return pre;

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return json(400, { error: 'Invalid request' });
    }

    const name = String(body.name || '').trim();
    const username = String(body.username || '').trim().toLowerCase();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const acceptedTerms = body.acceptedTerms === true;

    if (!name || !username || !email || !password) {
        return json(400, { error: 'All fields are required: name, username, email, password' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
        return json(400, { error: 'That email address does not look right.' });
    }
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        return json(400, { error: 'Usernames are 3–20 characters: letters, numbers and underscores.' });
    }
    if (password.length < MIN_PASSWORD) {
        return json(400, { error: `Use at least ${MIN_PASSWORD} characters for your password.` });
    }
    if (!acceptedTerms) {
        return json(400, { error: 'Please accept the terms and privacy notice to continue.' });
    }

    try {
        const base = getBase();

        const existingEmail = await base('Users').select({
            filterByFormula: `{Email} = '${esc(email)}'`, maxRecords: 1,
        }).firstPage();
        if (existingEmail.length > 0) {
            return json(409, { error: 'An account with this email already exists' });
        }

        const existingUsername = await base('Users').select({
            filterByFormula: `{Username} = '${esc(username)}'`, maxRecords: 1,
        }).firstPage();
        if (existingUsername.length > 0) {
            return json(409, { error: 'This username is already taken' });
        }

        const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const record = await base('Users').create({
            Name: name,
            Username: username,
            Email: email,
            Password: hash,
            MembershipTier: 'Free',
            Role: 'User',
            PointsBalance: 0,
            AcceptedTermsAt: new Date().toISOString(),
            JoinDate: todayISO(),
        });

        // Return the token here — the old flow made the page call /login again
        // immediately afterwards for no reason.
        const token = signToken({
            userId: record.id, email, username, role: 'User',
        });

        return json(201, {
            message: 'Account created successfully',
            token,
            user: {
                id: record.id,
                name,
                username,
                email,
                membershipTier: 'Free',
                role: 'User',
                pointsBalance: 0,
                joinDate: todayISO(),
            },
        });
    } catch (error) {
        console.error('Signup error:', error);
        return json(500, { error: 'Failed to create account' });
    }
};
