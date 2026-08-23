/* ═══════════════════════════════════════════════════════
   ASK YENG — submit a question
   ═══════════════════════════════════════════════════════

   Flow, in order:
     1. Screen it (tiered moderation, mostly silent).
     2. Cluster it against open clusters.
     3. Return the transparency payload: cluster size, the merged question
        that goes to Yeng, and the fan's own version.

   The transparency payload is mandatory. We never imply she answered an
   individual — the fan is shown the maths instead.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireUser, nowISO, todayISO, clampLongText } = require('./lib/common');
const mod = require('./lib/moderation');
const cl = require('./lib/clustering');
const points = require('./lib/points');

const MAX_LEN = 500;
const MIN_LEN = 8;

exports.handler = async (event) => {
    const pre = preflight(event, ['POST']);
    if (pre) return pre;

    const auth = await requireUser(event);
    if (!auth.ok) return auth.response;
    const { decoded } = auth;

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return json(400, { error: 'Invalid request' });
    }

    const text = String(body.question || '').trim();
    const language = ['en', 'tl', 'ceb', 'ilo'].includes(body.language) ? body.language : 'en';

    if (text.length < MIN_LEN) {
        return json(400, { error: 'Add a bit more detail to your question.' });
    }
    if (text.length > MAX_LEN) {
        return json(400, { error: `Keep it under ${MAX_LEN} characters.` });
    }

    const base = getBase();

    try {
        const user = await base('Users').find(decoded.userId);
        const userName = user.fields.Name || user.fields.Username || 'Fan';

        /* ── 1. Screen ── */
        const decision = await mod.screen(base, {
            userId: decoded.userId,
            userName,
            text,
            submissionTable: cl.QUESTION_TABLE,
        });

        // Tier 2+ with a message: the only case where we say anything, and it
        // is in the system's voice, never hers.
        if (!decision.accept && decision.notify) {
            return json(200, {
                accepted: false,
                message: decision.message,
                systemVoice: true,
            });
        }

        // Tier 1: silently dropped. The fan sees an ordinary success state.
        // Telling them a filter exists teaches them to beat it.
        if (!decision.accept && !decision.notify) {
            return json(200, {
                accepted: true,
                silent: true,
                cluster: {
                    id: null,
                    mergedQuestion: text,
                    yourQuestion: text,
                    count: 1,
                    isNew: true,
                },
            });
        }

        /* ── 2. Cluster ── */
        // Shadowbanned submissions are stored but never joined to a cluster,
        // so they cannot inflate a real cluster's count.
        let clusterId = null;
        let mergedQuestion = text;
        let clusterCount = 1;
        let isNew = true;
        let topic = '';

        if (decision.surface) {
            const openClusters = await cl.loadOpenClusters(base);
            const { match, tokens } = cl.findCluster(text, openClusters);

            if (match) {
                clusterCount = await cl.growCluster(base, match, tokens);
                clusterId = match.id;
                mergedQuestion = match.fields.MergedQuestion || text;
                topic = match.fields.Topic || '';
                isNew = false;
            } else {
                const created = await cl.createCluster(base, { questionText: text, tokens, language });
                clusterId = created.id;
                mergedQuestion = created.fields.MergedQuestion || text;
                topic = created.fields.Topic || '';
                clusterCount = 1;
                isNew = true;
            }
        }

        /* ── 3. Store the fan's own version ── */
        await base(cl.QUESTION_TABLE).create({
            UserId: decoded.userId,
            UserName: userName,
            QuestionText: clampLongText(text, MAX_LEN),
            ClusterId: clusterId || '',
            Language: language,
            Status: decision.surface ? 'Clustered' : 'Held',
            Surfaced: !!decision.surface,
            Day: todayISO(),
            CreatedAt: nowISO(),
        });

        /* ── Points ── */
        if (decision.surface) {
            await points.earn(base, {
                userId: decoded.userId, userName,
                type: 'question_asked',
                reason: 'Asked Yeng a question',
                refTable: cl.QUESTION_TABLE, refId: clusterId,
            });
            if (!isNew) {
                await points.earn(base, {
                    userId: decoded.userId, userName,
                    type: 'question_clustered',
                    reason: 'Your question joined a cluster',
                    refTable: cl.CLUSTER_TABLE, refId: clusterId,
                });
            }
        }

        return json(200, {
            accepted: true,
            cluster: {
                id: clusterId,
                mergedQuestion,
                yourQuestion: text,
                count: clusterCount,
                isNew,
                topic,
            },
            balance: await points.getBalance(base, decoded.userId),
        });
    } catch (err) {
        console.error('submit-question error:', err);
        return json(500, { error: 'Could not submit your question right now.' });
    }
};
