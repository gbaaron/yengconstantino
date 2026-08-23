/* ═══════════════════════════════════════════════════════
   ASK YENG — read clusters
   ═══════════════════════════════════════════════════════
   Public. Powers the fan-facing cluster page, whose live count is the
   daily-return hook: a number that changes without the fan doing anything.

   ?id=recXXX      one cluster (with its answer, if she has answered)
   ?status=Open    filter (Open | Shortlisted | Answered | Passed)
   ?sort=count     count | recent | answered
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, esc, fetchAll, safeRead, isRecordId, verifyToken } = require('./lib/common');
const cl = require('./lib/clustering');

function shape(rec, { includeAnswer = true } = {}) {
    const f = rec.fields;
    return {
        id: rec.id,
        mergedQuestion: f.MergedQuestion || '',
        topic: f.Topic || '',
        count: Number(f.QuestionCount) || 0,
        status: f.Status || 'Open',
        promoted: !!f.Promoted,
        promotionCount: Number(f.PromotionCount) || 0,
        language: f.Language || 'en',
        createdAt: f.CreatedAt || null,
        updatedAt: f.UpdatedAt || null,
        ...(includeAnswer && f.Status === 'Answered'
            ? {
                  answeredAt: f.AnsweredAt || null,
                  answerAudioUrl: f.AnswerAudioUrl || null,
                  answerTranscript: f.AnswerTranscript || '',
                  archiveId: f.ArchiveId || null,
              }
            : {}),
    };
}

exports.handler = async (event) => {
    const pre = preflight(event, ['GET']);
    if (pre) return pre;

    const q = event.queryStringParameters || {};
    const base = getBase();

    try {
        /* ── Single cluster ── */
        if (q.id) {
            if (!isRecordId(q.id)) return json(400, { error: 'Invalid cluster id' });
            let rec;
            try {
                rec = await base(cl.CLUSTER_TABLE).find(q.id);
            } catch {
                return json(404, { error: 'Cluster not found' });
            }

            const cluster = shape(rec);

            // If the caller is signed in, tell them whether they are in it and
            // show their own wording back to them.
            const decoded = verifyToken(event);
            if (decoded) {
                const mine = await safeRead(
                    () => fetchAll(base, cl.QUESTION_TABLE, {
                        filterByFormula: `AND({ClusterId} = '${esc(q.id)}', {UserId} = '${esc(decoded.userId)}')`,
                        maxRecords: 1,
                    }, 1),
                    []
                );
                if (mine.length) {
                    cluster.youAreIn = true;
                    cluster.yourQuestion = mine[0].fields.QuestionText || '';
                }
            }

            return json(200, { cluster });
        }

        /* ── List ── */
        const status = q.status || 'Open';
        const limit = Math.min(parseInt(q.limit, 10) || 30, 100);
        const validStatus = ['Open', 'Shortlisted', 'Answered', 'Passed', 'All'];
        if (!validStatus.includes(status)) return json(400, { error: 'Invalid status' });

        const sortField =
            q.sort === 'recent' ? 'CreatedAt'
            : q.sort === 'answered' ? 'AnsweredAt'
            : 'QuestionCount';

        const rows = await safeRead(
            () => fetchAll(base, cl.CLUSTER_TABLE, {
                ...(status === 'All' ? {} : { filterByFormula: `{Status} = '${esc(status)}'` }),
                sort: [{ field: sortField, direction: 'desc' }],
            }, limit),
            []
        );

        return json(200, {
            clusters: rows.map((r) => shape(r)),
            count: rows.length,
            status,
        });
    } catch (err) {
        console.error('get-clusters error:', err);
        return json(500, { error: 'Could not load questions right now.' });
    }
};
