/* ═══════════════════════════════════════════════════════
   SONG RANKING — serve head-to-head pairs
   ═══════════════════════════════════════════════════════
   Tinder-style: two songs, pick one, winner stays on, next challenger
   appears. Unlimited plays. The aggregate is the most valuable dataset in
   the app — you'd know which songs matter in Chicago versus Manila.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, esc, fetchAll, safeRead, verifyToken } = require('./lib/common');
const games = require('./lib/games');

const RANKING_TABLE = 'SongRankings';

/** Merge the discography with its current ranking state. */
async function loadSongs(base) {
    const [music, rankings] = await Promise.all([
        safeRead(() => fetchAll(base, 'MusicContent', {}, 400), []),
        safeRead(() => fetchAll(base, RANKING_TABLE, {}, 400), []),
    ]);

    const byId = new Map();
    for (const r of rankings) {
        byId.set(r.fields.SongId, {
            recordId: r.id,
            rating: Number(r.fields.Rating) || games.BASE_ELO,
            appearances: Number(r.fields.Appearances) || 0,
            wins: Number(r.fields.Wins) || 0,
        });
    }

    return music
        .filter((r) => r.fields.Title)
        .map((r) => {
            const state = byId.get(r.id) || {};
            return {
                id: r.id,
                title: r.fields.Title,
                year: r.fields.Year || null,
                era: r.fields.Era || null,
                thumbnail: r.fields.Thumbnail || null,
                rating: state.rating || games.BASE_ELO,
                appearances: state.appearances || 0,
                wins: state.wins || 0,
            };
        });
}

exports.handler = async (event) => {
    const pre = preflight(event, ['GET']);
    if (pre) return pre;

    const q = event.queryStringParameters || {};
    const base = getBase();

    try {
        const songs = await loadSongs(base);

        if (songs.length < 2) {
            return json(200, {
                pair: null,
                songs: songs.length,
                message: 'Not enough songs in the library yet to run a matchup.',
            });
        }

        /* ── Standings view ── */
        if (q.view === 'standings') {
            const ranked = [...songs]
                .filter((s) => s.appearances > 0)
                .sort((a, b) => b.rating - a.rating)
                .map((s, i) => ({
                    rank: i + 1,
                    id: s.id,
                    title: s.title,
                    year: s.year,
                    era: s.era,
                    rating: s.rating,
                    appearances: s.appearances,
                    wins: s.wins,
                    winRate: s.appearances ? Math.round((s.wins / s.appearances) * 100) : 0,
                }));

            // Honest about confidence — a song seen 3 times is not "ranked 4th".
            const settled = ranked.filter((s) => s.appearances >= 10);

            return json(200, {
                standings: ranked.slice(0, Math.min(parseInt(q.limit, 10) || 50, 100)),
                totalVotes: songs.reduce((s, x) => s + x.appearances, 0) / 2,
                settledCount: settled.length,
                provisionalCount: ranked.length - settled.length,
                note: 'Songs with fewer than 10 matchups are still provisional.',
            });
        }

        /* ── A pair to judge ── */
        // "winner stays on" — the client passes the reigning champion back.
        const keepId = q.keep && songs.find((s) => s.id === q.keep) ? q.keep : null;
        const exclude = String(q.exclude || '').split(',').filter(Boolean);

        let pair;
        if (keepId) {
            const champion = songs.find((s) => s.id === keepId);
            const challengers = songs.filter((s) => s.id !== keepId && !exclude.includes(s.id));
            if (!challengers.length) {
                pair = games.pickPair(songs, []);
            } else {
                const picked = games.pickPair([champion, ...challengers], []);
                // Ensure the champion is actually in the pair.
                pair = picked && picked.some((p) => p.id === keepId)
                    ? picked
                    : [champion, challengers[Math.floor(Math.random() * challengers.length)]];
            }
        } else {
            pair = games.pickPair(songs, exclude);
        }

        if (!pair) return json(200, { pair: null, message: 'No matchup available right now.' });

        const decoded = verifyToken(event);

        return json(200, {
            pair: pair.map((s) => ({
                id: s.id,
                title: s.title,
                year: s.year,
                era: s.era,
                thumbnail: s.thumbnail,
                // Ratings deliberately withheld from the player — showing them
                // would anchor the vote and poison the dataset.
            })),
            champion: keepId,
            librarySize: songs.length,
            signedIn: !!decoded,
        });
    } catch (err) {
        console.error('get-song-pairs error:', err);
        return json(500, { error: 'Could not load a matchup right now.' });
    }
};
