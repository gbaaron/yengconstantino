/* ═══════════════════════════════════════════════════════
   FINISH THE LYRIC — unlimited plays, audio-first, speed-scored
   ═══════════════════════════════════════════════════════

   "Play a few seconds, timer runs, type the next line. Speed-based scoring
    defeats screenshot-into-an-AI cheating."

   So the server owns the clock: `start` stamps a server-side timestamp and
   `answer` scores against elapsed server time, not a number the client sends.
   A round that takes longer than the window scores zero even if correct.

   "Because it's unlimited, points per play must be small or the economy
    inflates and premium looks pointless." — lyric_round is 2 points, capped
    at 10/day in lib/points.js.

   LYRIC SOURCE: rows in the `Lyrics` table, which the team enters by hand
   from material they have the right to use. Nothing is scraped and no lyric
   text is generated. If the table is empty the game reports that honestly
   rather than inventing lines.
   ═══════════════════════════════════════════════════════ */

const crypto = require('crypto');
const { preflight, json, getBase, requireUser, esc, fetchAll, safeRead, nowISO, todayISO } = require('./lib/common');
const points = require('./lib/points');

const LYRICS_TABLE = 'Lyrics';
const SESSION_TABLE = 'GameSessions';
const ROUND_SECONDS = 15;

/** Normalise for comparison — punctuation and case must not matter. */
function normalise(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Token-level similarity so a near-miss still counts. */
function closeness(a, b) {
    const ta = normalise(a).split(' ').filter(Boolean);
    const tb = normalise(b).split(' ').filter(Boolean);
    if (!ta.length || !tb.length) return 0;
    const setB = new Set(tb);
    const hits = ta.filter((t) => setB.has(t)).length;
    return hits / Math.max(ta.length, tb.length);
}

function roundToken(userId, lineId, startedAt) {
    return crypto.createHmac('sha256', process.env.JWT_SECRET || 'x')
        .update(`${userId}|${lineId}|${startedAt}`).digest('hex').slice(0, 20);
}

exports.handler = async (event) => {
    const pre = preflight(event, ['POST', 'GET']);
    if (pre) return pre;

    const auth = await requireUser(event);
    if (!auth.ok) return auth.response;
    const { decoded } = auth;

    const base = getBase();
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { /* GET */ }
    const action = body.action || (event.queryStringParameters || {}).action || 'start';

    try {
        const user = await base('Users').find(decoded.userId);
        const userName = user.fields.Name || user.fields.Username || 'Fan';

        /* ── START ── */
        if (action === 'start') {
            const lines = await safeRead(
                () => fetchAll(base, LYRICS_TABLE, {
                    filterByFormula: `{Status} = 'Active'`,
                }, 400),
                []
            );

            if (!lines.length) {
                return json(503, {
                    error: 'No lyric rounds are available yet.',
                    reason: 'lyrics_empty',
                    note: 'Lyric lines are entered by the team from cleared material — nothing is scraped or generated.',
                });
            }

            const pick = lines[Math.floor(Math.random() * lines.length)];
            const f = pick.fields;
            const startedAt = Date.now();

            return json(200, {
                round: {
                    lineId: pick.id,
                    songTitle: f.SongTitle || '',
                    promptLine: f.PromptLine || '',
                    // Audio-first: a short clip is the prompt where one exists.
                    audioUrl: f.AudioUrl || null,
                    audioStart: Number(f.AudioStart) || 0,
                    audioSeconds: Number(f.AudioSeconds) || 6,
                    seconds: ROUND_SECONDS,
                    startedAt,
                    token: roundToken(decoded.userId, pick.id, startedAt),
                },
                library: lines.length,
            });
        }

        /* ── ANSWER ── */
        if (action === 'answer') {
            const { lineId, startedAt, token, answer } = body;
            if (!lineId || !startedAt || !token) return json(400, { error: 'Invalid round' });

            // The clock is the server's. A replayed or forged token scores nothing.
            if (roundToken(decoded.userId, lineId, startedAt) !== token) {
                return json(400, { error: 'Invalid round' });
            }

            const elapsedMs = Date.now() - Number(startedAt);
            const elapsed = elapsedMs / 1000;

            let line;
            try {
                line = await base(LYRICS_TABLE).find(lineId);
            } catch {
                return json(404, { error: 'That round expired.' });
            }

            const expected = line.fields.AnswerLine || '';
            const score = closeness(answer, expected);
            const correct = score >= 0.7;
            const expired = elapsed > ROUND_SECONDS;

            /* Speed scoring. Answering instantly is worth roughly triple a
               last-second answer, which is what makes a detour through an AI
               tool cost more than it wins. */
            let earned = 0;
            if (correct && !expired) {
                const speedBonus = Math.max(0, 1 - elapsed / ROUND_SECONDS); // 1 → 0
                earned = Math.max(1, Math.round(2 * (1 + speedBonus * 2)));  // 2..6
            }

            let pointsResult = null;
            if (earned > 0) {
                pointsResult = await points.earn(base, {
                    userId: decoded.userId, userName,
                    type: 'lyric_round',
                    amountOverride: earned,
                    reason: `Finish the Lyric — ${line.fields.SongTitle || 'round'}`,
                    refTable: LYRICS_TABLE, refId: lineId,
                });
            }

            try {
                await base(SESSION_TABLE).create({
                    UserId: decoded.userId,
                    UserName: userName,
                    Game: 'lyric',
                    State: correct && !expired ? 'won' : 'lost',
                    PointsWon: pointsResult && pointsResult.amount ? pointsResult.amount : 0,
                    ElapsedSeconds: Math.round(elapsed * 10) / 10,
                    Day: todayISO(),
                    StartedAt: new Date(Number(startedAt)).toISOString(),
                    EndedAt: nowISO(),
                });
            } catch { /* logging only */ }

            return json(200, {
                correct: correct && !expired,
                expired,
                closeness: Math.round(score * 100),
                expectedLine: expected,
                elapsed: Math.round(elapsed * 10) / 10,
                pointsEarned: pointsResult && pointsResult.amount ? pointsResult.amount : 0,
                capped: !!(pointsResult && pointsResult.capped),
                balance: pointsResult ? pointsResult.balance : undefined,
                message: expired
                    ? "Time's up on that one."
                    : correct
                        ? (elapsed < 4 ? 'Instant. Nice.' : 'Got it.')
                        : 'Not quite.',
            });
        }

        return json(400, { error: 'Unknown action' });
    } catch (err) {
        console.error('play-lyric error:', err);
        return json(500, { error: 'Could not run that round right now.' });
    }
};
