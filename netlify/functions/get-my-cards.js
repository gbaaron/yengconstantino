/* ═══════════════════════════════════════════════════════
   TRADING CARDS — the fan's real collection
   ═══════════════════════════════════════════════════════
   Replaces the hardcoded single card in profile.html, where every logged-in
   fan saw the same Legendary #1-of-25 they did not own (AUDIT.md §1.1).

   Also serves the premium weekly drop, because that is the one drop that is
   owed rather than rolled — cosmetic and predictable, not a gamble.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireUser, tierAtLeast } = require('./lib/common');
const cards = require('./lib/cards');

exports.handler = async (event) => {
    const pre = preflight(event, ['GET', 'POST']);
    if (pre) return pre;

    const auth = await requireUser(event);
    if (!auth.ok) return auth.response;
    const { decoded } = auth;

    const base = getBase();

    try {
        const user = await base('Users').find(decoded.userId);
        const userName = user.fields.Name || user.fields.Username || 'Fan';
        const tier = user.fields.MembershipTier || 'Free';
        const isPremium = tierAtLeast(tier, 'Sariwang Simula');

        /* ── Claim the premium weekly drop ── */
        if (event.httpMethod === 'POST') {
            let body = {};
            try { body = JSON.parse(event.body || '{}'); } catch { /* fine */ }

            if (body.action === 'claimWeekly') {
                if (!isPremium) {
                    return json(403, { error: 'The weekly drop is a members-only perk.' });
                }
                if (await cards.hadWeeklyDrop(base, decoded.userId)) {
                    return json(400, { error: 'You have already claimed this week\'s drop.', alreadyClaimed: true });
                }
                const result = await cards.triggerDrop(base, {
                    userId: decoded.userId, userName,
                    reason: 'premium_weekly', tier: 'premium',
                    force: true, isPremium: true,
                });
                return json(200, result);
            }

            return json(400, { error: 'Unknown action' });
        }

        const owned = await cards.getOwned(base, decoded.userId);
        const weeklyClaimed = isPremium ? await cards.hadWeeklyDrop(base, decoded.userId) : true;

        const byRarity = owned.reduce((acc, c) => {
            acc[c.rarity] = (acc[c.rarity] || 0) + 1;
            return acc;
        }, {});

        return json(200, {
            cards: owned,
            count: owned.length,
            byRarity,
            perks: [...new Set(owned.map((c) => c.perk).filter(Boolean))].map((p) => ({
                key: p, label: cards.PERKS[p] || p,
            })),
            storeDiscount: await cards.getCardDiscount(base, decoded.userId),
            premium: {
                isPremium,
                tier,
                weeklyDropAvailable: isPremium && !weeklyClaimed,
            },
            // Published odds. No hidden rates.
            packOdds: cards.PACK_ODDS,
            howToEarn: Object.entries(cards.TRIGGERS)
                .filter(([k]) => k !== 'premium_weekly')
                .map(([key, t]) => ({ key, label: t.label, tier: t.tier })),
            noPaidPacks: true,
        });
    } catch (err) {
        console.error('get-my-cards error:', err);
        return json(500, { error: 'Could not load your cards right now.' });
    }
};
