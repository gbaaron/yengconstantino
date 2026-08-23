/* ═══════════════════════════════════════════════════════
   SONG RANKING — record one head-to-head result
   ═══════════════════════════════════════════════════════
   Body: { winnerId, loserId, city?, country?, sessionComplete? }

   The city on each vote is what makes the aggregate genuinely valuable:
   you'd know which songs matter in Chicago versus Manila. It's taken from
   the fan's own pledged city or an explicit hint — never from IP geolocation.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireUser, esc, fetchAll, safeRead, isRecordId, nowISO, todayISO } = require('./lib/common');
const games = require('./lib/games');
const points = require('./lib/points');

const RANKING_TABLE = 'SongRankings';
const VOTE_TABLE = 'SongVotes';

/** Read-or-create the ranking state row for one song. */
async function getState(base, songId, title) {
    const rows = await safeRead(
        () => fetchAll(base, RANKING_TABLE, {
            filterByFormula: `{SongId} = '${esc(songId)}'`, maxRecords: 1,
        }, 1),
        []
    );
    if (rows.length) {
        return {
            recordId: rows[0].id,
            rating: Number(rows[0].fields.Rating) || games.BASE_ELO,
            appearances: Number(rows[0].fields.Appearances) || 0,
            wins: Number(rows[0].fields.Wins) || 0,
        };
    }
    const created = await base(RANKING_TABLE).create({
        SongId: songId,
        SongTitle: title || '',
        Rating: games.BASE_ELO,
        Appearances: 0,
        Wins: 0,
        UpdatedAt: nowISO(),
    });
    return { recordId: created.id, rating: games.BASE_ELO, appearances: 0, wins: 0 };
}

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

    const { winnerId, loserId } = body;
    if (!isRecordId(winnerId) || !isRecordId(loserId) || winnerId === loserId) {
        return json(400, { error: 'Invalid matchup' });
    }

    const base = getBase();

    try {
        const user = await base('Users').find(decoded.userId);
        const userName = user.fields.Name || user.fields.Username || 'Fan';

        let winnerTitle = '';
        let loserTitle = '';
        try {
            winnerTitle = (await base('MusicContent').find(winnerId)).fields.Title || '';
            loserTitle = (await base('MusicContent').find(loserId)).fields.Title || '';
        } catch {
            return json(400, { error: 'Those songs are no longer in the library.' });
        }

        const [w, l] = await Promise.all([
            getState(base, winnerId, winnerTitle),
            getState(base, loserId, loserTitle),
        ]);

        const next = games.applyElo(w.rating, l.rating, w.appearances, l.appearances);

        await Promise.all([
            base(RANKING_TABLE).update(w.recordId, {
                Rating: next.a,
                Appearances: w.appearances + 1,
                Wins: w.wins + 1,
                UpdatedAt: nowISO(),
            }),
            base(RANKING_TABLE).update(l.recordId, {
                Rating: next.b,
                Appearances: l.appearances + 1,
                UpdatedAt: nowISO(),
            }),
        ]);

        /* ── The per-vote row: this is the dataset ── */
        const city = String(body.city || '').trim().slice(0, 100);
        const country = String(body.country || '').trim().slice(0, 60);

        try {
            await base(VOTE_TABLE).create({
                UserId: decoded.userId,
                UserName: userName,
                WinnerId: winnerId,
                WinnerTitle: winnerTitle,
                LoserId: loserId,
                LoserTitle: loserTitle,
                City: city,
                Country: country,
                Day: todayISO(),
                CreatedAt: nowISO(),
            });
        } catch { /* the Elo state above is the important write */ }

        /* ── Points ──
           Small per-vote award; the session award is the meaningful one, and
           it also feeds the trading-card drop trigger for "completed a
           ranking session". */
        let earned = null;
        if (body.sessionComplete) {
            earned = await points.earn(base, {
                userId: decoded.userId, userName,
                type: 'ranking_session',
                reason: 'Finished a song-ranking session',
                refTable: VOTE_TABLE,
            });
        }

        return json(200, {
            recorded: true,
            winner: { id: winnerId, title: winnerTitle },
            loser: { id: loserId, title: loserTitle },
            pointsEarned: earned && earned.amount ? earned.amount : 0,
            capped: !!(earned && earned.capped),
            balance: earned ? earned.balance : undefined,
        });
    } catch (err) {
        console.error('submit-ranking error:', err);
        return json(500, { error: 'Could not record that pick right now.' });
    }
};
