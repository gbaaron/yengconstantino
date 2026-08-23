/* ═══════════════════════════════════════════════════════
   TIERED MODERATION — mostly silent, pattern-based
   ═══════════════════════════════════════════════════════

   From the brief, and these rules are load-bearing:

   - Rejections come from the SYSTEM, never from her. Copy is
     "This one didn't clear review." An official-sounding rejection with
     her name on it is a screenshot on Twitter within the hour.
   - Tier 1 (first few offences): SILENT. The question simply doesn't
     advance. No notification. Most people lose interest when nothing
     happens, and telling people the filter exists teaches them to beat it.
   - Tier 2 (sustained pattern of the same category): plain notification
     + submission rate throttle.
   - Tier 3 (persistent): shadowban. They can still submit; nothing surfaces.
   - The trigger is PATTERN, not incident. One clumsy question is a bad day.
     Twelve of the same category is a problem.

   Note the asymmetry that follows from "pattern, not incident": a single
   flagged question never escalates anything. Escalation reads the user's
   history in one category and only fires on repetition.
   ─────────────────────────────────────────────────────── */

const { esc, fetchAll, safeRead, nowISO, isMissingTable } = require('./common');

const FLAG_TABLE = 'ModerationFlags';
const STATE_TABLE = 'ModerationState';

/* Escalation thresholds, counted PER CATEGORY over the trailing window. */
const TIER2_THRESHOLD = 4;    // sustained enough to be a pattern
const TIER3_THRESHOLD = 12;   // persistent
const WINDOW_DAYS = 45;

/* Tier 2 throttle: max submissions accepted per day. */
const TIER2_DAILY_LIMIT = 2;

/* ── Categories ─────────────────────────────────────────
   Deliberately narrow. This filter exists to catch the three things the
   brief names — mean-spirited, sexual, intrusive-personal — not to police
   tone generally. A question that is merely blunt should pass.            */
const CATEGORIES = {
    mean: {
        label: 'mean-spirited',
        patterns: [
            /\b(ugly|fat|stupid|idiot|talentless|washed[- ]?up|has[- ]?been|flop|panget|bobo|tanga|pangit)\b/i,
            /\b(kill|die|kys|hang) *(yourself|urself)\b/i,
            /\byou (suck|can'?t sing|are (a )?(joke|fraud|fake))\b/i,
            /\b(overrated|cancel(l?ed)?) *(you|yeng)\b/i,
        ],
    },
    sexual: {
        label: 'sexual',
        patterns: [
            /\b(sex|sexy|nude|naked|boobs|breast|ass|thicc|horny|f+u+c+k+|hubad|malibog|chupa)\b/i,
            /\b(send|show) *(me)? *(nudes|pics of your body)\b/i,
            /\b(sleep with|hook ?up with|make love to) (me|you)\b/i,
        ],
    },
    intrusive: {
        label: 'intrusive-personal',
        patterns: [
            /\b(divorce|cheat(ing|ed)?|affair|breakup|break ?up|separated?)\b.*\b(you|your|yeng|asawa|mister)\b/i,
            /\b(are|were) you (pregnant|cheating|separated|getting a divorce)\b/i,
            /\bwhy (did|do) you and .{0,30}\b(split|break ?up|separate)\b/i,
            /\b(your|yeng'?s) (husband|marriage|miscarriage|pregnan\w+|salary|net ?worth|address|bahay|house)\b/i,
            /\b(how much|magkano) .{0,20}\b(you (earn|make)|kita mo|sahod)\b/i,
            /\bwhen (are|will) you .{0,20}\b(have (a )?bab(y|ies)|get pregnant|magka ?anak)\b/i,
        ],
    },
};

/**
 * Classify a submission. Returns { flagged, category, label } — never a
 * user-facing message, because the caller decides what (if anything) to say.
 */
function classify(text) {
    const s = String(text || '');
    for (const [key, def] of Object.entries(CATEGORIES)) {
        if (def.patterns.some((re) => re.test(s))) {
            return { flagged: true, category: key, label: def.label };
        }
    }
    return { flagged: false, category: null, label: null };
}

/** Read the user's current moderation state row (or a clean default). */
async function getState(base, userId) {
    const rows = await safeRead(
        () => fetchAll(base, STATE_TABLE, {
            filterByFormula: `{UserId} = '${esc(userId)}'`, maxRecords: 1,
        }, 1),
        []
    );
    if (!rows.length) {
        return { recordId: null, tier: 0, category: null, shadowbanned: false, notifiedAtTier: 0 };
    }
    const f = rows[0].fields;
    return {
        recordId: rows[0].id,
        tier: Number(f.Tier) || 0,
        category: f.Category || null,
        shadowbanned: !!f.Shadowbanned,
        notifiedAtTier: Number(f.NotifiedAtTier) || 0,
        updatedAt: f.UpdatedAt,
    };
}

/** Count this user's flags in one category inside the trailing window. */
async function countFlags(base, userId, category) {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
    const rows = await safeRead(
        () => fetchAll(base, FLAG_TABLE, {
            filterByFormula: `AND({UserId} = '${esc(userId)}', {Category} = '${esc(category)}', IS_AFTER({CreatedAt}, '${esc(since)}'))`,
            fields: ['Category'],
        }),
        []
    );
    return rows.length;
}

/** How many submissions this user made today (for the tier-2 throttle). */
async function submissionsToday(base, userId, table, dayField = 'Day') {
    const today = new Date().toISOString().split('T')[0];
    const rows = await safeRead(
        () => fetchAll(base, table, {
            filterByFormula: `AND({UserId} = '${esc(userId)}', {${dayField}} = '${today}')`,
            fields: ['UserId'],
        }),
        []
    );
    return rows.length;
}

async function upsertState(base, userId, userName, patch, existingRecordId) {
    const fields = { UserId: userId, UserName: userName || '', ...patch, UpdatedAt: nowISO() };
    try {
        if (existingRecordId) {
            await base(STATE_TABLE).update(existingRecordId, fields);
            return existingRecordId;
        }
        const rec = await base(STATE_TABLE).create(fields);
        return rec.id;
    } catch (err) {
        if (isMissingTable(err)) return null;
        throw err;
    }
}

/**
 * Record a flag and escalate if the PATTERN warrants it.
 * Returns the resulting state so the caller can decide on notification.
 */
async function recordFlag(base, { userId, userName, category, excerpt }) {
    try {
        await base(FLAG_TABLE).create({
            UserId: userId,
            UserName: userName || '',
            Category: category,
            Excerpt: String(excerpt || '').slice(0, 500),
            CreatedAt: nowISO(),
        });
    } catch (err) {
        if (!isMissingTable(err)) throw err;
    }

    const count = await countFlags(base, userId, category);
    const state = await getState(base, userId);

    let tier = state.tier;
    if (count >= TIER3_THRESHOLD) tier = 3;
    else if (count >= TIER2_THRESHOLD) tier = Math.max(tier, 2);
    else tier = Math.max(tier, 1);

    if (tier !== state.tier || state.category !== category) {
        await upsertState(base, userId, userName, {
            Tier: tier,
            Category: category,
            Shadowbanned: tier >= 3,
            FlagCount: count,
        }, state.recordId);
    }

    return { tier, category, count, shadowbanned: tier >= 3, previousTier: state.tier };
}

/**
 * The full pre-submission gate.
 *
 * Returns a decision object:
 *   { accept:true,  surface:true  } — normal path
 *   { accept:true,  surface:false } — shadowbanned; store it, never surface it
 *   { accept:false, notify:false  } — tier 1: silently dropped, UI shows success
 *   { accept:false, notify:true, message } — tier 2+: plain system-voice message
 *
 * The caller must ALWAYS show the fan a success state when notify is false.
 * That is the point of tier 1.
 */
async function screen(base, { userId, userName, text, submissionTable }) {
    const state = await getState(base, userId);

    // Shadowbanned users: accept everything, surface nothing. They see a
    // completely normal app. Nothing they post ever reaches a cluster.
    if (state.shadowbanned) {
        return { accept: true, surface: false, shadowbanned: true, tier: 3, notify: false };
    }

    // Tier 2 throttle on submission RATE, applied before content checks so a
    // throttled user gets the same message regardless of what they wrote.
    if (state.tier >= 2 && submissionTable) {
        const todayCount = await submissionsToday(base, userId, submissionTable);
        if (todayCount >= TIER2_DAILY_LIMIT) {
            return {
                accept: false,
                surface: false,
                notify: true,
                tier: state.tier,
                message: `You've reached today's limit of ${TIER2_DAILY_LIMIT} questions. Try again tomorrow.`,
            };
        }
    }

    const verdict = classify(text);
    if (!verdict.flagged) {
        return { accept: true, surface: true, tier: state.tier, notify: false };
    }

    const result = await recordFlag(base, {
        userId, userName, category: verdict.category, excerpt: text,
    });

    // Tier 1 — silent. No notification. The question simply does not advance.
    if (result.tier < 2) {
        return { accept: false, surface: false, notify: false, tier: result.tier, silent: true };
    }

    // Tier 2 — plain, system-voiced, and only once per escalation so we are
    // not reminding them every single time that a filter exists.
    if (result.tier === 2) {
        const shouldNotify = state.notifiedAtTier < 2;
        if (shouldNotify) {
            await upsertState(base, userId, userName, { NotifiedAtTier: 2 }, state.recordId);
        }
        return {
            accept: false,
            surface: false,
            notify: shouldNotify,
            tier: 2,
            message: "This one didn't clear review. A few of your recent questions haven't either, so your daily limit is lower for now.",
        };
    }

    // Tier 3 — shadowban takes effect from the next submission onward.
    return { accept: true, surface: false, notify: false, tier: 3, shadowbanned: true };
}

/** The one rejection string the fan is ever shown. Never in her voice. */
const REJECTION_COPY = "This one didn't clear review.";

module.exports = {
    FLAG_TABLE, STATE_TABLE, CATEGORIES, REJECTION_COPY,
    TIER2_THRESHOLD, TIER3_THRESHOLD, TIER2_DAILY_LIMIT, WINDOW_DAYS,
    classify, screen, getState, recordFlag, countFlags,
};
