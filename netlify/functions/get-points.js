/* ═══════════════════════════════════════════════════════
   YENG POINTS — balance, history, and how to earn
   ═══════════════════════════════════════════════════════
   One currency, two entrances: engagement or a premium subscription.
   Premium buys points. It does not buy answers.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireUser } = require('./lib/common');
const points = require('./lib/points');

/* Fan-facing copy for the earn table. Kept beside the rates so the page and
   the server can never drift — the audit found exactly that drift in the old
   leaderboard points table. */
const EARN_COPY = [
    { type: 'cluster_answered',  label: 'Yeng answers a question you were part of', points: 15 },
    { type: 'trivia_daily',      label: 'Play Yeng Millionaire (once a day)',       points: 20 },
    { type: 'setlist_scored',    label: 'Nail a setlist prediction',                points: 25 },
    { type: 'question_asked',    label: 'Ask Yeng a question',                      points: 8 },
    { type: 'ranking_session',   label: 'Finish a song-ranking session',            points: 6 },
    { type: 'question_clustered',label: 'Your question joins a cluster',            points: 5 },
    { type: 'tour_pledge',       label: 'Tell Yeng you want a show in your city',   points: 5 },
    { type: 'lyric_round',       label: 'Finish the Lyric round',                   points: 2 },
    { type: 'site_visit',        label: 'Daily visit',                              points: 1 },
];

exports.handler = async (event) => {
    const pre = preflight(event, ['GET']);
    if (pre) return pre;

    const auth = await requireUser(event);
    if (!auth.ok) return auth.response;
    const { decoded } = auth;

    const base = getBase();

    try {
        const [balance, history] = await Promise.all([
            points.getBalance(base, decoded.userId),
            points.history(base, decoded.userId, 40),
        ]);

        let tier = 'Free';
        try {
            const user = await base('Users').find(decoded.userId);
            tier = user.fields.MembershipTier || 'Free';
        } catch { /* default Free */ }

        return json(200, {
            balance,
            history,
            tier,
            monthlyFromTier: points.TIER_MONTHLY_POINTS[tier] || 0,
            prices: {
                promoteQuestion: points.SPEND.promote_question,
                miniGameRetry: points.SPEND.mini_game_retry,
            },
            promotionCap: points.MAX_PROMOTIONS_PER_CYCLE,
            earnRates: EARN_COPY,
        });
    } catch (err) {
        console.error('get-points error:', err);
        return json(500, { error: 'Could not load your points right now.' });
    }
};
