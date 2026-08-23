/* ═══════════════════════════════════════════════════════
   VERIFIED ARCHIVE — retrieval search
   ═══════════════════════════════════════════════════════

   HARD RULE, from the brief: retrieval only. Search returns HER ACTUAL WORDS
   with a deep link to the source, cued to the second. We never paraphrase her
   and never synthesise an answer in her voice. There is deliberately no LLM
   in this file — the only thing it can return is a verbatim span of an
   approved transcript plus a timestamp.

   That constraint is the product. A summariser here would quietly reintroduce
   exactly the "words she never said" problem the archive exists to solve.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, esc, fetchAll, safeRead, isRecordId } = require('./lib/common');

const TABLE = 'Archive';

/* Transcripts are stored as a JSON array of cues:
   [{ t: 12.4, text: "..." }, ...]  — t is seconds into the recording. */
function parseCues(transcript) {
    if (!transcript) return [];
    if (typeof transcript === 'object') return Array.isArray(transcript) ? transcript : [];
    const s = String(transcript).trim();
    if (s.startsWith('[')) {
        try {
            const parsed = JSON.parse(s);
            if (Array.isArray(parsed)) return parsed;
        } catch { /* fall through to plain text */ }
    }
    // Plain text with no timing: one cue at t=0 so search still works.
    return [{ t: 0, text: s }];
}

/** Rank cues by term coverage; return the best verbatim spans. */
function findSpans(cues, terms, maxSpans = 3) {
    if (!terms.length) return [];
    const scored = cues.map((cue, i) => {
        const lower = String(cue.text || '').toLowerCase();
        let hits = 0;
        for (const t of terms) if (lower.includes(t)) hits++;
        return { i, cue, hits };
    }).filter((s) => s.hits > 0);

    scored.sort((a, b) => b.hits - a.hits || a.i - b.i);

    return scored.slice(0, maxSpans).map((s) => {
        // Include the neighbouring cue for readability — still verbatim.
        const prev = cues[s.i - 1];
        const next = cues[s.i + 1];
        const text = [prev && prev.text, s.cue.text, next && next.text].filter(Boolean).join(' ');
        return {
            t: Number(s.cue.t) || 0,
            text: String(text).slice(0, 600),
            matchedTerms: s.hits,
        };
    });
}

function shape(rec) {
    const f = rec.fields;
    return {
        id: rec.id,
        title: f.Title || '',
        kind: f.Kind || 'Item',
        source: f.Source || '',
        audioUrl: f.AudioUrl || null,
        sourceUrl: f.SourceUrl || null,
        durationSeconds: Number(f.DurationSeconds) || 0,
        language: f.Language || 'en',
        verified: !!f.Verified,
        signature: f.Signature || null,
        recordedAt: f.RecordedAt || null,
        approvedAt: f.ApprovedAt || null,
        clusterId: f.ClusterId || null,
        clusterSize: Number(f.ClusterSize) || 0,
        transcriptStatus: f.TranscriptStatus || 'Pending',
    };
}

/** Build a deep link cued to the second. */
function deepLink(item, seconds) {
    const t = Math.max(0, Math.floor(seconds || 0));
    if (item.audioUrl) return `/archive.html?item=${item.id}&t=${t}`;
    if (item.sourceUrl) {
        const sep = item.sourceUrl.includes('?') ? '&' : '?';
        return `${item.sourceUrl}${sep}t=${t}`;
    }
    return `/archive.html?item=${item.id}&t=${t}`;
}

exports.handler = async (event) => {
    const pre = preflight(event, ['GET']);
    if (pre) return pre;

    const q = event.queryStringParameters || {};
    const base = getBase();

    try {
        /* ── Single item (the player page) ── */
        if (q.item) {
            if (!isRecordId(q.item)) return json(400, { error: 'Invalid item id' });
            let rec;
            try {
                rec = await base(TABLE).find(q.item);
            } catch {
                return json(404, { error: 'Not found in the archive' });
            }
            if ((rec.fields.Status || '') !== 'Approved') {
                return json(404, { error: 'Not found in the archive' });
            }
            const item = shape(rec);
            item.cues = parseCues(rec.fields.Transcript);
            return json(200, { item });
        }

        const search = String(q.q || '').trim();
        const kind = q.kind || '';
        const language = q.language || '';
        const limit = Math.min(parseInt(q.limit, 10) || 20, 60);

        /* ── Browse (no query) ── */
        const filters = [`{Status} = 'Approved'`];
        if (kind) filters.push(`{Kind} = '${esc(kind)}'`);
        if (language) filters.push(`{Language} = '${esc(language)}'`);

        const rows = await safeRead(
            () => fetchAll(base, TABLE, {
                filterByFormula: filters.length > 1 ? `AND(${filters.join(', ')})` : filters[0],
                sort: [{ field: 'RecordedAt', direction: 'desc' }],
            }, search ? 800 : limit),
            []
        );

        if (!search) {
            return json(200, {
                results: rows.slice(0, limit).map((r) => ({ ...shape(r), spans: [] })),
                total: rows.length,
                query: '',
                retrievalOnly: true,
            });
        }

        /* ── Search: verbatim spans only ── */
        const terms = search.toLowerCase()
            .replace(/[^a-z0-9\s']/g, ' ')
            .split(/\s+/)
            .filter((t) => t.length > 1);

        const results = [];
        for (const r of rows) {
            const item = shape(r);
            const cues = parseCues(r.fields.Transcript);
            const titleHit = terms.some((t) => (item.title || '').toLowerCase().includes(t));
            const spans = findSpans(cues, terms);

            if (!spans.length && !titleHit) continue;

            results.push({
                ...item,
                spans: spans.map((s) => ({
                    t: s.t,
                    // Verbatim. Never rewritten, never summarised.
                    text: s.text,
                    deepLink: deepLink(item, s.t),
                })),
                score: spans.reduce((sum, s) => sum + s.matchedTerms, 0) + (titleHit ? 2 : 0),
            });
        }

        results.sort((a, b) => b.score - a.score);

        return json(200, {
            results: results.slice(0, limit),
            total: results.length,
            query: search,
            retrievalOnly: true,
            note: 'These are Yeng\'s actual words, from approved recordings. Nothing here is paraphrased or generated.',
        });
    } catch (err) {
        console.error('get-archive error:', err);
        return json(500, { error: 'Could not search the archive right now.' });
    }
};
