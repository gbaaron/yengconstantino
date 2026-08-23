/* ═══════════════════════════════════════════════════════
   SCHEDULED — tidy the cluster set (hourly, see netlify.toml)
   ═══════════════════════════════════════════════════════

   Submission-time clustering is greedy and single-pass, which is the right
   trade for a request the fan is waiting on. This job does the work that
   greedy matching cannot:

     1. MERGE near-duplicate clusters that formed independently (two people
        asking the same thing within the same second both create a cluster).
     2. REFRESH the merged question text once a cluster has enough samples to
        be summarised well — the seed wording is whoever asked first.
     3. RECOUNT from the questions table so a failed write can self-heal.

   Guarded by a shared secret. The audit found compute-leaderboard.js was
   publicly invocable and destructive (§3.5 #9); this one is not.
   ═══════════════════════════════════════════════════════ */

const { getBase, fetchAll, safeRead, nowISO, sleep } = require('./lib/common');
const cl = require('./lib/clustering');

/* Higher than the submit-time threshold: merging two established clusters is
   more disruptive than routing one new question, so it needs more confidence. */
const MERGE_THRESHOLD = 0.62;
const REFRESH_AT_COUNT = 5;

function isScheduledInvocation(event) {
    // Netlify scheduled functions post an event body with a next_run field.
    if (event && event.body) {
        try {
            if (JSON.parse(event.body).next_run) return true;
        } catch { /* not a schedule payload */ }
    }
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const header = (event.headers && (event.headers['x-cron-secret'] || event.headers['X-Cron-Secret'])) || '';
    return header === secret;
}

exports.handler = async (event) => {
    if (!isScheduledInvocation(event)) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    const base = getBase();
    const stats = { merged: 0, refreshed: 0, recounted: 0, scanned: 0 };

    try {
        const clusters = await safeRead(
            () => fetchAll(base, cl.CLUSTER_TABLE, {
                filterByFormula: `{Status} = 'Open'`,
                sort: [{ field: 'QuestionCount', direction: 'desc' }],
            }, 500),
            []
        );
        stats.scanned = clusters.length;

        const absorbed = new Set();

        /* ── 1. Merge near-duplicates ──
           Iterate largest-first so the bigger cluster always absorbs the
           smaller one. That keeps the surviving cluster's id stable for any
           fan already looking at it. */
        for (let i = 0; i < clusters.length; i++) {
            const a = clusters[i];
            if (absorbed.has(a.id)) continue;
            const aTokens = (a.fields.Signature || '').split(' ').filter(Boolean);
            if (!aTokens.length) continue;

            for (let j = i + 1; j < clusters.length; j++) {
                const b = clusters[j];
                if (absorbed.has(b.id)) continue;
                const bTokens = (b.fields.Signature || '').split(' ').filter(Boolean);
                if (!bTokens.length) continue;

                if (cl.similarity(aTokens, bTokens) < MERGE_THRESHOLD) continue;

                // Re-point b's questions at a.
                const bQuestions = await safeRead(
                    () => fetchAll(base, cl.QUESTION_TABLE, {
                        filterByFormula: `{ClusterId} = '${b.id}'`,
                    }, 1000),
                    []
                );
                for (const q of bQuestions) {
                    try {
                        await base(cl.QUESTION_TABLE).update(q.id, { ClusterId: a.id });
                    } catch { /* best effort */ }
                }

                const combined = (Number(a.fields.QuestionCount) || 0) + (Number(b.fields.QuestionCount) || 0);
                const mergedSig = [...new Set([...aTokens, ...bTokens])].slice(0, 40).join(' ');

                await base(cl.CLUSTER_TABLE).update(a.id, {
                    QuestionCount: combined,
                    Signature: mergedSig,
                    Promoted: !!a.fields.Promoted || !!b.fields.Promoted,
                    PromotionCount: (Number(a.fields.PromotionCount) || 0) + (Number(b.fields.PromotionCount) || 0),
                    UpdatedAt: nowISO(),
                });
                a.fields.QuestionCount = combined;

                // Retain the absorbed cluster rather than deleting it, so any
                // link a fan already has still resolves somewhere sensible.
                await base(cl.CLUSTER_TABLE).update(b.id, {
                    Status: 'Merged',
                    MergedInto: a.id,
                    UpdatedAt: nowISO(),
                });

                absorbed.add(b.id);
                stats.merged++;
                await sleep(250);
            }
        }

        /* ── 2 & 3. Recount and refresh merged text ── */
        for (const c of clusters) {
            if (absorbed.has(c.id)) continue;

            const questions = await safeRead(
                () => fetchAll(base, cl.QUESTION_TABLE, {
                    filterByFormula: `AND({ClusterId} = '${c.id}', {Surfaced} = TRUE())`,
                    sort: [{ field: 'CreatedAt', direction: 'desc' }],
                }, 500),
                []
            );

            const patch = {};
            const trueCount = questions.length;
            if (trueCount && trueCount !== (Number(c.fields.QuestionCount) || 0)) {
                patch.QuestionCount = trueCount;
                stats.recounted++;
            }

            const alreadyRefreshed = !!c.fields.TextRefreshed;
            if (!alreadyRefreshed && trueCount >= REFRESH_AT_COUNT) {
                const merged = await cl.mergeQuestionText(questions.map((q) => q.fields.QuestionText || ''));
                if (merged.generated) {
                    patch.MergedQuestion = merged.text;
                    patch.TextRefreshed = true;
                    stats.refreshed++;
                }
            }

            if (Object.keys(patch).length) {
                patch.UpdatedAt = nowISO();
                try {
                    await base(cl.CLUSTER_TABLE).update(c.id, patch);
                } catch { /* best effort */ }
                await sleep(250);
            }
        }

        console.log('[recluster] done', stats);
        return { statusCode: 200, body: JSON.stringify({ ok: true, ...stats }) };
    } catch (err) {
        console.error('recluster-questions error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: 'Recluster failed', stats }) };
    }
};
