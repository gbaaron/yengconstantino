/* ═══════════════════════════════════════════════════════
   ASK YENG — promote a cluster with Yeng Points
   ═══════════════════════════════════════════════════════

   Spending points promotes a question into the shortlist she reviews.
   It GUARANTEES REVIEW. It never guarantees an answer, and every string
   in this file is careful about that distinction.

   If she passes, the points come back in full — see pass-question.js.
   The spend records its ledger id on the promotion row so the refund is a
   direct pointer, not a reconstruction.

   Promotions are capped per cycle per user so a whale can't own her feed.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireUser, esc, fetchAll, safeRead, isRecordId, nowISO } = require('./lib/common');
const points = require('./lib/points');
const cl = require('./lib/clustering');

const PROMOTION_TABLE = 'Promotions';

/** Cycles are weekly, starting Monday 00:00 Manila (UTC+8). */
function currentCycleStart() {
    const now = new Date();
    const manila = new Date(now.getTime() + 8 * 3600000);
    const dow = manila.getUTCDay();              // 0 = Sun
    const daysSinceMonday = (dow + 6) % 7;
    manila.setUTCDate(manila.getUTCDate() - daysSinceMonday);
    manila.setUTCHours(0, 0, 0, 0);
    return new Date(manila.getTime() - 8 * 3600000).toISOString();
}

exports.handler = async (event) => {
    const pre = preflight(event, ['POST']);
    if (pre) return pre;

    const auth = await requireUser(event);
    if (!auth.ok) return auth.response;
    const { decoded } = auth;

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return json(400, { error: 'Invalid request' });
    }

    const clusterId = body.clusterId;
    if (!isRecordId(clusterId)) return json(400, { error: 'Invalid question id' });

    const base = getBase();
    const cycleStart = currentCycleStart();

    try {
        const user = await base('Users').find(decoded.userId);
        const userName = user.fields.Name || user.fields.Username || 'Fan';

        /* ── Cluster must exist and still be open ── */
        let cluster;
        try {
            cluster = await base(cl.CLUSTER_TABLE).find(clusterId);
        } catch {
            return json(404, { error: 'That question is no longer available.' });
        }

        const status = cluster.fields.Status || 'Open';
        if (status === 'Answered') {
            return json(400, { error: 'Yeng has already answered this one.' });
        }
        if (status === 'Passed') {
            return json(400, { error: 'This question is closed.' });
        }

        /* ── Already promoted by this fan? ── */
        const existing = await safeRead(
            () => fetchAll(base, PROMOTION_TABLE, {
                filterByFormula: `AND({ClusterId} = '${esc(clusterId)}', {UserId} = '${esc(decoded.userId)}', {Status} = 'Active')`,
                maxRecords: 1,
            }, 1),
            []
        );
        if (existing.length) {
            return json(400, { error: "You've already promoted this question." });
        }

        /* ── Per-cycle cap ── */
        const used = await safeRead(
            () => fetchAll(base, PROMOTION_TABLE, {
                filterByFormula: `AND({UserId} = '${esc(decoded.userId)}', {Status} = 'Active', IS_AFTER({CreatedAt}, '${esc(cycleStart)}'))`,
                fields: ['ClusterId'],
            }),
            []
        );
        if (used.length >= points.MAX_PROMOTIONS_PER_CYCLE) {
            return json(400, {
                error: `You can promote ${points.MAX_PROMOTIONS_PER_CYCLE} questions per week. Yours reset on Monday.`,
                cap: points.MAX_PROMOTIONS_PER_CYCLE,
                used: used.length,
            });
        }

        /* ── Spend ── */
        const spendResult = await points.spend(base, {
            userId: decoded.userId,
            userName,
            type: 'promote_question',
            reason: 'Promoted a question into Yeng\'s review shortlist',
            refTable: cl.CLUSTER_TABLE,
            refId: clusterId,
        });

        if (!spendResult.ok) {
            return json(400, {
                error: spendResult.error,
                balance: spendResult.balance,
                needed: spendResult.needed,
                short: spendResult.short,
            });
        }

        /* ── Record the promotion, holding the ledger id for the refund ── */
        await base(PROMOTION_TABLE).create({
            ClusterId: clusterId,
            UserId: decoded.userId,
            UserName: userName,
            PointsSpent: spendResult.spent,
            LedgerId: spendResult.ledgerId,   // the refund pointer
            Status: 'Active',
            CycleStart: cycleStart,
            CreatedAt: nowISO(),
        });

        /* ── Mark the cluster ── */
        const promotionCount = (Number(cluster.fields.PromotionCount) || 0) + 1;
        await base(cl.CLUSTER_TABLE).update(clusterId, {
            Promoted: true,
            PromotionCount: promotionCount,
            Status: status === 'Open' ? 'Shortlisted' : status,
            UpdatedAt: nowISO(),
        });

        return json(200, {
            promoted: true,
            // Language here is load-bearing: review, not an answer.
            message: 'Locked in. This question now goes into the shortlist Yeng reviews. If she passes on it, your points come straight back.',
            guarantee: 'review',
            pointsSpent: spendResult.spent,
            balance: spendResult.balance,
            promotionsUsed: used.length + 1,
            promotionsAllowed: points.MAX_PROMOTIONS_PER_CYCLE,
        });
    } catch (err) {
        console.error('promote-question error:', err);
        return json(500, { error: 'Could not promote that question right now.' });
    }
};
