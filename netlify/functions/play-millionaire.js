/* ═══════════════════════════════════════════════════════
   YENG MILLIONAIRE — once per day, bank or risk
   ═══════════════════════════════════════════════════════

   Format borrowed from the AEOB "PBA Trivia Millionaire" build: escalating
   ladder, safe levels, per-question timer, walk-away at any point.

   The bank-or-risk decision at each tier IS the game — it's the reason to
   open the app, not the trivia. So the server owns the ladder, the safe
   floors and the session state, and the correct answer is NEVER sent to the
   client until the question is resolved.

   Questions come only from archive-approved material (see lib/games.js).
   Getting a fact wrong about her, in her own app, in a demo, is a disaster.

   Actions: start | answer | lifeline | bank
   ═══════════════════════════════════════════════════════ */

const crypto = require('crypto');
const { preflight, json, getBase, requireUser, esc, fetchAll, safeRead, nowISO, todayISO, safeJSON, clampLongText } = require('./lib/common');
const games = require('./lib/games');
const points = require('./lib/points');
const cards = require('./lib/cards');

const SESSION_TABLE = 'GameSessions';
const QUESTION_SECONDS = 20;
const LIFELINES = ['fifty', 'skip'];

/** Never send the answer index to the client. Send a hash it can't reverse. */
function questionToken(sessionId, level, answer) {
    return crypto.createHmac('sha256', process.env.JWT_SECRET || 'x')
        .update(`${sessionId}|${level}|${answer}`).digest('hex').slice(0, 16);
}

/** Build the full question set for a run, from approved facts only. */
async function buildQuestions(base) {
    const facts = await games.loadApprovedFacts(base);
    const yearFacts = facts.filter((f) => f.kind === 'year');
    const eraFacts = facts.filter((f) => f.kind === 'era');

    const allYears = [...new Set(yearFacts.map((f) => f.answer))];
    const allEras = [...new Set(eraFacts.map((f) => f.answer))];

    const questions = [];

    for (const f of yearFacts) {
        if (allYears.length < 4) break;
        questions.push({
            prompt: `What year did "${f.subject}" come out?`,
            choices: games.buildChoices(f.answer, allYears),
            answer: f.answer,
            sourceKind: f.sourceKind,
            sourceId: f.sourceId,
        });
    }

    for (const f of eraFacts) {
        if (allEras.length < 3) break;
        questions.push({
            prompt: `Which era does "${f.subject}" belong to?`,
            choices: games.buildChoices(f.answer, allEras),
            answer: f.answer,
            sourceKind: f.sourceKind,
            sourceId: f.sourceId,
        });
    }

    // Shuffle, then order easy→hard by how common the subject is.
    for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    return questions.slice(0, games.LADDER.length);
}

function publicQuestion(q, level, sessionId) {
    const rung = games.LADDER.find((r) => r.level === level);
    return {
        level,
        prompt: q.prompt,
        choices: q.choices,
        pointsAtStake: rung ? rung.points : 0,
        safeFloor: games.safeFloor(level),
        isSafeLevel: !!(rung && rung.safe),
        seconds: QUESTION_SECONDS,
        token: questionToken(sessionId, level, q.answer),
        // Provenance shown in the UI — every question is traceable.
        source: q.sourceKind,
    };
}

async function loadSession(base, sessionId, userId) {
    try {
        const rec = await base(SESSION_TABLE).find(sessionId);
        if (rec.fields.UserId !== userId) return null;
        return rec;
    } catch {
        return null;
    }
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
    const action = body.action || (event.queryStringParameters || {}).action || 'status';

    try {
        const user = await base('Users').find(decoded.userId);
        const userName = user.fields.Name || user.fields.Username || 'Fan';

        /* ── Already played today? ── */
        const todaysRuns = await safeRead(
            () => fetchAll(base, SESSION_TABLE, {
                filterByFormula: `AND({UserId} = '${esc(decoded.userId)}', {Game} = 'millionaire', {Day} = '${todayISO()}')`,
            }, 5),
            []
        );
        const finishedToday = todaysRuns.find((r) => ['banked', 'lost', 'won'].includes(r.fields.State));
        const activeRun = todaysRuns.find((r) => r.fields.State === 'active');

        /* ── STATUS ── */
        if (action === 'status') {
            return json(200, {
                playedToday: !!finishedToday,
                hasActiveRun: !!activeRun,
                sessionId: activeRun ? activeRun.id : null,
                ladder: games.LADDER,
                result: finishedToday
                    ? {
                          state: finishedToday.fields.State,
                          pointsWon: Number(finishedToday.fields.PointsWon) || 0,
                          level: Number(finishedToday.fields.Level) || 0,
                      }
                    : null,
            });
        }

        /* ── START ── */
        if (action === 'start') {
            if (finishedToday) {
                return json(400, {
                    error: 'You have already played today. Come back tomorrow.',
                    playedToday: true,
                    result: {
                        state: finishedToday.fields.State,
                        pointsWon: Number(finishedToday.fields.PointsWon) || 0,
                    },
                });
            }
            if (activeRun) {
                const qs = safeJSON(activeRun.fields.Questions, []);
                const level = Number(activeRun.fields.Level) || 1;
                return json(200, {
                    resumed: true,
                    sessionId: activeRun.id,
                    question: publicQuestion(qs[level - 1], level, activeRun.id),
                    lifelinesUsed: safeJSON(activeRun.fields.LifelinesUsed, []),
                    ladder: games.LADDER,
                });
            }

            const questions = await buildQuestions(base);
            if (questions.length < 5) {
                return json(503, {
                    error: 'Not enough verified material in the archive yet to build a round.',
                    needed: 5,
                    have: questions.length,
                });
            }

            // Card perk: an extra lifeline for card holders.
            const perks = await cards.getActivePerks(base, decoded.userId);
            const lifelines = perks.includes('lifeline') ? [...LIFELINES, 'fifty'] : [...LIFELINES];

            const session = await base(SESSION_TABLE).create({
                UserId: decoded.userId,
                UserName: userName,
                Game: 'millionaire',
                State: 'active',
                Level: 1,
                PointsWon: 0,
                Questions: clampLongText(JSON.stringify(questions)),
                LifelinesAvailable: JSON.stringify(lifelines),
                LifelinesUsed: '[]',
                Day: todayISO(),
                StartedAt: nowISO(),
            });

            return json(200, {
                sessionId: session.id,
                question: publicQuestion(questions[0], 1, session.id),
                lifelines,
                ladder: games.LADDER,
                totalQuestions: questions.length,
            });
        }

        /* ── Everything below needs a live session ── */
        const session = await loadSession(base, body.sessionId, decoded.userId);
        if (!session || session.fields.State !== 'active') {
            return json(400, { error: 'No active game.' });
        }

        const questions = safeJSON(session.fields.Questions, []);
        const level = Number(session.fields.Level) || 1;
        const current = questions[level - 1];
        if (!current) return json(400, { error: 'No active question.' });

        /* ── LIFELINE ── */
        if (action === 'lifeline') {
            const available = safeJSON(session.fields.LifelinesAvailable, []);
            const used = safeJSON(session.fields.LifelinesUsed, []);
            const kind = body.lifeline;

            const remaining = [...available];
            for (const u of used) {
                const i = remaining.indexOf(u);
                if (i >= 0) remaining.splice(i, 1);
            }
            if (!remaining.includes(kind)) return json(400, { error: 'That lifeline is used up.' });

            await base(SESSION_TABLE).update(session.id, {
                LifelinesUsed: JSON.stringify([...used, kind]),
            });

            if (kind === 'fifty') {
                const wrong = current.choices.filter((c) => c !== current.answer);
                for (let i = wrong.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
                }
                const keep = [current.answer, wrong[0]];
                return json(200, {
                    lifeline: 'fifty',
                    remainingChoices: current.choices.filter((c) => keep.includes(c)),
                });
            }

            if (kind === 'skip') {
                const nextLevel = level + 1;
                const nextQ = questions[nextLevel - 1];
                if (!nextQ) {
                    return json(400, { error: 'Nothing left to skip to.' });
                }
                await base(SESSION_TABLE).update(session.id, { Level: nextLevel });
                return json(200, {
                    lifeline: 'skip',
                    question: publicQuestion(nextQ, nextLevel, session.id),
                });
            }

            return json(400, { error: 'Unknown lifeline' });
        }

        /* ── BANK — walk away with what you have ── */
        if (action === 'bank') {
            const banked = level > 1 ? games.LADDER[level - 2].points : 0;
            await base(SESSION_TABLE).update(session.id, {
                State: 'banked',
                PointsWon: banked,
                EndedAt: nowISO(),
            });

            if (banked > 0) {
                await points.earn(base, {
                    userId: decoded.userId, userName,
                    type: 'trivia_daily',
                    amountOverride: banked,
                    reason: `Banked at level ${level - 1} in Yeng Millionaire`,
                    refTable: SESSION_TABLE, refId: session.id,
                });
            }

            return json(200, {
                banked: true,
                pointsWon: banked,
                level: level - 1,
                balance: await points.getBalance(base, decoded.userId),
                message: banked ? `Banked ${banked} points. Smart.` : 'Walked away with nothing this time.',
            });
        }

        /* ── ANSWER ── */
        if (action === 'answer') {
            const choice = String(body.answer || '');
            const correct = choice === current.answer;
            const rung = games.LADDER.find((r) => r.level === level);

            if (!correct) {
                const floor = games.safeFloor(level);
                await base(SESSION_TABLE).update(session.id, {
                    State: 'lost',
                    PointsWon: floor,
                    EndedAt: nowISO(),
                });
                if (floor > 0) {
                    await points.earn(base, {
                        userId: decoded.userId, userName,
                        type: 'trivia_daily',
                        amountOverride: floor,
                        reason: 'Yeng Millionaire — fell back to a safe level',
                        refTable: SESSION_TABLE, refId: session.id,
                    });
                }
                return json(200, {
                    correct: false,
                    correctAnswer: current.answer,
                    state: 'lost',
                    pointsWon: floor,
                    safeFloor: floor,
                    balance: await points.getBalance(base, decoded.userId),
                    message: floor > 0
                        ? `Not this time — but you'd locked in ${floor} points at the safe level.`
                        : 'Not this time. Back tomorrow.',
                });
            }

            const nextLevel = level + 1;
            const nextQ = questions[nextLevel - 1];

            // Cleared the ladder.
            if (!nextQ || nextLevel > games.LADDER.length) {
                const won = rung.points;
                await base(SESSION_TABLE).update(session.id, {
                    State: 'won', PointsWon: won, Level: level, EndedAt: nowISO(),
                });
                await points.earn(base, {
                    userId: decoded.userId, userName,
                    type: 'trivia_daily',
                    amountOverride: won,
                    reason: 'Cleared Yeng Millionaire',
                    refTable: SESSION_TABLE, refId: session.id,
                });
                await cards.triggerDrop(base, {
                    userId: decoded.userId, userName, reason: 'millionaire_cleared', tier: 'premium',
                });
                return json(200, {
                    correct: true,
                    state: 'won',
                    pointsWon: won,
                    balance: await points.getBalance(base, decoded.userId),
                    message: `You cleared the whole ladder. ${won} points.`,
                });
            }

            await base(SESSION_TABLE).update(session.id, { Level: nextLevel });

            return json(200, {
                correct: true,
                state: 'active',
                bankedIfYouStop: rung.points,
                nextStake: games.LADDER[nextLevel - 1].points,
                question: publicQuestion(nextQ, nextLevel, session.id),
                // The whole game, in one field.
                decision: `Bank ${rung.points}, or risk it for ${games.LADDER[nextLevel - 1].points}?`,
            });
        }

        return json(400, { error: 'Unknown action' });
    } catch (err) {
        console.error('play-millionaire error:', err);
        return json(500, { error: 'Could not run the game right now.' });
    }
};
