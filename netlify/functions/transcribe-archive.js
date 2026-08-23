/* ═══════════════════════════════════════════════════════
   VERIFIED ARCHIVE — Whisper transcription
   ═══════════════════════════════════════════════════════

   Transcribes approved items and stores TIMESTAMPED cues so search can deep
   link to the second. Uses verbose_json + segment granularity, which is what
   gives us the per-segment `start` times.

   Two invocation modes:
     - POST from the studio UI (admin) for one item, ?itemId=recXXX
     - Scheduled sweep of the Queued backlog

   Deliberately not synchronous with approval: Netlify functions time out
   well before a long interview finishes, so approval only marks the item
   'Queued' and this drains the queue one item per run.

   NOTE: this transcribes. It never translates her audio and never generates
   speech. Subtitles in other languages are authored translations of the
   transcript (see get-translations.js), not dubs.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireAdmin, fetchAll, safeRead, isRecordId, nowISO, clampLongText } = require('./lib/common');

const TABLE = 'Archive';
const MAX_PER_RUN = 2;

function isScheduledInvocation(event) {
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

/** Whisper on one audio URL → { cues, text, language }. */
async function transcribeUrl(audioUrl) {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const res = await fetch(audioUrl);
    if (!res.ok) throw new Error(`Could not fetch audio (${res.status})`);

    const contentLength = Number(res.headers.get('content-length') || 0);
    // Whisper's hard limit is 25 MB.
    if (contentLength > 25 * 1024 * 1024) {
        throw new Error('Recording is larger than the 25MB transcription limit');
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const name = (audioUrl.split('/').pop() || 'audio.mp3').split('?')[0];
    const file = new File([buffer], name, { type: res.headers.get('content-type') || 'audio/mpeg' });

    const result = await openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
    });

    const cues = (result.segments || []).map((s) => ({
        t: Math.round((s.start || 0) * 10) / 10,
        text: String(s.text || '').trim(),
    })).filter((c) => c.text);

    return {
        cues: cues.length ? cues : [{ t: 0, text: String(result.text || '').trim() }],
        text: String(result.text || '').trim(),
        language: result.language || null,
        duration: Number(result.duration) || 0,
    };
}

async function processItem(base, rec) {
    const audioUrl = rec.fields.AudioUrl;
    if (!audioUrl) {
        await base(TABLE).update(rec.id, {
            TranscriptStatus: 'Failed',
            TranscriptError: 'No audio URL on this item',
        });
        return { id: rec.id, ok: false, error: 'no audio url' };
    }

    try {
        await base(TABLE).update(rec.id, { TranscriptStatus: 'Running' });
        const out = await transcribeUrl(audioUrl);

        await base(TABLE).update(rec.id, {
            Transcript: clampLongText(JSON.stringify(out.cues)),
            TranscriptPlain: clampLongText(out.text),
            TranscriptStatus: 'Done',
            TranscriptError: '',
            TranscribedAt: nowISO(),
            ...(out.duration ? { DurationSeconds: Math.round(out.duration) } : {}),
            ...(out.language && !rec.fields.Language ? { Language: out.language } : {}),
        });

        return { id: rec.id, ok: true, cues: out.cues.length };
    } catch (err) {
        console.error('[transcribe] failed for', rec.id, err.message);
        await base(TABLE).update(rec.id, {
            TranscriptStatus: 'Failed',
            TranscriptError: String(err.message || 'Transcription failed').slice(0, 500),
        });
        return { id: rec.id, ok: false, error: err.message };
    }
}

exports.handler = async (event) => {
    const scheduled = isScheduledInvocation(event);

    if (!scheduled) {
        const pre = preflight(event, ['POST']);
        if (pre) return pre;
    }

    if (!process.env.OPENAI_API_KEY) {
        return json(503, { error: 'Transcription is not configured (OPENAI_API_KEY missing).' });
    }

    const base = getBase();

    if (!scheduled) {
        const gate = await requireAdmin(event, base);
        if (!gate.ok) return gate.response;
    }

    try {
        let body = {};
        try { body = JSON.parse(event.body || '{}'); } catch { /* fine */ }

        /* ── One specific item ── */
        if (body.itemId) {
            if (!isRecordId(body.itemId)) return json(400, { error: 'Invalid item id' });
            let rec;
            try {
                rec = await base(TABLE).find(body.itemId);
            } catch {
                return json(404, { error: 'Item not found' });
            }
            const result = await processItem(base, rec);
            return json(result.ok ? 200 : 500, result);
        }

        /* ── Drain the queue ── */
        const queued = await safeRead(
            () => fetchAll(base, TABLE, {
                filterByFormula: `AND({Status} = 'Approved', OR({TranscriptStatus} = 'Queued', {TranscriptStatus} = 'Pending'))`,
                sort: [{ field: 'ApprovedAt', direction: 'asc' }],
            }, MAX_PER_RUN),
            []
        );

        const results = [];
        for (const rec of queued) results.push(await processItem(base, rec));

        const payload = { processed: results.length, results, remaining: Math.max(0, queued.length - results.length) };
        return scheduled
            ? { statusCode: 200, body: JSON.stringify(payload) }
            : json(200, payload);
    } catch (err) {
        console.error('transcribe-archive error:', err);
        return scheduled
            ? { statusCode: 500, body: JSON.stringify({ error: 'Transcription run failed' }) }
            : json(500, { error: 'Transcription failed right now.' });
    }
};
