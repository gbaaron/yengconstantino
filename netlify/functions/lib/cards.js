/* ═══════════════════════════════════════════════════════
   DIGITAL TRADING CARDS — drops, ownership, perks
   ═══════════════════════════════════════════════════════

   From the brief:
   - Cards are EARNED and DROPPED. No paid packs — pending legal advice, and
     paid loot boxes aimed at a large teenage Filipino fanbase is a headline
     risk her team would have to think about. Engagement-earned cards are
     just a loyalty programme. There is deliberately no purchase path in this
     file, and adding one should be a conscious decision, not a config flag.
   - "Streaks alone only reward people who already turn up. Weight drops
     toward the behaviours that feed the archive." So the trigger table below
     pays best for: a question that got clustered, being in a cluster she
     answered, and completing a ranking session.
   - Premium subscribers get one extra drop per week and exclusive card art.
     Cosmetic and predictable, not a gamble.
   ═══════════════════════════════════════════════════════ */

const { esc, fetchAll, safeRead, nowISO, todayISO, isMissingTable } = require('./common');

const CATALOG_TABLE = 'CardCatalog';
const OWNERSHIP_TABLE = 'CardOwnership';
const DROP_LOG_TABLE = 'CardDrops';

/* ── Drop triggers ───────────────────────────────────────
   `weight` is the relative chance of a drop firing at all; `tier` is which
   pack it opens. Archive-feeding behaviour is weighted highest on purpose. */
const TRIGGERS = {
    // Behaviours that fill the archive — the ones we actually want.
    cluster_answered:    { chance: 1.00, tier: 'premium', label: 'Yeng answered a question you were part of' },
    question_clustered:  { chance: 0.45, tier: 'basic',   label: 'Your question joined a cluster' },
    ranking_session:     { chance: 0.35, tier: 'basic',   label: 'Finished a ranking session' },
    setlist_scored:      { chance: 0.60, tier: 'premium', label: 'Setlist prediction scored' },
    millionaire_cleared: { chance: 1.00, tier: 'premium', label: 'Cleared Yeng Millionaire' },

    // Streaks still count, but they pay less — they only reward people who
    // already turn up.
    streak_7:            { chance: 0.80, tier: 'basic',   label: '7-day streak' },
    streak_30:           { chance: 1.00, tier: 'premium', label: '30-day streak' },

    // Ambient.
    random_daily:        { chance: 0.08, tier: 'basic',   label: 'Random drop' },
    premium_weekly:      { chance: 1.00, tier: 'premium', label: 'Premium weekly drop' },
};

/* Rarity odds per pack tier. Predictable, published, and identical for
   everyone — the point is a loyalty programme, not a slot machine. */
const PACK_ODDS = {
    basic:   { Common: 0.70, Uncommon: 0.22, Rare: 0.07, Legendary: 0.01 },
    premium: { Common: 0.40, Uncommon: 0.34, Rare: 0.21, Legendary: 0.05 },
};

const PERKS = {
    discount:  'Store discount',
    multiplier:'Yeng Points multiplier',
    lifeline:  'Extra mini-game lifeline',
    lineskip:  'Skip the line at a fan event',
};

function rollRarity(tier) {
    const odds = PACK_ODDS[tier] || PACK_ODDS.basic;
    let roll = Math.random();
    for (const [rarity, p] of Object.entries(odds)) {
        roll -= p;
        if (roll <= 0) return rarity;
    }
    return 'Common';
}

/** Cards a fan owns, with their catalog detail. */
async function getOwned(base, userId) {
    const owned = await safeRead(
        () => fetchAll(base, OWNERSHIP_TABLE, {
            filterByFormula: `{UserId} = '${esc(userId)}'`,
            sort: [{ field: 'AcquiredAt', direction: 'desc' }],
        }, 500),
        []
    );
    if (!owned.length) return [];

    const catalog = await safeRead(() => fetchAll(base, CATALOG_TABLE, {}, 500), []);
    const byId = new Map(catalog.map((c) => [c.id, c.fields]));

    return owned.map((o) => {
        const c = byId.get(o.fields.CardId) || {};
        return {
            ownershipId: o.id,
            cardId: o.fields.CardId,
            name: c.Name || o.fields.CardName || 'Yeng Card',
            title: c.CardTitle || '',
            rarity: c.Rarity || o.fields.Rarity || 'Common',
            serial: Number(o.fields.Serial) || null,
            cardTotal: Number(c.CardTotal) || null,
            frontUrl: c.FrontUrl || '/cards/yeng-front.html',
            backUrl: c.BackUrl || '/cards/yeng-back.html',
            perk: c.Perk || null,
            perkValue: c.PerkValue || null,
            yengPoints: Number(c.YengPoints) || 0,
            exclusive: !!c.PremiumExclusive,
            acquiredAt: o.fields.AcquiredAt,
            source: o.fields.Source || '',
        };
    });
}

/** Perk keys the fan currently holds, deduped. Drives real enforcement. */
async function getActivePerks(base, userId) {
    try {
        const owned = await getOwned(base, userId);
        return [...new Set(owned.map((c) => c.perk).filter(Boolean))];
    } catch {
        return [];
    }
}

/** Best store discount from the fan's cards (percent). */
async function getCardDiscount(base, userId) {
    try {
        const owned = await getOwned(base, userId);
        const discounts = owned
            .filter((c) => c.perk === 'discount')
            .map((c) => parseInt(c.perkValue, 10) || 0);
        return discounts.length ? Math.max(...discounts) : 0;
    } catch {
        return 0;
    }
}

/** Pick a card of the rolled rarity that the fan does not already own. */
async function pickCard(base, { rarity, userId, allowExclusive }) {
    const catalog = await safeRead(
        () => fetchAll(base, CATALOG_TABLE, {
            filterByFormula: `AND({Rarity} = '${esc(rarity)}', {Status} = 'Active')`,
        }, 300),
        []
    );
    if (!catalog.length) return null;

    const eligible = catalog.filter((c) => allowExclusive || !c.fields.PremiumExclusive);
    if (!eligible.length) return null;

    const owned = await safeRead(
        () => fetchAll(base, OWNERSHIP_TABLE, {
            filterByFormula: `{UserId} = '${esc(userId)}'`, fields: ['CardId'],
        }, 500),
        []
    );
    const ownedIds = new Set(owned.map((o) => o.fields.CardId));

    // Prefer something new; allow a duplicate only if they own the whole tier.
    const unseen = eligible.filter((c) => !ownedIds.has(c.id));
    const pool = unseen.length ? unseen : eligible;
    return pool[Math.floor(Math.random() * pool.length)];
}

/** Next serial number for a card in its numbered run. */
async function nextSerial(base, cardId) {
    const existing = await safeRead(
        () => fetchAll(base, OWNERSHIP_TABLE, {
            filterByFormula: `{CardId} = '${esc(cardId)}'`, fields: ['Serial'],
        }, 5000),
        []
    );
    const max = existing.reduce((m, r) => Math.max(m, Number(r.fields.Serial) || 0), 0);
    return max + 1;
}

/**
 * Fire a drop for a trigger. Returns { dropped:false } quietly when the roll
 * misses, when the catalog is empty, or when the tables don't exist yet —
 * a missing card system must never break the action that triggered it.
 */
async function triggerDrop(base, { userId, userName, reason, tier, force = false, isPremium = false }) {
    const trigger = TRIGGERS[reason];
    if (!trigger && !force) return { dropped: false, reason: 'unknown_trigger' };

    const chance = force ? 1 : trigger.chance;
    if (Math.random() > chance) return { dropped: false, reason: 'no_drop' };

    const packTier = tier || (trigger && trigger.tier) || 'basic';

    try {
        const rarity = rollRarity(packTier);
        const card = await pickCard(base, { rarity, userId, allowExclusive: isPremium });
        if (!card) return { dropped: false, reason: 'catalog_empty' };

        const serial = await nextSerial(base, card.id);
        const total = Number(card.fields.CardTotal) || 0;
        if (total && serial > total) return { dropped: false, reason: 'run_exhausted' };

        await base(OWNERSHIP_TABLE).create({
            UserId: userId,
            UserName: userName || '',
            CardId: card.id,
            CardName: card.fields.Name || '',
            Rarity: rarity,
            Serial: serial,
            Source: reason,
            AcquiredAt: nowISO(),
        });

        try {
            await base(DROP_LOG_TABLE).create({
                UserId: userId,
                UserName: userName || '',
                CardId: card.id,
                Reason: reason,
                Tier: packTier,
                Rarity: rarity,
                Day: todayISO(),
                CreatedAt: nowISO(),
            });
        } catch { /* log is optional */ }

        return {
            dropped: true,
            tier: packTier,
            card: {
                cardId: card.id,
                name: card.fields.Name || 'Yeng Card',
                title: card.fields.CardTitle || '',
                rarity,
                serial,
                cardTotal: total || null,
                frontUrl: card.fields.FrontUrl || '/cards/yeng-front.html',
                backUrl: card.fields.BackUrl || '/cards/yeng-back.html',
                perk: card.fields.Perk || null,
                perkValue: card.fields.PerkValue || null,
                exclusive: !!card.fields.PremiumExclusive,
            },
            triggerLabel: trigger ? trigger.label : reason,
        };
    } catch (err) {
        if (isMissingTable(err)) return { dropped: false, reason: 'cards_not_configured' };
        console.error('[cards] drop failed:', err.message);
        return { dropped: false, reason: 'error' };
    }
}

/** Has this fan already had their premium weekly drop? */
async function hadWeeklyDrop(base, userId) {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const rows = await safeRead(
        () => fetchAll(base, DROP_LOG_TABLE, {
            filterByFormula: `AND({UserId} = '${esc(userId)}', {Reason} = 'premium_weekly', IS_AFTER({CreatedAt}, '${esc(weekAgo)}'))`,
            fields: ['Reason'],
        }, 5),
        []
    );
    return rows.length > 0;
}

module.exports = {
    CATALOG_TABLE, OWNERSHIP_TABLE, DROP_LOG_TABLE,
    TRIGGERS, PACK_ODDS, PERKS,
    rollRarity, getOwned, getActivePerks, getCardDiscount,
    triggerDrop, hadWeeklyDrop, pickCard, nextSerial,
};
