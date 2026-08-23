/* ═══════════════════════════════════════════════════════
   SETLIST PREDICTION — a dashboard feature disguised as a game
   ═══════════════════════════════════════════════════════

   Fans pick what she'll play before an announced show; scored after.
   Costs nothing to run, and the aggregate pipes straight into the handler
   dashboard as demand data — which is the actual reason it exists.

   Actions:
     GET  ?eventId=   → the show, the song list, and this fan's picks
     POST submit      → { eventId, songIds[] }
     POST score       → admin: { eventId, actualSongIds[] } — scores everyone
   ═══════════════════════════════════════════════════════ */

const {
    preflight, json, getBase, requireUser, requireAdmin, esc, fetchAll, safeRead,
    isRecordId, nowISO, todayISO, verifyToken,
} = require('./lib/common');
const points = require('./lib/points');
const cards = require('./lib/cards');

const PICKS_TABLE = 'SetlistPicks';
const MAX_PICKS = 10;

exports.handler = async (event) => {
    const pre = preflight(event, ['GET', 'POST']);
    if (pre) return pre;

    const base = getBase();

    try {
        /* ── READ ── */
        if (event.httpMethod === 'GET') {
            const q = event.queryStringParameters || {};

            // Upcoming shows that are open for predictions.
            const events = await safeRead(
                () => fetchAll(base, 'Events', {
                    filterByFormula: `{Status} = 'Upcoming'`,
                    sort: [{ field: 'Date', direction: 'asc' }],
                }, 20),
                []
            );

            if (!q.eventId) {
                return json(200, {
                    shows: events.map((e) => ({
                        id: e.id,
                        title: e.fields.Title || '',
                        venue: e.fields.Venue || '',
                        city: e.fields.City || '',
                        date: e.fields.Date || null,
                        setlistScored: !!e.fields.SetlistScored,
                    })),
                });
            }

            if (!isRecordId(q.eventId)) return json(400, { error: 'Invalid show id' });

            let show;
            try {
                show = await base('Events').find(q.eventId);
            } catch {
                return json(404, { error: 'Show not found' });
            }

            const songs = await safeRead(() => fetchAll(base, 'MusicContent', {}, 300), []);

            // What everyone else is picking — the demand signal, shown back to
            // the fan because it makes the game more fun and costs nothing.
            const allPicks = await safeRead(
                () => fetchAll(base, PICKS_TABLE, {
                    filterByFormula: `{EventId} = '${esc(q.eventId)}'`,
                }, 5000),
                []
            );

            const tally = new Map();
            for (const p of allPicks) {
                for (const id of String(p.fields.SongIds || '').split(',').filter(Boolean)) {
                    tally.set(id, (tally.get(id) || 0) + 1);
                }
            }

            let yourPicks = [];
            const decoded = verifyToken(event);
            if (decoded) {
                const mine = allPicks.find((p) => p.fields.UserId === decoded.userId);
                if (mine) yourPicks = String(mine.fields.SongIds || '').split(',').filter(Boolean);
            }

            return json(200, {
                show: {
                    id: show.id,
                    title: show.fields.Title || '',
                    venue: show.fields.Venue || '',
                    city: show.fields.City || '',
                    date: show.fields.Date || null,
                    scored: !!show.fields.SetlistScored,
                    actualSongIds: show.fields.SetlistScored
                        ? String(show.fields.ActualSetlist || '').split(',').filter(Boolean)
                        : [],
                },
                songs: songs.map((s) => ({
                    id: s.id,
                    title: s.fields.Title || '',
                    year: s.fields.Year || null,
                    era: s.fields.Era || null,
                    pickCount: tally.get(s.id) || 0,
                })).sort((a, b) => b.pickCount - a.pickCount),
                yourPicks,
                totalPredictions: allPicks.length,
                maxPicks: MAX_PICKS,
                open: !show.fields.SetlistScored,
            });
        }

        /* ── WRITE ── */
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch {
            return json(400, { error: 'Invalid request' });
        }

        /* ── Admin: score a show ── */
        if (body.action === 'score') {
            const gate = await requireAdmin(event, base);
            if (!gate.ok) return gate.response;

            const { eventId, actualSongIds } = body;
            if (!isRecordId(eventId)) return json(400, { error: 'Invalid show id' });
            if (!Array.isArray(actualSongIds) || !actualSongIds.length) {
                return json(400, { error: 'Which songs did she actually play?' });
            }

            const actual = new Set(actualSongIds.filter(isRecordId));

            const allPicks = await safeRead(
                () => fetchAll(base, PICKS_TABLE, {
                    filterByFormula: `{EventId} = '${esc(eventId)}'`,
                }, 5000),
                []
            );

            let scored = 0;
            for (const p of allPicks) {
                const picks = String(p.fields.SongIds || '').split(',').filter(Boolean);
                const hits = picks.filter((id) => actual.has(id)).length;
                const accuracy = picks.length ? Math.round((hits / picks.length) * 100) : 0;

                try {
                    await base(PICKS_TABLE).update(p.id, {
                        Correct: hits,
                        Accuracy: accuracy,
                        Scored: true,
                        ScoredAt: nowISO(),
                    });
                } catch { /* best effort */ }

                if (hits > 0) {
                    await points.earn(base, {
                        userId: p.fields.UserId,
                        userName: p.fields.UserName,
                        type: 'setlist_scored',
                        amountOverride: hits * 5,
                        reason: `Setlist prediction — ${hits} correct`,
                        refTable: PICKS_TABLE, refId: p.id,
                    });
                }
                if (accuracy >= 70) {
                    await cards.triggerDrop(base, {
                        userId: p.fields.UserId,
                        userName: p.fields.UserName,
                        reason: 'setlist_scored',
                    });
                }
                scored++;
            }

            await base('Events').update(eventId, {
                SetlistScored: true,
                ActualSetlist: [...actual].join(','),
                SetlistScoredAt: nowISO(),
            });

            return json(200, { scored, songsPlayed: actual.size });
        }

        /* ── Fan: submit picks ── */
        const auth = await requireUser(event);
        if (!auth.ok) return auth.response;
        const { decoded } = auth;

        const { eventId, songIds } = body;
        if (!isRecordId(eventId)) return json(400, { error: 'Invalid show id' });
        if (!Array.isArray(songIds) || !songIds.length) {
            return json(400, { error: 'Pick at least one song.' });
        }

        const picks = [...new Set(songIds.filter(isRecordId))].slice(0, MAX_PICKS);
        if (!picks.length) return json(400, { error: 'Pick at least one song.' });

        let show;
        try {
            show = await base('Events').find(eventId);
        } catch {
            return json(404, { error: 'Show not found' });
        }
        if (show.fields.SetlistScored) {
            return json(400, { error: 'Predictions for this show are closed.' });
        }

        const user = await base('Users').find(decoded.userId);
        const userName = user.fields.Name || user.fields.Username || 'Fan';

        const existing = await safeRead(
            () => fetchAll(base, PICKS_TABLE, {
                filterByFormula: `AND({EventId} = '${esc(eventId)}', {UserId} = '${esc(decoded.userId)}')`,
                maxRecords: 1,
            }, 1),
            []
        );

        if (existing.length) {
            await base(PICKS_TABLE).update(existing[0].id, {
                SongIds: picks.join(','),
                UpdatedAt: nowISO(),
            });
            return json(200, { submitted: true, updated: true, picks: picks.length });
        }

        await base(PICKS_TABLE).create({
            EventId: eventId,
            EventTitle: show.fields.Title || '',
            City: show.fields.City || '',
            UserId: decoded.userId,
            UserName: userName,
            SongIds: picks.join(','),
            Scored: false,
            Day: todayISO(),
            CreatedAt: nowISO(),
            UpdatedAt: nowISO(),
        });

        const earned = await points.earn(base, {
            userId: decoded.userId, userName,
            type: 'setlist_submitted',
            reason: `Setlist prediction for ${show.fields.Title || 'a show'}`,
            refTable: PICKS_TABLE,
        });

        return json(200, {
            submitted: true,
            updated: false,
            picks: picks.length,
            pointsEarned: earned.amount || 0,
            balance: earned.balance,
        });
    } catch (err) {
        console.error('play-setlist error:', err);
        return json(500, { error: 'Could not load setlist predictions right now.' });
    }
};
