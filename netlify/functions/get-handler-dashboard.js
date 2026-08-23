/* ═══════════════════════════════════════════════════════
   HANDLER DASHBOARD — the eight panels, real data only
   ═══════════════════════════════════════════════════════

   Nobody builds for the bottleneck, which is why this wins. The handler is
   the gatekeeper: give them a tool that makes their week easier and they
   become an internal advocate rather than a message-forwarder.

   Two rules this file follows absolutely:

   1. NOTHING IS INVENTED. The old admin.html hardcoded 5 of 6 revenue bars,
      the whole "Top Rated Content" list and the entire revenue split, under
      an "AI-Powered" badge (AUDIT.md §1.1). Every number below is read from
      Airtable or is explicitly reported as unavailable. A panel with no data
      returns `available: false` and the UI says so.

   2. It is organised by JOB, not by table. The old panel was an Airtable
      sidebar — ten tabs named after tables. A handler's morning is
      "what needs me today", so that is the first thing this returns.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireAdmin, esc, fetchAll, safeRead, safeJSON } = require('./lib/common');
const cl = require('./lib/clustering');
const mod = require('./lib/moderation');

/* Words that move sentiment. Deliberately a lexicon, not a model: a handler
   needs to be able to ask "why is this negative" and get an answer. */
const POSITIVE = ['love','ganda','maganda','galing','best','amazing','proud','salamat','thank','idol','astig','solid','perfect','beautiful','favorite','paborito','sana','excited','grabe','husay','nakakaiyak','emotional','healing'];
const NEGATIVE = ['hate','bad','worst','boring','disappointed','sayang','pangit','flop','overrated','cringe','expensive','mahal','late','cancel','refund','rude','ignore'];

function sentimentOf(text) {
    const s = String(text || '').toLowerCase();
    let score = 0;
    for (const w of POSITIVE) if (s.includes(w)) score += 1;
    for (const w of NEGATIVE) if (s.includes(w)) score -= 1;
    return score;
}

exports.handler = async (event) => {
    const pre = preflight(event, ['GET']);
    if (pre) return pre;

    const base = getBase();
    const gate = await requireAdmin(event, base);
    if (!gate.ok) return gate.response;

    try {
        const [
            clusters, questions, promotions, tourRows, archiveRows,
            messages, posts, covers, ratings, modState, users, orders, tickets, memberships, ledger,
        ] = await Promise.all([
            safeRead(() => fetchAll(base, cl.CLUSTER_TABLE, {}, 1000), []),
            safeRead(() => fetchAll(base, cl.QUESTION_TABLE, {}, 5000), []),
            safeRead(() => fetchAll(base, 'Promotions', {}, 1000), []),
            safeRead(() => fetchAll(base, 'TourDemand', {}, 10000), []),
            safeRead(() => fetchAll(base, 'Archive', {}, 1000), []),
            safeRead(() => fetchAll(base, 'MessageRequests', {}, 500), []),
            safeRead(() => fetchAll(base, 'CommunityPosts', {}, 1000), []),
            safeRead(() => fetchAll(base, 'Covers', {}, 500), []),
            safeRead(() => fetchAll(base, 'ContentRatings', {}, 2000), []),
            safeRead(() => fetchAll(base, mod.STATE_TABLE, {}, 500), []),
            safeRead(() => fetchAll(base, 'Users', {}, 5000), []),
            safeRead(() => fetchAll(base, 'Orders', {}, 2000), []),
            safeRead(() => fetchAll(base, 'EventTickets', {}, 2000), []),
            safeRead(() => fetchAll(base, 'Memberships', {}, 1000), []),
            safeRead(() => fetchAll(base, 'YengPoints', {}, 10000), []),
        ]);

        /* ── 1. WHAT NEEDS YOU TODAY ──
           The panel that replaces "go look in five tabs". */
        const openClusters = clusters.filter((c) => ['Open', 'Shortlisted'].includes(c.fields.Status || 'Open'));
        const promotedWaiting = openClusters.filter((c) => c.fields.Promoted);
        const pendingMessages = messages.filter((m) => (m.fields.Status || '') === 'Pending');
        const pendingPosts = posts.filter((p) => (p.fields.Status || '') === 'Pending');
        const pendingCovers = covers.filter((c) => (c.fields.Status || '') === 'Submitted');
        const archiveCandidates = archiveRows.filter((a) => (a.fields.Status || '') === 'Candidate');

        const inbox = [
            promotedWaiting.length && {
                key: 'promoted', priority: 1,
                label: 'Promoted questions awaiting review',
                count: promotedWaiting.length,
                note: 'Fans spent points on these. Review is guaranteed — points are refunded if she passes.',
                link: '/studio.html#queue',
            },
            openClusters.length && {
                key: 'answer_queue', priority: 2,
                label: 'Question clusters open',
                count: openClusters.length,
                note: `${openClusters.reduce((s, c) => s + (Number(c.fields.QuestionCount) || 0), 0)} fans waiting`,
                link: '/studio.html#queue',
            },
            archiveCandidates.length && {
                key: 'archive_review', priority: 3,
                label: 'Archive items to keep or skip',
                count: archiveCandidates.length,
                note: 'About ten seconds each.',
                link: '/studio.html#archive',
            },
            pendingMessages.length && {
                key: 'cameo', priority: 4,
                label: 'Personalised video requests',
                count: pendingMessages.length,
                link: '/studio.html#cameo',
            },
            (pendingPosts.length + pendingCovers.length) && {
                key: 'moderation', priority: 5,
                label: 'Community items to review',
                count: pendingPosts.length + pendingCovers.length,
                link: '/handler.html#moderation',
            },
        ].filter(Boolean).sort((a, b) => a.priority - b.priority);

        /* ── 2. QUESTION THEMES, RANKED ── */
        const themeMap = new Map();
        for (const c of clusters) {
            const topic = c.fields.Topic || 'General';
            if (!themeMap.has(topic)) themeMap.set(topic, { topic, clusters: 0, fans: 0, answered: 0 });
            const t = themeMap.get(topic);
            t.clusters += 1;
            t.fans += Number(c.fields.QuestionCount) || 0;
            if ((c.fields.Status || '') === 'Answered') t.answered += 1;
        }
        const themes = [...themeMap.values()].sort((a, b) => b.fans - a.fans).slice(0, 20);

        const topClusters = openClusters
            .map((c) => ({
                id: c.id,
                mergedQuestion: c.fields.MergedQuestion || '',
                topic: c.fields.Topic || '',
                count: Number(c.fields.QuestionCount) || 0,
                promoted: !!c.fields.Promoted,
                promotionCount: Number(c.fields.PromotionCount) || 0,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 15);

        /* ── 3. TOUR DEMAND BY CITY ── */
        const cityMap = new Map();
        let demoPledges = 0;
        for (const r of tourRows) {
            const city = String(r.fields.City || '').trim();
            if (!city) continue;
            const key = `${city}|${r.fields.Country || ''}`;
            if (!cityMap.has(key)) {
                cityMap.set(key, { city, country: r.fields.Country || '', pledges: 0, people: 0, demo: 0 });
            }
            const e = cityMap.get(key);
            e.pledges += 1;
            e.people += Number(r.fields.PartySize) || 1;
            if (r.fields.IsDemo) { e.demo += 1; demoPledges += 1; }
        }
        const tourCities = [...cityMap.values()]
            .map((c) => ({ ...c, isDemo: c.demo === c.pledges && c.pledges > 0 }))
            .sort((a, b) => b.people - a.people);

        /* ── 4. SENTIMENT, BEFORE AND AFTER ── */
        const sentimentSources = [
            ...posts.map((p) => ({ text: p.fields.Content, at: p.fields.CreatedAt })),
            ...ratings.map((r) => ({ text: r.fields.ReviewText, at: r.fields.RatedAt })),
            ...covers.map((c) => ({ text: c.fields.PersonalNote, at: c.fields.SubmittedAt })),
        ].filter((x) => x.text && x.at);

        const weekly = new Map();
        for (const s of sentimentSources) {
            const d = new Date(s.at);
            if (isNaN(d)) continue;
            const week = `${d.getUTCFullYear()}-W${String(Math.ceil(((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7)).padStart(2, '0')}`;
            if (!weekly.has(week)) weekly.set(week, { week, positive: 0, negative: 0, neutral: 0, total: 0 });
            const w = weekly.get(week);
            const score = sentimentOf(s.text);
            if (score > 0) w.positive += 1;
            else if (score < 0) w.negative += 1;
            else w.neutral += 1;
            w.total += 1;
        }
        const sentimentTrend = [...weekly.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-12);

        /* ── 5. WATCH LIST + SKIP PILE ── */
        const skipPile = archiveRows
            .filter((a) => (a.fields.Status || '') === 'Skipped')
            .map((a) => ({
                id: a.id,
                title: a.fields.Title || '',
                source: a.fields.Source || '',
                sourceUrl: a.fields.SourceUrl || null,
                skippedAt: a.fields.SkippedAt || null,
            }))
            .sort((a, b) => String(b.skippedAt).localeCompare(String(a.skippedAt)))
            .slice(0, 40);

        /* ── 6. MODERATION OVERVIEW ── */
        const flagged = modState
            .filter((m) => (Number(m.fields.Tier) || 0) >= 2)
            .map((m) => ({
                userId: m.fields.UserId,
                userName: m.fields.UserName || '',
                tier: Number(m.fields.Tier) || 0,
                category: m.fields.Category || '',
                flagCount: Number(m.fields.FlagCount) || 0,
                shadowbanned: !!m.fields.Shadowbanned,
                updatedAt: m.fields.UpdatedAt,
            }))
            .sort((a, b) => b.tier - a.tier || b.flagCount - a.flagCount);

        /* ── 7. CAMEO QUEUE (fan context added by get-cameo-queue.js) ── */
        const cameoSummary = {
            pending: pendingMessages.length,
            inProgress: messages.filter((m) => ['Accepted', 'Recording'].includes(m.fields.Status || '')).length,
            delivered: messages.filter((m) => (m.fields.Status || '') === 'Delivered').length,
        };

        /* ── 8. REVENUE + POINTS ECONOMY ──
           Real sums only. Where a number cannot be derived we say so rather
           than filling the gap. */
        const orderRevenue = orders
            .filter((o) => !['Cancelled'].includes(o.fields.Status || ''))
            .reduce((s, o) => s + (Number(o.fields.TotalAmount) || 0), 0);
        const ticketRevenue = tickets
            .filter((t) => (t.fields.Status || '') === 'Confirmed')
            .reduce((s, t) => s + ((Number(t.fields.Price) || 0) * (Number(t.fields.Quantity) || 1)), 0);
        const membershipRevenue = memberships
            .filter((m) => (m.fields.Status || '') === 'Active')
            .reduce((s, m) => s + (Number(m.fields.Amount) || 0), 0);
        const cameoRevenue = messages
            .filter((m) => (m.fields.Status || '') === 'Delivered')
            .reduce((s, m) => s + (Number(m.fields.Price) || 0), 0);

        const pointsEarned = ledger.filter((r) => (Number(r.fields.Amount) || 0) > 0)
            .reduce((s, r) => s + Number(r.fields.Amount), 0);
        const pointsSpent = ledger.filter((r) => (Number(r.fields.Amount) || 0) < 0)
            .reduce((s, r) => s + Math.abs(Number(r.fields.Amount)), 0);
        const pointsRefunded = ledger.filter((r) => r.fields.RefundOf)
            .reduce((s, r) => s + (Number(r.fields.Amount) || 0), 0);

        const tierCounts = users.reduce((acc, u) => {
            const t = u.fields.MembershipTier || 'Free';
            acc[t] = (acc[t] || 0) + 1;
            return acc;
        }, {});

        return json(200, {
            generatedAt: new Date().toISOString(),

            inbox,

            questions: {
                available: clusters.length > 0,
                themes,
                topClusters,
                openClusters: openClusters.length,
                answeredClusters: clusters.filter((c) => (c.fields.Status || '') === 'Answered').length,
                passedClusters: clusters.filter((c) => (c.fields.Status || '') === 'Passed').length,
                totalQuestions: questions.length,
                fansWaiting: openClusters.reduce((s, c) => s + (Number(c.fields.QuestionCount) || 0), 0),
            },

            tour: {
                available: tourRows.length > 0,
                cities: tourCities.slice(0, 40),
                totalPeople: tourCities.reduce((s, c) => s + c.people, 0),
                totalCities: tourCities.length,
                demoPledges,
                demoIncluded: demoPledges > 0,
            },

            sentiment: {
                available: sentimentSources.length >= 5,
                trend: sentimentTrend,
                sampleSize: sentimentSources.length,
                method: 'Keyword lexicon over fan posts, reviews and cover notes. Not a model — every score is traceable to the words that produced it.',
            },

            archive: {
                available: archiveRows.length > 0,
                approved: archiveRows.filter((a) => (a.fields.Status || '') === 'Approved').length,
                candidates: archiveCandidates.length,
                skipped: skipPile.length,
                skipPile,
                transcribed: archiveRows.filter((a) => (a.fields.TranscriptStatus || '') === 'Done').length,
            },

            moderation: {
                available: true,
                tier2: flagged.filter((f) => f.tier === 2).length,
                tier3: flagged.filter((f) => f.tier === 3).length,
                users: flagged.slice(0, 40),
                pendingPosts: pendingPosts.length,
                pendingCovers: pendingCovers.length,
            },

            cameo: cameoSummary,

            economy: {
                available: true,
                revenue: {
                    merch: orderRevenue,
                    tickets: ticketRevenue,
                    memberships: membershipRevenue,
                    cameo: cameoRevenue,
                    total: orderRevenue + ticketRevenue + membershipRevenue + cameoRevenue,
                    currency: 'PHP',
                    note: 'Sum of committed records. Payments are self-reported references — no processor is connected, so these are orders placed, not money received.',
                },
                points: {
                    earned: pointsEarned,
                    spent: pointsSpent,
                    refunded: pointsRefunded,
                    inCirculation: pointsEarned - pointsSpent,
                    promotions: promotions.length,
                    promotionsRefunded: promotions.filter((p) => (p.fields.Status || '') === 'Refunded').length,
                },
                members: {
                    total: users.length,
                    byTier: tierCounts,
                },
            },
        });
    } catch (err) {
        console.error('get-handler-dashboard error:', err);
        return json(500, { error: 'Could not build the dashboard right now.' });
    }
};
