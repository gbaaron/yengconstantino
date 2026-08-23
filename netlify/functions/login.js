/* ═══════════════════════════════════════════════════════
   LOGIN
   ═══════════════════════════════════════════════════════
   Passwords were previously stored and compared in PLAINTEXT
   (`fields.Password !== password`) while bcryptjs sat unused in
   package.json — the worst finding in the audit (§3.5 #1).

   This version compares with bcrypt, and TRANSPARENTLY MIGRATES: if a stored
   value is still plaintext, we verify it once, immediately re-write it as a
   hash, and the account is upgraded without the fan noticing. Existing
   accounts keep working; nobody has to reset anything.

   Run scripts/hash-existing-passwords.js to migrate everyone at once instead
   of waiting for each fan's next login.
   ═══════════════════════════════════════════════════════ */

const bcrypt = require('bcryptjs');
const { preflight, json, getBase, esc, signToken } = require('./lib/common');

const BCRYPT_ROUNDS = 10;

/** bcrypt hashes always start with $2a$ / $2b$ / $2y$ and are 60 chars. */
function isHashed(value) {
    return typeof value === 'string' && /^\$2[aby]\$\d{2}\$.{53}$/.test(value);
}

exports.handler = async (event) => {
    const pre = preflight(event, ['POST']);
    if (pre) return pre;

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return json(400, { error: 'Invalid request' });
    }

    const identifier = String(body.login || body.email || '').trim();
    const password = String(body.password || '');

    if (!identifier || !password) {
        return json(400, { error: 'Email/username and password are required' });
    }

    try {
        const base = getBase();

        const escaped = esc(identifier);
        const records = await base('Users').select({
            filterByFormula: `OR({Email} = '${escaped}', {Username} = '${escaped}')`,
            maxRecords: 1,
        }).firstPage();

        // Same message and roughly the same work for "no such user" and
        // "wrong password", so the endpoint doesn't enumerate accounts.
        if (records.length === 0) {
            await bcrypt.compare(password, '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
            return json(401, { error: 'Invalid email/username or password' });
        }

        const user = records[0];
        const fields = user.fields;
        const stored = fields.Password || '';

        let valid = false;
        let needsMigration = false;

        if (isHashed(stored)) {
            valid = await bcrypt.compare(password, stored);
        } else {
            // Legacy plaintext row. Verify, then upgrade in place.
            valid = stored === password;
            needsMigration = valid;
        }

        if (!valid) {
            return json(401, { error: 'Invalid email/username or password' });
        }

        if (needsMigration) {
            try {
                const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
                await base('Users').update(user.id, { Password: hash });
                console.log('[login] migrated plaintext password for', user.id);
            } catch (err) {
                // Never block a valid login on the migration.
                console.error('[login] password migration failed:', err.message);
            }
        }

        const token = signToken({
            userId: user.id,
            email: fields.Email,
            username: fields.Username,
            role: fields.Role || 'User',
        });

        return json(200, {
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
                role: fields.Role || 'User',
                pointsBalance: Number(fields.PointsBalance) || 0,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        return json(500, { error: 'Failed to authenticate' });
    }
};
