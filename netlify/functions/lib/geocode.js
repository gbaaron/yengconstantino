// Geocoding helper for the Events feature.
//
// Per the product decision, event coordinates are auto-derived from the
// City / Venue / Country text on each Events record — no manual lat/lng entry.
//
// Strategy (cheapest → most expensive):
//   1. Built-in dictionary of the cities Yeng actually plays (almost all PH,
//      plus the overseas OFW-concert hubs). Zero network cost, instant.
//   2. OpenStreetMap Nominatim as a fallback for anything not in the dict.
//      Free, no API key, but rate-limited — so we only hit it on a miss.
//   3. Whatever we resolve gets written back to the Events record (Latitude /
//      Longitude number fields) when those fields exist, so each city is only
//      ever geocoded once.

// Lowercased "city" → [lat, lng]. Keep keys city-only; we match on City first.
const CITY_COORDS = {
    // Metro Manila
    'manila': [14.5995, 120.9842],
    'quezon city': [14.6760, 121.0437],
    'makati': [14.5547, 121.0244],
    'mandaluyong': [14.5794, 121.0359],
    'pasay': [14.5378, 120.9896],
    'pasig': [14.5764, 121.0851],
    'taguig': [14.5176, 121.0509],
    'paranaque': [14.4793, 121.0198],
    'parañaque': [14.4793, 121.0198],
    'muntinlupa': [14.3832, 121.0409],
    'marikina': [14.6507, 121.1029],
    'caloocan': [14.6577, 120.9660],
    'las pinas': [14.4499, 120.9833],
    'las piñas': [14.4499, 120.9833],
    'valenzuela': [14.7000, 120.9830],
    'san juan': [14.6019, 121.0355],
    // Luzon
    'antipolo': [14.5878, 121.1760],
    'baguio': [16.4023, 120.5960],
    'baguio city': [16.4023, 120.5960],
    'angeles': [15.1450, 120.5887],
    'angeles city': [15.1450, 120.5887],
    'clark': [15.1858, 120.5601],
    'san fernando': [15.0286, 120.6898],
    'olongapo': [14.8296, 120.2828],
    'subic': [14.8790, 120.2350],
    'tarlac': [15.4755, 120.5960],
    'tarlac city': [15.4755, 120.5960],
    'dagupan': [16.0430, 120.3330],
    'laoag': [18.1978, 120.5936],
    'vigan': [17.5747, 120.3869],
    'tuguegarao': [17.6132, 121.7270],
    'cabanatuan': [15.4886, 120.9668],
    'batangas': [13.7565, 121.0583],
    'batangas city': [13.7565, 121.0583],
    'lipa': [13.9411, 121.1624],
    'lucena': [13.9373, 121.6170],
    'calamba': [14.2117, 121.1653],
    'santa rosa': [14.3123, 121.1114],
    'sta rosa': [14.3123, 121.1114],
    'naga': [13.6218, 123.1948],
    'naga city': [13.6218, 123.1948],
    'legazpi': [13.1391, 123.7438],
    'legaspi': [13.1391, 123.7438],
    'puerto princesa': [9.7392, 118.7353],
    // Visayas
    'cebu': [10.3157, 123.8854],
    'cebu city': [10.3157, 123.8854],
    'mandaue': [10.3237, 123.9223],
    'lapu-lapu': [10.3103, 123.9494],
    'lapu-lapu city': [10.3103, 123.9494],
    'iloilo': [10.7202, 122.5621],
    'iloilo city': [10.7202, 122.5621],
    'bacolod': [10.6407, 122.9689],
    'bacolod city': [10.6407, 122.9689],
    'tacloban': [11.2444, 125.0048],
    'tagbilaran': [9.6475, 123.8556],
    'dumaguete': [9.3103, 123.3080],
    'roxas': [11.5853, 122.7511],
    'ormoc': [11.0064, 124.6075],
    // Mindanao
    'davao': [7.1907, 125.4553],
    'davao city': [7.1907, 125.4553],
    'cagayan de oro': [8.4542, 124.6319],
    'general santos': [6.1164, 125.1716],
    'gensan': [6.1164, 125.1716],
    'zamboanga': [6.9214, 122.0790],
    'zamboanga city': [6.9214, 122.0790],
    'butuan': [8.9475, 125.5406],
    'iligan': [8.2280, 124.2452],
    'cotabato': [7.2047, 124.2310],
    'koronadal': [6.5031, 124.8469],
    'pagadian': [7.8257, 123.4366],
    'dipolog': [8.5883, 123.3414],
    'valencia': [7.9060, 125.0947],
    // Overseas OFW concert hubs Yeng has toured
    'dubai': [25.2048, 55.2708],
    'abu dhabi': [24.4539, 54.3773],
    'doha': [25.2854, 51.5310],
    'singapore': [1.3521, 103.8198],
    'hong kong': [22.3193, 114.1694],
    'kuala lumpur': [3.1390, 101.6869],
    'tokyo': [35.6762, 139.6503],
    'osaka': [34.6937, 135.5023],
    'seoul': [37.5665, 126.9780],
    'toronto': [43.6532, -79.3832],
    'vancouver': [49.2827, -123.1207],
    'los angeles': [34.0522, -118.2437],
    'san francisco': [37.7749, -122.4194],
    'las vegas': [36.1699, -115.1398],
    'new york': [40.7128, -74.0060],
    'chicago': [41.8781, -87.6298],
    'london': [51.5074, -0.1278],
    'sydney': [-33.8688, 151.2093],
    'melbourne': [-37.8136, 144.9631],
    'riyadh': [24.7136, 46.6753],
    'jeddah': [21.4858, 39.1925]
};

function norm(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Try the built-in dictionary. Exact match first, then LONGEST word-boundary
// match so "Quezon City, Metro Manila" resolves to Quezon City.
//
// The previous version did a loose bidirectional `indexOf` and returned the
// first hit in object-key order, which made results order-dependent and wrong:
// a city of "San" matched whichever of 'san juan' / 'san fernando' /
// 'san francisco' happened to iterate first (AUDIT.md §1.2). Requiring a word
// boundary and preferring the longest match removes both problems.
function fromDictionary(city) {
    const key = norm(city);
    if (!key) return null;
    if (CITY_COORDS[key]) return CITY_COORDS[key];

    let best = null;
    let bestLen = 0;
    for (const dictKey in CITY_COORDS) {
        // Word-boundary containment only — "san" must not match "san juan".
        const re = new RegExp(`(^|[^a-z])${dictKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
        if (re.test(key) && dictKey.length > bestLen) {
            best = CITY_COORDS[dictKey];
            bestLen = dictKey.length;
        }
    }
    return best;
}

// Fallback: OpenStreetMap Nominatim (free, no key). Only called on a dict miss.
async function fromNominatim(city, country) {
    const q = encodeURIComponent([city, country || 'Philippines'].filter(Boolean).join(', '));
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`;
    try {
        const res = await fetch(url, {
            headers: {
                // Nominatim's usage policy requires an identifying User-Agent.
                'User-Agent': 'YengConstantinoOfficialApp/1.0 (events geocoder)'
            }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
        }
    } catch (err) {
        console.warn('Nominatim geocode failed for', city, err.message);
    }
    return null;
}

// Resolve a { lat, lng } for one event's location text.
// Returns null when nothing resolves (caller just omits coordinates).
async function geocodeCity(city, country) {
    const dict = fromDictionary(city);
    if (dict) return { lat: dict[0], lng: dict[1], source: 'dict' };

    const remote = await fromNominatim(city, country);
    if (remote) return { lat: remote[0], lng: remote[1], source: 'nominatim' };

    return null;
}

/* ── Process-level cache ──────────────────────────────────
   A warm Lambda serves many requests. Caching here means a dictionary miss
   costs one Nominatim call per container rather than one per request.

   This is the fix for the gap the audit found: the header comment above
   (step 3) promised coordinates were written back so each city was geocoded
   once, but no write-back existed anywhere — get-events.js re-geocoded every
   miss on every request, in parallel, against Nominatim's 1 req/s policy.
   Callers that own a record (pledge-tour.js, get-events.js) now also persist
   Latitude/Longitude on the row, so the cache is belt and braces.           */
const _cache = new Map();

/**
 * Resolve { lat, lng, source } for a city, or null.
 * Cached in-process; safe to call in a loop.
 */
async function resolveCity(city, country) {
    const key = `${norm(city)}|${norm(country)}`;
    if (_cache.has(key)) return _cache.get(key);

    const result = await geocodeCity(city, country);
    _cache.set(key, result);
    return result;
}

/**
 * Resolve many cities without hammering Nominatim: dictionary hits resolve
 * instantly and in parallel, misses are serialised with a 1.1s gap to stay
 * inside the usage policy.
 */
async function resolveMany(items, { maxRemote = 5 } = {}) {
    const out = new Map();
    const misses = [];

    for (const { city, country } of items) {
        const key = `${norm(city)}|${norm(country)}`;
        if (out.has(key)) continue;
        if (_cache.has(key)) { out.set(key, _cache.get(key)); continue; }
        const dict = fromDictionary(city);
        if (dict) {
            const hit = { lat: dict[0], lng: dict[1], source: 'dict' };
            _cache.set(key, hit);
            out.set(key, hit);
        } else {
            misses.push({ key, city, country });
        }
    }

    let remoteUsed = 0;
    for (const m of misses) {
        if (remoteUsed >= maxRemote) { out.set(m.key, null); continue; }
        const remote = await fromNominatim(m.city, m.country);
        const hit = remote ? { lat: remote[0], lng: remote[1], source: 'nominatim' } : null;
        _cache.set(m.key, hit);
        out.set(m.key, hit);
        remoteUsed++;
        if (remoteUsed < misses.length) await new Promise((r) => setTimeout(r, 1100));
    }

    return out;
}

const cacheKey = (city, country) => `${norm(city)}|${norm(country)}`;

module.exports = { geocodeCity, fromDictionary, resolveCity, resolveMany, cacheKey, norm };
