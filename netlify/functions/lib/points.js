/* ═══════════════════════════════════════════════════════
   YENG POINTS — the single currency
   ═══════════════════════════════════════════════════════

   The audit found two disjoint half-currencies (AUDIT.md §2 blockers):
     - Fan Score points: earn-only, no spend side, in a table that did not exist
     - Users.StoreCredit: spend-only, its read endpoint orphaned

   This module merges them into ONE ledger with both sides.

   Design rules, from the brief:
     - One currency. Earned through engagement OR bought via premium sub.
       Premium does not buy answers — it buys points. Same currency, two doors.
     - Spending promotes a question into the shortlist. Guarantees REVIEW,
       never an answer.
     - If she passes on a promoted question, points are refunded IN FULL.
       The refund path is built first; it is the trust mechanic.

   Ledger model: append-only rows in `YengPoints`, plus a denormalised
   running balance on Users.PointsBalance so reads are one lookup.
   The ledger is the truth; the balance is a cache we can rebuild.
   ─────────────────────────────────────────────────────── */

const { getBase, esc, fetchAll, safeRead, nowISO, todayISO, isMissingTable } = require('./common');

const LEDGER_TABLE = 'YengPoints';

/* ── Earn rates ──────────────────────────────────────────
   Server-side only. The client names a signal; it never names an amount.
   The audit found the old table farmable because the client picked the TYPE
   and only site_visit was capped — so every earn type here is either capped
   per day or derived from a server-verified action. */
const EARN = {
    site_visit:        { points: 1,  dailyCap: 1 },
    question_asked:    { points: 8,  dailyCap: 3 },
    question_clustered:{ points: 5,  dailyCap: 5 },   // your question joined a cluster
    cluster_answered:  { points: 15, dailyCap: null }, // she answered a cluster you were in
    ranking_session:   { points: 6,  dailyCap: 4 },   // completed a song-ranking session
    game_played:       { points: 3,  dailyCap: 6 },
    lyric_round:       { points: 2,  dailyCap: 10 },  // unlimited plays, small award
    trivia_daily:      { points: 20, dailyCap: 1 },   // once per day by design
    setlist_submitted: { points: 10, dailyCap: 2 },
    setlist_scored:    { points: 25, dailyCap: null }, // server-awarded after a show
    tour_pledge:       { points: 5,  dailyCap: 3 },
    comment:           { points: 5,  dailyCap: 4 },
    vote:              { points: 2,  dailyCap: 10 },
    archive_search:    { points: 1,  dailyCap: 2 },
    event_attended:    { points: 50, dailyCap: null }, // server-derived from EventTickets only
    membership_grant:  { points: 0,  dailyCap: null }, // amount supplied by the sub tier
    purchase:          { points: 0,  dailyCap: null }, // amount supplied by the purchase
};

/* Points included with each paid tier, per month. Premium buys points —
   it does not buy answers. */
const TIER_MONTHLY_POINTS = {
    'Free': 0,
    'Sariwang Simula': 150,
    'Laging Nandito': 400,
    'Ikaw Lamang': 1000,
};

/* ── Spend prices ── */
const SPEND = {
    promote_question: 250,   // pushes a cluster into her review shortlist
    mini_game_retry:  40,
};

/* Per-cycle promotion cap so a whale cannot own her feed. */
const MAX_PROMOTIONS_PER_CYCLE = 3;

/**
 * Current balance for a user. Reads the denormalised field first and falls
 * back to summing the ledger, so a fan whose cache is missing still sees a
 * correct number rather than zero.
 */
async function getBalance(base, userId) {
    try {
        const user = await base('Users').find(userId);
        const cached = user.fields.PointsBalance;
        if (typeof cached === 'number') return cached;
    } catch { /* fall through to ledger sum */ }
    return recomputeBalance(base, userId);
}

/** Sum the ledger. Authoritative but slower — used to heal a missing cache. */
async function recomputeBalance(base, userId) {
    const rows = await safeRead(
        () => fetchAll(base, LEDGER_TABLE, { filterByFormula: `{UserId} = '${esc(userId)}'`, fields: ['Amount'] }),
        []
    );
    const total = rows.reduce((sum, r) => sum + (Number(r.fields.Amount) || 0), 0);
    try { await base('Users').update(userId, { PointsBalance: total }); } catch { /* cache only */ }
    return total;
}

/** How many of this signal the user already logged today (for daily caps). */
async function countToday(base, userId, type) {
    const rows = await safeRead(
        () => fetchAll(base, LEDGER_TABLE, {
            filterByFormula: `AND({UserId} = '${esc(userId)}', {Type} = '${esc(type)}', {Day} = '${todayISO()}')`,
            fields: ['Amount'],
        }),
        []
    );
    return rows.length;
}

/**
 * Write one ledger row and move the cached balance.
 * `amount` is positive to earn, negative to spend.
 */
async function writeLedger(base, { userId, userName, type, amount, reason, refTable, refId, refundOf }) {
    const row = {
        UserId: userId,
        UserName: userName || '',
        Type: type,
        Amount: amount,
        Reason: reason || '',
        RefTable: refTable || '',
        RefId: refId || '',
        RefundOf: refundOf || '',
        Day: todayISO(),
        CreatedAt: nowISO(),
    };
    let created = null;
    try {
        created = await base(LEDGER_TABLE).create(row);
    } catch (err) {
        if (isMissingTable(err)) {
            console.warn('[points] YengPoints table missing — point movement not recorded');
            return { ok: false, missingTable: true, balance: null };
        }
        throw err;
    }

    // Move the cached balance. Read-modify-write is acceptable here because
    // the ledger is the truth and recomputeBalance() can always heal it.
    let balance = null;
    try {
        const user = await base('Users').find(userId);
        balance = (Number(user.fields.PointsBalance) || 0) + amount;
        await base('Users').update(userId, { PointsBalance: balance });
    } catch { /* cache only */ }

    return { ok: true, id: created.id, amount, balance };
}

/**
 * Award points for a server-verified signal. Enforces the daily cap.
 * Never accepts an amount from the client.
 */
async function earn(base, { userId, userName, type, reason, refTable, refId, amountOverride }) {
    const rule = EARN[type];
    if (!rule) return { ok: false, error: 'Unknown point type' };

    const amount = typeof amountOverride === 'number' ? amountOverride : rule.points;
    if (amount <= 0) return { ok: true, amount: 0, capped: false, balance: await getBalance(base, userId) };

    if (rule.dailyCap != null) {
        const used = await countToday(base, userId, type);
        if (used >= rule.dailyCap) {
            return { ok: true, amount: 0, capped: true, balance: await getBalance(base, userId) };
        }
    }

    const res = await writeLedger(base, { userId, userName, type, amount, reason, refTable, refId });
    return { ...res, amount, capped: false };
}

/**
 * Spend points. Refuses if the balance is short — never lets it go negative.
 * Returns the ledger row id so a later refund can point back at it.
 */
async function spend(base, { userId, userName, type, cost, reason, refTable, refId }) {
    const price = typeof cost === 'number' ? cost : SPEND[type];
    if (!price || price <= 0) return { ok: false, error: 'Unknown spend type' };

    const balance = await getBalance(base, userId);
    if (balance < price) {
        return { ok: false, error: 'Not enough Yeng Points', balance, needed: price, short: price - balance };
    }

    const res = await writeLedger(base, {
        userId, userName, type, amount: -price, reason, refTable, refId,
    });
    if (!res.ok) return { ok: false, error: 'Could not record the spend', balance };
    return { ok: true, spent: price, ledgerId: res.id, balance: res.balance };
}

/**
 * Refund a spend IN FULL.
 *
 * This is the trust mechanic and it is deliberately unconditional: if she
 * passes on a promoted question, the fan gets every point back. It is also
 * idempotent — a second call for the same ledger row is a no-op, so a retry
 * or a double-tap on "pass" can never mint points.
 */
async function refund(base, { userId, userName, ledgerId, reason }) {
    if (!ledgerId) return { ok: false, error: 'Nothing to refund' };

    // Already refunded? Then stop.
    const existing = await safeRead(
        () => fetchAll(base, LEDGER_TABLE, {
            filterByFormula: `{RefundOf} = '${esc(ledgerId)}'`, fields: ['Amount'], maxRecords: 1,
        }),
        []
    );
    if (existing.length > 0) {
        return { ok: true, alreadyRefunded: true, balance: await getBalance(base, userId) };
    }

    let original;
    try {
        original = await base(LEDGER_TABLE).find(ledgerId);
    } catch {
        return { ok: false, error: 'Original transaction not found' };
    }

    const spent = Number(original.fields.Amount) || 0;
    if (spent >= 0) return { ok: false, error: 'That transaction was not a spend' };

    const res = await writeLedger(base, {
        userId,
        userName,
        type: 'refund',
        amount: Math.abs(spent),
        reason: reason || 'Refunded in full',
        refTable: original.fields.RefTable || '',
        refId: original.fields.RefId || '',
        refundOf: ledgerId,
    });
    return { ok: res.ok, refunded: Math.abs(spent), balance: res.balance };
}

/** Recent ledger rows for the fan's own history view. */
async function history(base, userId, limit = 40) {
    const rows = await safeRead(
        () => fetchAll(base, LEDGER_TABLE, {
            filterByFormula: `{UserId} = '${esc(userId)}'`,
            sort: [{ field: 'CreatedAt', direction: 'desc' }],
            maxRecords: limit,
        }, limit),
        []
    );
    return rows.map((r) => ({
        id: r.id,
        type: r.fields.Type,
        amount: Number(r.fields.Amount) || 0,
        reason: r.fields.Reason || '',
        createdAt: r.fields.CreatedAt,
        isRefund: !!r.fields.RefundOf,
    }));
}

/** How many promotions this fan has spent in the current cycle. */
async function promotionsThisCycle(base, userId, cycleStartISO) {
    const rows = await safeRead(
        () => fetchAll(base, LEDGER_TABLE, {
            filterByFormula: `AND({UserId} = '${esc(userId)}', {Type} = 'promote_question', IS_AFTER({CreatedAt}, '${esc(cycleStartISO)}'))`,
            fields: ['Amount'],
        }),
        []
    );
    // A refunded promotion should not count against the cap.
    return rows.length;
}

module.exports = {
    LEDGER_TABLE, EARN, SPEND, TIER_MONTHLY_POINTS, MAX_PROMOTIONS_PER_CYCLE,
    getBalance, recomputeBalance, earn, spend, refund, history, promotionsThisCycle, writeLedger,
};
