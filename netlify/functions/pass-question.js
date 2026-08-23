/* ═══════════════════════════════════════════════════════
   ASK YENG — pass on a question (one tap), and refund in full
   ═══════════════════════════════════════════════════════

   The brief: "She can pass on anything with one tap." and
   "If she passes on a promoted question, the points are refunded in full.
    Build the refund path first; it's the trust mechanic."

   So this endpoint's real job is the refund. Passing is trivial; refunding
   correctly — for every promoter, exactly once, even on a double-tap — is
   the part that has to be right.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireAdmin, esc, fetchAll, safeRead, isRecordId, nowISO } = require('./lib/common');
const points = require('./lib/points');
const cl = require('./lib/clustering');

const PROMOTION_TABLE = 'Promotions';

exports.handler = async (event) => {
    const pre = preflight(event, ['POST']);
    if (pre) return pre;

    const base = getBase();
    const gate = await requireAdmin(event, base);
    if (!gate.ok) return gate.response;

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return json(400, { error: 'Invalid request' });
    }

    const clusterId = body.clusterId;
    if (!isRecordId(clusterId)) return json(400, { error: 'Invalid question id' });

    try {
        let cluster;
        try {
            cluster = await base(cl.CLUSTER_TABLE).find(clusterId);
        } catch {
            return json(404, { error: 'Question not found' });
        }

        if ((cluster.fields.Status || '') === 'Answered') {
            return json(400, { error: 'That one is already answered.' });
        }

        /* ── Refund every active promotion on this cluster ──
           points.refund() is idempotent per ledger row, so a retry or a
           double-tap on "pass" cannot mint points. */
        const promotions = await safeRead(
            () => fetchAll(base, PROMOTION_TABLE, {
                filterByFormula: `AND({ClusterId} = '${esc(clusterId)}', {Status} = 'Active')`,
            }),
            []
        );

        const refunds = [];
        for (const p of promotions) {
            const result = await points.refund(base, {
                userId: p.fields.UserId,
                userName: p.fields.UserName,
                ledgerId: p.fields.LedgerId,
                reason: 'Yeng passed on this question — points returned in full',
            });

            if (result.ok) {
                await base(PROMOTION_TABLE).update(p.id, {
                    Status: 'Refunded',
                    RefundedAt: nowISO(),
                });
                refunds.push({
                    userId: p.fields.UserId,
                    userName: p.fields.UserName,
                    refunded: result.refunded || p.fields.PointsSpent || 0,
                    alreadyRefunded: !!result.alreadyRefunded,
                });
            } else {
                console.error('[pass-question] refund failed for promotion', p.id, result.error);
            }
        }

        /* ── Close the cluster ──
           Passed clusters are retained, not deleted. What she declines to
           answer is itself a record. */
        await base(cl.CLUSTER_TABLE).update(clusterId, {
            Status: 'Passed',
            PassedAt: nowISO(),
            PassReason: String(body.reason || '').slice(0, 300),
            UpdatedAt: nowISO(),
        });

        const totalRefunded = refunds.reduce((s, r) => s + (r.refunded || 0), 0);

        return json(200, {
            passed: true,
            refunds,
            refundedUsers: refunds.length,
            totalPointsRefunded: totalRefunded,
            message: refunds.length
                ? `Passed. ${refunds.length} ${refunds.length === 1 ? 'fan has' : 'fans have'} had ${totalRefunded} points returned in full.`
                : 'Passed.',
        });
    } catch (err) {
        console.error('pass-question error:', err);
        return json(500, { error: 'Could not pass on that question right now.' });
    }
};
