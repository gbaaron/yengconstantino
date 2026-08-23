/* ═══════════════════════════════════════════════════════
   TOUR DEMAND — aggregated heat map data
   ═══════════════════════════════════════════════════════

   This is booking intelligence her team currently guesses at, so the output
   shape is deliberately the shape a promoter thinks in: city, country,
   headcount, party size, and how fresh the signal is.

   Demo data: rows carry IsDemo = true and are ALWAYS reported separately in
   the response (`demoIncluded`, and a per-city `isDemo` flag) so a live demo
   can show a populated map without anyone mistaking it for real bookings.
   Purge with: node scripts/purge-demo-data.js
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, fetchAll, safeRead, verifyToken, esc } = require('./lib/common');

const TABLE = 'TourDemand';

exports.handler = async (event) => {
    const pre = preflight(event, ['GET']);
    if (pre) return pre;

    const q = event.queryStringParameters || {};
    const includeDemo = q.demo !== 'false';
    const base = getBase();

    try {
        const rows = await safeRead(
            () => fetchAll(base, TABLE, {}, 10000),
            []
        );

        const relevant = includeDemo ? rows : rows.filter((r) => !r.fields.IsDemo);

        /* ── Aggregate by city ── */
        const byCity = new Map();
        let demoRows = 0;

        for (const r of relevant) {
            const f = r.fields;
            const city = String(f.City || '').trim();
            if (!city) continue;
            const key = `${city.toLowerCase()}|${String(f.Country || '').toLowerCase()}`;
            const party = Number(f.PartySize) || 1;
            if (f.IsDemo) demoRows++;

            if (!byCity.has(key)) {
                byCity.set(key, {
                    city,
                    country: f.Country || '',
                    pledges: 0,
                    people: 0,
                    lat: f.Latitude != null ? Number(f.Latitude) : null,
                    lng: f.Longitude != null ? Number(f.Longitude) : null,
                    lastPledgeAt: f.CreatedAt || null,
                    demoPledges: 0,
                });
            }
            const entry = byCity.get(key);
            entry.pledges += 1;
            entry.people += party;
            if (f.IsDemo) entry.demoPledges += 1;
            if (entry.lat == null && f.Latitude != null) {
                entry.lat = Number(f.Latitude);
                entry.lng = Number(f.Longitude);
            }
            if (f.CreatedAt && (!entry.lastPledgeAt || f.CreatedAt > entry.lastPledgeAt)) {
                entry.lastPledgeAt = f.CreatedAt;
            }
        }

        const cities = [...byCity.values()]
            .map((c) => ({
                ...c,
                avgPartySize: c.pledges ? Math.round((c.people / c.pledges) * 10) / 10 : 0,
                isDemo: c.demoPledges === c.pledges && c.pledges > 0,
                partlyDemo: c.demoPledges > 0 && c.demoPledges < c.pledges,
            }))
            .sort((a, b) => b.people - a.people);

        const totalPeople = cities.reduce((s, c) => s + c.people, 0);
        const totalPledges = cities.reduce((s, c) => s + c.pledges, 0);

        /* ── Country rollup — the diaspora view ── */
        const byCountry = new Map();
        for (const c of cities) {
            const key = c.country || 'Unknown';
            if (!byCountry.has(key)) byCountry.set(key, { country: key, people: 0, pledges: 0, cities: 0 });
            const e = byCountry.get(key);
            e.people += c.people;
            e.pledges += c.pledges;
            e.cities += 1;
        }
        const countries = [...byCountry.values()].sort((a, b) => b.people - a.people);

        /* ── Whether this fan has already pledged ── */
        let yourPledges = [];
        const decoded = verifyToken(event);
        if (decoded) {
            const mine = await safeRead(
                () => fetchAll(base, TABLE, {
                    filterByFormula: `{UserId} = '${esc(decoded.userId)}'`,
                }, 50),
                []
            );
            yourPledges = mine.map((r) => ({
                city: r.fields.City,
                country: r.fields.Country,
                partySize: Number(r.fields.PartySize) || 1,
            }));
        }

        return json(200, {
            cities: cities.slice(0, Math.min(parseInt(q.limit, 10) || 100, 300)),
            countries,
            totals: {
                people: totalPeople,
                pledges: totalPledges,
                cities: cities.length,
                countries: countries.length,
            },
            yourPledges,
            demoIncluded: demoRows > 0,
            demoPledges: demoRows,
            // Loud on purpose. A pitch should never blur this line.
            demoNotice: demoRows > 0
                ? 'This map includes seeded demonstration pledges, flagged per city. Purge them with scripts/purge-demo-data.js before going live.'
                : null,
        });
    } catch (err) {
        console.error('get-tour-demand error:', err);
        return json(500, { error: 'Could not load tour demand right now.' });
    }
};
