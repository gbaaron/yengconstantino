/* ═══════════════════════════════════════════════════════
   ASK YENG — the fan's own questions and their cluster status
   ═══════════════════════════════════════════════════════
   Shows the fan their version alongside the merged question and the live
   cluster count. Shadowbanned rows are returned looking completely normal —
   the fan sees their own submissions exactly as anyone else would.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireUser, esc, fetchAll, safeRead } = require('./lib/common');
const cl = require('./lib/clustering');

const PROMOTION_TABLE = 'Promotions';

exports.handler = async (event) => {
    const pre = preflight(event, ['GET']);
    if (pre) return pre;

    const auth = await requireUser(event);
    if (!auth.ok) return auth.response;
    const { decoded } = auth;

    const base = getBase();
    const limit = Math.min(parseInt((event.queryStringParameters || {}).limit, 10) || 25, 100);

    try {
        const mine = await safeRead(
            () => fetchAll(base, cl.QUESTION_TABLE, {
                filterByFormula: `{UserId} = '${esc(decoded.userId)}'`,
                sort: [{ field: 'CreatedAt', direction: 'desc' }],
            }, limit),
            []
        );

        // Batch the cluster lookups rather than one find() per question.
        const clusterIds = [...new Set(mine.map((q) => q.fields.ClusterId).filter(Boolean))];
        const clusters = {};
        for (const id of clusterIds) {
            try {
                const rec = await base(cl.CLUSTER_TABLE).find(id);
                clusters[id] = rec.fields;
            } catch { /* cluster may have been merged away */ }
        }

        const myPromotions = await safeRead(
            () => fetchAll(base, PROMOTION_TABLE, {
                filterByFormula: `{UserId} = '${esc(decoded.userId)}'`,
            }, 200),
            []
        );
        const promotedBy = {};
        for (const p of myPromotions) {
            promotedBy[p.fields.ClusterId] = {
                status: p.fields.Status,
                pointsSpent: Number(p.fields.PointsSpent) || 0,
                refunded: p.fields.Status === 'Refunded',
            };
        }

        const questions = mine.map((q) => {
            const cid = q.fields.ClusterId;
            const c = cid ? clusters[cid] : null;
            return {
                id: q.id,
                yourQuestion: q.fields.QuestionText || '',
                createdAt: q.fields.CreatedAt,
                language: q.fields.Language || 'en',
                cluster: c
                    ? {
                          id: cid,
                          mergedQuestion: c.MergedQuestion || '',
                          topic: c.Topic || '',
                          count: Number(c.QuestionCount) || 0,
                          status: c.Status || 'Open',
                          answeredAt: c.AnsweredAt || null,
                          answerAudioUrl: c.Status === 'Answered' ? c.AnswerAudioUrl || null : null,
                          answerTranscript: c.Status === 'Answered' ? c.AnswerTranscript || '' : '',
                      }
                    : null,
                promotion: cid ? promotedBy[cid] || null : null,
            };
        });

        return json(200, {
            questions,
            count: questions.length,
            answered: questions.filter((q) => q.cluster && q.cluster.status === 'Answered').length,
        });
    } catch (err) {
        console.error('get-my-questions error:', err);
        return json(500, { error: 'Could not load your questions right now.' });
    }
};
