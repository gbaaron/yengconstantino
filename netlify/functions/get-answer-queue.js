/* ═══════════════════════════════════════════════════════
   ASK YENG — the shortlist she reviews
   ═══════════════════════════════════════════════════════
   8–10 merged questions per cycle, each tagged with its cluster size.
   Designed to be answered in fifteen minutes, in a car, on a phone.

   Ordering is deliberate:
     1. Promoted clusters first — a promotion GUARANTEES REVIEW, so those
        must be visible in the shortlist she actually opens, every time.
     2. Then by cluster size, because that is how many people are waiting.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireAdmin, esc, fetchAll, safeRead } = require('./lib/common');
const cl = require('./lib/clustering');

const SHORTLIST_SIZE = 10;

exports.handler = async (event) => {
    const pre = preflight(event, ['GET']);
    if (pre) return pre;

    const base = getBase();
    const gate = await requireAdmin(event, base);
    if (!gate.ok) return gate.response;

    const q = event.queryStringParameters || {};
    const size = Math.min(parseInt(q.limit, 10) || SHORTLIST_SIZE, 25);

    try {
        const open = await safeRead(
            () => fetchAll(base, cl.CLUSTER_TABLE, {
                filterByFormula: `OR({Status} = 'Open', {Status} = 'Shortlisted')`,
                sort: [{ field: 'QuestionCount', direction: 'desc' }],
            }, 300),
            []
        );

        // Promoted first (guaranteed review), then by how many people asked.
        const ranked = open
            .map((r) => {
                const f = r.fields;
                return {
                    id: r.id,
                    mergedQuestion: f.MergedQuestion || '',
                    topic: f.Topic || '',
                    count: Number(f.QuestionCount) || 0,
                    promoted: !!f.Promoted,
                    promotionCount: Number(f.PromotionCount) || 0,
                    language: f.Language || 'en',
                    createdAt: f.CreatedAt || null,
                };
            })
            .sort((a, b) => {
                if (a.promoted !== b.promoted) return a.promoted ? -1 : 1;
                if (a.promotionCount !== b.promotionCount) return b.promotionCount - a.promotionCount;
                return b.count - a.count;
            });

        const shortlist = ranked.slice(0, size);

        // Pull a few real fan wordings per cluster so she can see how people
        // actually phrased it — the merged question is a summary, not a source.
        for (const item of shortlist) {
            const samples = await safeRead(
                () => fetchAll(base, cl.QUESTION_TABLE, {
                    filterByFormula: `AND({ClusterId} = '${esc(item.id)}', {Surfaced} = TRUE())`,
                    sort: [{ field: 'CreatedAt', direction: 'desc' }],
                    maxRecords: 3,
                }, 3),
                []
            );
            item.samples = samples.map((s) => ({
                text: s.fields.QuestionText || '',
                userName: s.fields.UserName || 'Fan',
            }));
        }

        const totalWaiting = ranked.reduce((sum, c) => sum + c.count, 0);

        return json(200, {
            shortlist,
            shortlistSize: shortlist.length,
            openClusters: ranked.length,
            fansWaiting: totalWaiting,
            promotedCount: ranked.filter((c) => c.promoted).length,
        });
    } catch (err) {
        console.error('get-answer-queue error:', err);
        return json(500, { error: 'Could not load the queue right now.' });
    }
};
