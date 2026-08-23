/* ═══════════════════════════════════════════════════════
   CAMEO — the request queue, WITH fan context
   ═══════════════════════════════════════════════════════

   The differentiator: when she opens a request she sees who this person
   actually is — how long they've been on the platform, what they've asked,
   which shows they've registered for, their leaderboard standing.
   "This is from your number three fan."

   Better videos for the fan, less blank-page problem for her.

   The audit found the old admin card rendering five fields and nothing else,
   even though every one of these signals already existed across four
   endpoints (AUDIT.md §2 feature 4). This joins them.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireAdmin, esc, fetchAll, safeRead } = require('./lib/common');
const cl = require('./lib/clustering');
const points = require('./lib/points');

const TABLE = 'MessageRequests';

function monthsSince(iso) {
    if (!iso) return null;
    const then = new Date(iso);
    if (isNaN(then)) return null;
    return Math.max(0, Math.round((Date.now() - then.getTime()) / (30 * 86400000)));
}

exports.handler = async (event) => {
    const pre = preflight(event, ['GET']);
    if (pre) return pre;

    const base = getBase();
    const gate = await requireAdmin(event, base);
    if (!gate.ok) return gate.response;

    const q = event.queryStringParameters || {};
    const status = q.status || 'Pending';

    try {
        const requests = await safeRead(
            () => fetchAll(base, TABLE, {
                ...(status === 'All' ? {} : { filterByFormula: `{Status} = '${esc(status)}'` }),
                sort: [{ field: 'RequestedAt', direction: 'asc' }],
            }, 100),
            []
        );

        // Rank every fan by points so we can say "your number three fan".
        const ledger = await safeRead(() => fetchAll(base, points.LEDGER_TABLE, {}, 10000), []);
        const totals = new Map();
        for (const r of ledger) {
            const uid = r.fields.UserId;
            if (!uid) continue;
            totals.set(uid, (totals.get(uid) || 0) + (Number(r.fields.Amount) || 0));
        }
        const standings = [...totals.entries()]
            .sort((a, b) => b[1] - a[1])
            .reduce((acc, [uid], i) => { acc[uid] = i + 1; return acc; }, {});
        const totalRanked = Object.keys(standings).length;

        const enriched = [];

        // Resolve email -> record id once, because rows written before the
        // UserId field existed carry only UserEmail. Without this the whole
        // fan-context join silently finds nothing on real data.
        const allUsers = await safeRead(() => fetchAll(base, 'Users', {}, 5000), []);
        const byEmail = new Map(
            allUsers
                .filter((u) => u.fields.Email)
                .map((u) => [String(u.fields.Email).toLowerCase(), u.id])
        );

        for (const r of requests) {
            const f = r.fields;
            const userId = f.UserId
                || (f.UserEmail ? byEmail.get(String(f.UserEmail).toLowerCase()) : null)
                || null;

            const context = {
                available: false,
                tenureMonths: null,
                tier: null,
                pointsBalance: null,
                leaderboardRank: null,
                totalFans: totalRanked,
                questionsAsked: 0,
                clustersAnswered: 0,
                showsRegistered: 0,
                ordersPlaced: 0,
                headline: null,
            };

            if (userId) {
                try {
                    const user = await base('Users').find(userId);
                    context.available = true;
                    context.tenureMonths = monthsSince(user.fields.JoinDate);
                    context.tier = user.fields.MembershipTier || 'Free';
                    context.pointsBalance = Number(user.fields.PointsBalance) || 0;
                    context.leaderboardRank = standings[userId] || null;
                } catch { /* user may have been removed */ }

                const [theirQuestions, theirTickets, theirOrders] = await Promise.all([
                    safeRead(() => fetchAll(base, cl.QUESTION_TABLE, {
                        filterByFormula: `{UserId} = '${esc(userId)}'`,
                    }, 200), []),
                    safeRead(() => fetchAll(base, 'EventTickets', {
                        filterByFormula: `{UserId} = '${esc(userId)}'`,
                    }, 100), []),
                    safeRead(() => fetchAll(base, 'Orders', {
                        filterByFormula: `{UserId} = '${esc(userId)}'`,
                    }, 100), []),
                ]);

                context.questionsAsked = theirQuestions.length;
                context.clustersAnswered = theirQuestions.filter((x) => (x.fields.Status || '') === 'Answered').length;
                context.showsRegistered = theirTickets.length;
                context.ordersPlaced = theirOrders.length;

                // The three most recent things they asked — the single most
                // useful thing to see before recording for someone.
                context.recentQuestions = theirQuestions
                    .sort((a, b) => String(b.fields.CreatedAt).localeCompare(String(a.fields.CreatedAt)))
                    .slice(0, 3)
                    .map((x) => x.fields.QuestionText || '')
                    .filter(Boolean);

                /* The one-line headline she actually reads. */
                if (context.leaderboardRank && context.leaderboardRank <= 10) {
                    context.headline = `This is from your number ${context.leaderboardRank} fan.`;
                } else if (context.tenureMonths != null && context.tenureMonths >= 12) {
                    context.headline = `With you ${Math.floor(context.tenureMonths / 12)} year${context.tenureMonths >= 24 ? 's' : ''}.`;
                } else if (context.showsRegistered > 0) {
                    context.headline = `Been to ${context.showsRegistered} of your show${context.showsRegistered === 1 ? '' : 's'}.`;
                } else if (context.questionsAsked > 0) {
                    context.headline = `Asked you ${context.questionsAsked} question${context.questionsAsked === 1 ? '' : 's'}.`;
                }
            }

            enriched.push({
                id: r.id,
                type: f.Type || 'Video',
                status: f.Status || 'Pending',
                occasion: f.Occasion || '',
                recipientName: f.RecipientName || '',
                instructions: f.PersonalInstructions || '',
                price: Number(f.Price) || 0,
                discountApplied: f.DiscountApplied || '',
                requestedAt: f.RequestedAt || null,
                deliveryUrl: f.DeliveryURL || null,
                fan: {
                    userId: userId || null,
                    name: f.UserName || 'Fan',
                    email: f.UserEmail || '',
                    ...context,
                },
            });
        }

        return json(200, {
            requests: enriched,
            count: enriched.length,
            status,
        });
    } catch (err) {
        console.error('get-cameo-queue error:', err);
        return json(500, { error: 'Could not load the request queue right now.' });
    }
};
