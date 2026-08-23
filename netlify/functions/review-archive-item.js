/* ═══════════════════════════════════════════════════════
   VERIFIED ARCHIVE — the keep/skip review queue
   ═══════════════════════════════════════════════════════

   GET  → the next candidate (one at a time, ~10 seconds of attention)
   POST → { itemId, decision: 'keep' | 'skip' }

   Framing rule from the brief: this is TASTE, not fact-checking. The UI says
   "Good one? Add it." — never "Verify authenticity." She is choosing what to
   endorse, not auditing a claim.

   The skip pile is RETAINED and is itself useful: it is a record of what she
   declined to endorse. Skipped items are never deleted and never purged.

   Hard constraint: the corpus only grows through explicit approval. There is
   no scraping anywhere in this codebase — candidates must be entered by a
   human into the Archive table with Status 'Candidate'.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireAdmin, esc, fetchAll, safeRead, isRecordId, nowISO } = require('./lib/common');

const TABLE = 'Archive';

exports.handler = async (event) => {
    const pre = preflight(event, ['GET', 'POST']);
    if (pre) return pre;

    const base = getBase();
    const gate = await requireAdmin(event, base);
    if (!gate.ok) return gate.response;

    try {
        /* ── Next candidate ── */
        if (event.httpMethod === 'GET') {
            const q = event.queryStringParameters || {};
            const batch = Math.min(parseInt(q.limit, 10) || 5, 20);

            const candidates = await safeRead(
                () => fetchAll(base, TABLE, {
                    filterByFormula: `{Status} = 'Candidate'`,
                    sort: [{ field: 'CreatedAt', direction: 'asc' }],
                }, batch),
                []
            );

            const [approvedCount, skippedCount, pendingCount] = await Promise.all([
                safeRead(() => fetchAll(base, TABLE, { filterByFormula: `{Status} = 'Approved'`, fields: ['Status'] }), []),
                safeRead(() => fetchAll(base, TABLE, { filterByFormula: `{Status} = 'Skipped'`, fields: ['Status'] }), []),
                safeRead(() => fetchAll(base, TABLE, { filterByFormula: `{Status} = 'Candidate'`, fields: ['Status'] }), []),
            ]);

            return json(200, {
                queue: candidates.map((r) => ({
                    id: r.id,
                    title: r.fields.Title || '',
                    kind: r.fields.Kind || 'Interview',
                    source: r.fields.Source || '',
                    sourceUrl: r.fields.SourceUrl || null,
                    audioUrl: r.fields.AudioUrl || null,
                    publishedAt: r.fields.PublishedAt || null,
                    durationSeconds: Number(r.fields.DurationSeconds) || 0,
                    language: r.fields.Language || 'en',
                    excerpt: String(r.fields.Excerpt || '').slice(0, 400),
                })),
                counts: {
                    pending: pendingCount.length,
                    approved: approvedCount.length,
                    skipped: skippedCount.length,
                },
            });
        }

        /* ── Record a decision ── */
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch {
            return json(400, { error: 'Invalid request' });
        }

        const { itemId, decision } = body;
        if (!isRecordId(itemId)) return json(400, { error: 'Invalid item id' });
        if (!['keep', 'skip'].includes(decision)) return json(400, { error: 'Invalid decision' });

        let rec;
        try {
            rec = await base(TABLE).find(itemId);
        } catch {
            return json(404, { error: 'Item not found' });
        }

        const now = nowISO();

        if (decision === 'keep') {
            await base(TABLE).update(itemId, {
                Status: 'Approved',
                Verified: true,
                ApprovedAt: now,
                ApprovedBy: gate.user.fields.Name || gate.user.fields.Username || 'Yeng',
                // Queue it for transcription; the scheduled job picks this up.
                TranscriptStatus: rec.fields.Transcript ? 'Provided' : 'Queued',
            });

            return json(200, {
                decision: 'keep',
                itemId,
                message: 'Added to your archive.',
                queuedForTranscription: !rec.fields.Transcript,
            });
        }

        // Skip. Retained deliberately — the skip pile is a record of what she
        // declined to endorse, and the handler dashboard surfaces it.
        await base(TABLE).update(itemId, {
            Status: 'Skipped',
            Verified: false,
            SkippedAt: now,
            SkippedBy: gate.user.fields.Name || gate.user.fields.Username || 'Yeng',
        });

        return json(200, {
            decision: 'skip',
            itemId,
            message: 'Skipped. Kept on file, not published.',
            retained: true,
        });
    } catch (err) {
        console.error('review-archive-item error:', err);
        return json(500, { error: 'Could not save that decision right now.' });
    }
};
