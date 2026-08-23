/* ═══════════════════════════════════════════════════════
   TOUR DEMAND — "I'd come if you played here"
   ═══════════════════════════════════════════════════════

   Lowest-effort fan action in the app, highest-value data output.
   One tap plus an optional party size, which is what turns interest into
   a bookable number.

   Re-pledging updates the existing row rather than creating a second one,
   so the city counts are people, not taps.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireUser, esc, fetchAll, safeRead, nowISO, todayISO } = require('./lib/common');
const { resolveCity } = require('./lib/geocode');
const points = require('./lib/points');

const TABLE = 'TourDemand';
const MAX_PARTY = 20;

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

    const city = String(body.city || '').trim().slice(0, 100);
    const country = String(body.country || 'Philippines').trim().slice(0, 60);
    // "me plus three" → partySize 4. Default 1 = just them.
    let partySize = parseInt(body.partySize, 10);
    if (!Number.isFinite(partySize) || partySize < 1) partySize = 1;
    if (partySize > MAX_PARTY) partySize = MAX_PARTY;

    if (city.length < 2) return json(400, { error: 'Which city?' });

    const base = getBase();

    try {
        const user = await base('Users').find(decoded.userId);
        const userName = user.fields.Name || user.fields.Username || 'Fan';

        // Resolve coordinates once, at write time, and store them on the row.
        // The audit found get-events.js re-geocoding on every single request
        // against Nominatim's 1 req/s policy — this avoids repeating that.
        const geo = await resolveCity(city, country);

        const existing = await safeRead(
            () => fetchAll(base, TABLE, {
                filterByFormula: `AND({UserId} = '${esc(decoded.userId)}', LOWER({City}) = '${esc(city.toLowerCase())}')`,
                maxRecords: 1,
            }, 1),
            []
        );

        if (existing.length) {
            await base(TABLE).update(existing[0].id, {
                PartySize: partySize,
                UpdatedAt: nowISO(),
            });
            const total = await cityTotals(base, city);
            return json(200, {
                pledged: true,
                updated: true,
                city, country, partySize,
                cityTotal: total,
                message: `Updated — you and ${partySize - 1} other${partySize - 1 === 1 ? '' : 's'} in ${city}.`,
            });
        }

        await base(TABLE).create({
            UserId: decoded.userId,
            UserName: userName,
            City: city,
            Country: country,
            PartySize: partySize,
            Latitude: geo ? geo.lat : null,
            Longitude: geo ? geo.lng : null,
            GeoSource: geo ? geo.source : 'unresolved',
            IsDemo: false,           // real pledges are never flagged demo
            Day: todayISO(),
            CreatedAt: nowISO(),
            UpdatedAt: nowISO(),
        });

        await points.earn(base, {
            userId: decoded.userId,
            userName,
            type: 'tour_pledge',
            reason: `Asked for a show in ${city}`,
            refTable: TABLE,
        });

        const total = await cityTotals(base, city);

        return json(200, {
            pledged: true,
            updated: false,
            city, country, partySize,
            cityTotal: total,
            balance: await points.getBalance(base, decoded.userId),
            message: `You're in. ${total.people} ${total.people === 1 ? 'person wants' : 'people want'} a show in ${city}.`,
        });
    } catch (err) {
        console.error('pledge-tour error:', err);
        return json(500, { error: 'Could not record that right now.' });
    }
};

async function cityTotals(base, city) {
    const rows = await safeRead(
        () => fetchAll(base, TABLE, {
            filterByFormula: `LOWER({City}) = '${esc(city.toLowerCase())}'`,
            fields: ['PartySize'],
        }, 5000),
        []
    );
    return {
        pledges: rows.length,
        people: rows.reduce((s, r) => s + (Number(r.fields.PartySize) || 1), 0),
    };
}
