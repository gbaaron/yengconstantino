/* ═══════════════════════════════════════════════════════
   SHARED FUNCTION HELPERS
   One place for CORS, JWT, Airtable init, formula escaping and
   the admin gate. Before this file those blocks were copy-pasted
   into 44 handlers (~458 duplicated lines) — see AUDIT.md §1.2.
   ═══════════════════════════════════════════════════════ */

const Airtable = require('airtable');
const jwt = require('jsonwebtoken');

/* ── CORS ───────────────────────────────────────────────
   Origin stays '*' because the Capacitor app calls these from the
   capacitor:// scheme, which cannot be allowlisted by origin. All
   privileged endpoints are JWT-gated, so a wildcard origin only
   exposes what a stolen token would expose anyway.
   ─────────────────────────────────────────────────────── */
function corsHeaders(methods = 'GET, POST, OPTIONS') {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': methods,
        'Content-Type': 'application/json',
    };
}

function json(statusCode, body, methods) {
    return { statusCode, headers: corsHeaders(methods), body: JSON.stringify(body) };
}

/**
 * Standard handler preamble. Returns a response object to return
 * immediately, or null if the request should proceed.
 */
function preflight(event, allowed = ['GET']) {
    const methods = [...new Set([...allowed, 'OPTIONS'])].join(', ');
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders(methods), body: '' };
    }
    if (!allowed.includes(event.httpMethod)) {
        return json(405, { error: 'Method not allowed' }, methods);
    }
    return null;
}

/* ── Airtable ── */
function getBase() {
    return new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
}

/**
 * Airtable formula string escaping.
 *
 * The old project-wide escape was `.replace(/'/g, "\\'")`, which escapes the
 * quote but NOT the backslash — so a payload beginning with a backslash
 * escapes the escape and breaks out of the string literal (AUDIT.md §3.5 #5).
 * Backslash must be doubled FIRST, then the quote escaped.
 */
function esc(value) {
    return String(value == null ? '' : value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

/** Airtable record IDs are always /^rec[A-Za-z0-9]{14}$/. Reject anything else. */
function isRecordId(id) {
    return typeof id === 'string' && /^rec[A-Za-z0-9]{14}$/.test(id);
}

/**
 * Page through an entire table. Airtable returns 100 records per page;
 * `.all()` handles the offset loop for us but has no cap, so we bound it.
 */
async function fetchAll(base, table, selectOpts = {}, maxRecords = 5000) {
    const out = [];
    await base(table).select({ pageSize: 100, ...selectOpts }).eachPage((records, next) => {
        out.push(...records);
        if (out.length >= maxRecords) return; // stop paging
        next();
    });
    return out.slice(0, maxRecords);
}

/**
 * True if the table simply does not exist in the base.
 * Airtable returns the same error for "missing table" and "no permission".
 * Several features ship before their table is created, and the audit found
 * the previous code crashing rather than degrading — so callers use this to
 * return an honest empty state instead of a 500.
 */
function isMissingTable(err) {
    if (!err) return false;
    const code = err.error || err.type || '';
    const msg = err.message || '';

    // The airtable SDK reports a table that does not exist as NOT_AUTHORIZED
    // (403), NOT the INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND string the REST
    // API returns. Both mean the same thing to us: we cannot read this table,
    // so return an empty state rather than a 500.
    return (
        code === 'NOT_FOUND' ||
        code === 'TABLE_NOT_FOUND' ||
        code === 'NOT_AUTHORIZED' ||
        code === 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND' ||
        err.statusCode === 404 ||
        (err.statusCode === 403 && /INVALID_PERMISSIONS|MODEL_NOT_FOUND|NOT_AUTHORIZED|not authorized/i.test(msg + code))
    );
}

/** Run a read that may target a not-yet-created table. Returns `fallback` if absent. */
async function safeRead(fn, fallback = []) {
    try {
        return await fn();
    } catch (err) {
        if (isMissingTable(err)) {
            console.warn('[safeRead] table missing, degrading gracefully:', err.message || err.error);
            return fallback;
        }
        throw err;
    }
}

/* ── Auth ── */
function verifyToken(event) {
    const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
    if (!auth) return null;
    try {
        return jwt.verify(auth.replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET);
    } catch {
        return null;
    }
}

function signToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Admin gate. Always re-reads Role from Airtable rather than trusting the
 * token claim, so a demotion takes effect immediately instead of at token
 * expiry (AUDIT.md §3.5 #7 — update-site-config.js was the lone offender).
 * Returns { ok:true, decoded, user } or { ok:false, response }.
 */
async function requireAdmin(event, base) {
    const decoded = verifyToken(event);
    if (!decoded) return { ok: false, response: json(401, { error: 'Unauthorized' }) };
    try {
        const user = await base('Users').find(decoded.userId);
        const role = user.fields.Role || 'User';
        if (role !== 'Admin' && role !== 'SuperAdmin') {
            return { ok: false, response: json(403, { error: 'Admin access required' }) };
        }
        return { ok: true, decoded, user, role };
    } catch {
        return { ok: false, response: json(403, { error: 'Admin access required' }) };
    }
}

async function requireUser(event) {
    const decoded = verifyToken(event);
    if (!decoded) return { ok: false, response: json(401, { error: 'Please log in' }) };
    return { ok: true, decoded };
}

/* ── Misc ── */
const nowISO = () => new Date().toISOString();
const todayISO = () => new Date().toISOString().split('T')[0];

/** Airtable batches cap at 10 records and the API at 5 req/sec. */
function chunk(arr, size = 10) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Create many records, respecting Airtable's batch size and rate limit. */
async function createAll(base, table, records) {
    const batches = chunk(records, 10);
    const created = [];
    for (const b of batches) {
        created.push(...(await base(table).create(b)));
        await sleep(250);
    }
    return created;
}

/** Airtable long-text fields cap at 100k characters. */
function clampLongText(value, limit = 99000) {
    const s = String(value == null ? '' : value);
    return s.length > limit ? s.slice(0, limit) : s;
}

/** Parse a JSON string column without letting one bad row 500 the endpoint. */
function safeJSON(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

/** Escape user content destined for innerHTML on the client. */
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Only http(s) URLs may be stored or handed back to a browser. */
function isSafeUrl(url) {
    if (typeof url !== 'string' || url.length > 2000) return false;
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

/* ── Membership tiers (single source of truth) ──
   These were duplicated across create-order.js, create-event-ticket.js and
   create-message-request.js with drifting values (AUDIT.md §1.1). */
const TIERS = ['Free', 'Sariwang Simula', 'Laging Nandito', 'Ikaw Lamang'];
const TIER_DISCOUNTS = { Free: 0, 'Sariwang Simula': 5, 'Laging Nandito': 10, 'Ikaw Lamang': 15 };
const TIER_RANK = { Free: 0, 'Sariwang Simula': 1, 'Laging Nandito': 2, 'Ikaw Lamang': 3 };

function tierAtLeast(tier, minimum) {
    return (TIER_RANK[tier] || 0) >= (TIER_RANK[minimum] || 0);
}

module.exports = {
    corsHeaders, json, preflight,
    getBase, esc, isRecordId, fetchAll, isMissingTable, safeRead,
    verifyToken, signToken, requireAdmin, requireUser,
    nowISO, todayISO, chunk, sleep, createAll, clampLongText, safeJSON, escapeHtml, isSafeUrl,
    TIERS, TIER_DISCOUNTS, TIER_RANK, tierAtLeast,
};
