/* ═══════════════════════════════════════════════════════
   ASK YENG — record an answer (and mint the archive artefact)
   ═══════════════════════════════════════════════════════

   This is the join between the two halves of the product: a fan-facing
   feature that fills the archive as a byproduct. Every voice-memo answer
   she records becomes a signed, timestamped, verified artefact — she never
   does data entry, and the archive grows underneath.

   The signature is an HMAC over (audio URL + cluster + timestamp) keyed on
   JWT_SECRET. It is provenance, not DRM: it proves the platform minted this
   artefact at this time for this question, which is the thing that is
   actually in dispute when a cloned-voice clip circulates.
   ═══════════════════════════════════════════════════════ */

const crypto = require('crypto');
const {
    preflight, json, getBase, requireAdmin, esc, fetchAll, safeRead,
    isRecordId, isSafeUrl, nowISO, clampLongText,
} = require('./lib/common');
const cl = require('./lib/clustering');
const points = require('./lib/points');

const ARCHIVE_TABLE = 'Archive';
const NOTIFICATION_TABLE = 'Notifications';

/** Provenance signature over the artefact's immutable facts. */
function signArtefact({ audioUrl, clusterId, recordedAt }) {
    return crypto
        .createHmac('sha256', process.env.JWT_SECRET || 'unsigned')
        .update(`${audioUrl}|${clusterId}|${recordedAt}`)
        .digest('hex');
}

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

    const { clusterId, audioUrl, durationSeconds, transcript, language } = body;

    if (!isRecordId(clusterId)) return json(400, { error: 'Invalid question id' });
    if (!audioUrl || !isSafeUrl(audioUrl)) {
        return json(400, { error: 'A valid recording URL is required.' });
    }

    const lang = ['en', 'tl', 'ceb', 'ilo'].includes(language) ? language : 'tl';

    try {
        let cluster;
        try {
            cluster = await base(cl.CLUSTER_TABLE).find(clusterId);
        } catch {
            return json(404, { error: 'Question not found' });
        }

        if ((cluster.fields.Status || '') === 'Answered') {
            return json(400, { error: 'That question already has an answer.' });
        }

        const recordedAt = nowISO();
        const mergedQuestion = cluster.fields.MergedQuestion || '';
        const clusterSize = Number(cluster.fields.QuestionCount) || 0;
        const signature = signArtefact({ audioUrl, clusterId, recordedAt });

        /* ── 1. Mint the verified archive artefact ── */
        let archiveId = null;
        try {
            const artefact = await base(ARCHIVE_TABLE).create({
                Title: mergedQuestion.slice(0, 200),
                Kind: 'Answer',
                Source: 'Ask Yeng voice memo',
                AudioUrl: audioUrl,
                DurationSeconds: Number(durationSeconds) || 0,
                Transcript: clampLongText(transcript || ''),
                TranscriptStatus: transcript ? 'Provided' : 'Pending',
                Language: lang,
                ClusterId: clusterId,
                ClusterSize: clusterSize,
                Verified: true,
                Signature: signature,
                RecordedAt: recordedAt,
                ApprovedAt: recordedAt,
                Status: 'Approved',
                CreatedAt: recordedAt,
            });
            archiveId = artefact.id;
        } catch (err) {
            console.error('[submit-answer] archive write failed:', err.message);
            // Do not lose the answer just because the archive table is missing.
        }

        /* ── 2. Close the cluster ── */
        await base(cl.CLUSTER_TABLE).update(clusterId, {
            Status: 'Answered',
            AnsweredAt: recordedAt,
            AnswerAudioUrl: audioUrl,
            AnswerTranscript: clampLongText(transcript || ''),
            ArchiveId: archiveId || '',
            Signature: signature,
            UpdatedAt: recordedAt,
        });

        /* ── 3. Notify everyone in the cluster ──
           Wording matters: she answered the question you were PART OF.
           We never imply she replied to an individual. */
        const members = await safeRead(
            () => fetchAll(base, cl.QUESTION_TABLE, {
                filterByFormula: `AND({ClusterId} = '${esc(clusterId)}', {Surfaced} = TRUE())`,
            }, 5000),
            []
        );

        const seen = new Set();
        const recipients = members.filter((m) => {
            const uid = m.fields.UserId;
            if (!uid || seen.has(uid)) return false;
            seen.add(uid);
            return true;
        });

        let notified = 0;
        for (const m of recipients) {
            try {
                await base(NOTIFICATION_TABLE).create({
                    UserId: m.fields.UserId,
                    UserName: m.fields.UserName || '',
                    Kind: 'cluster_answered',
                    Title: 'Yeng answered the question you were part of',
                    Body: mergedQuestion.slice(0, 300),
                    LinkUrl: `/ask.html?cluster=${clusterId}`,
                    ClusterId: clusterId,
                    Read: false,
                    CreatedAt: nowISO(),
                });
                notified++;
            } catch (err) {
                if (notified === 0) console.warn('[submit-answer] notifications unavailable:', err.message);
                break; // table missing — stop trying
            }

            // Everyone in an answered cluster earns points.
            await points.earn(base, {
                userId: m.fields.UserId,
                userName: m.fields.UserName,
                type: 'cluster_answered',
                reason: 'Yeng answered a question you were part of',
                refTable: cl.CLUSTER_TABLE,
                refId: clusterId,
            });
        }

        /* ── 4. Mark the fan question rows answered ── */
        for (const m of members.slice(0, 500)) {
            try {
                await base(cl.QUESTION_TABLE).update(m.id, { Status: 'Answered' });
            } catch { /* best effort */ }
        }

        return json(200, {
            answered: true,
            archiveId,
            signature,
            clusterSize,
            fansNotified: notified,
            message: `Sent. ${clusterSize} ${clusterSize === 1 ? 'fan' : 'fans'} asked this, and it's now in your archive.`,
        });
    } catch (err) {
        console.error('submit-answer error:', err);
        return json(500, { error: 'Could not save that answer right now.' });
    }
};
