/* ═══════════════════════════════════════════════════════
   CAMEO — the fan's own requests (closes the delivery dead-end)
   ═══════════════════════════════════════════════════════
   The audit found a broken loop: a fan could pay for a personalised video,
   admin could mark it Delivered with a URL, and the fan had NO surface
   anywhere to retrieve it — get-message-requests.js had zero callers and
   profile.html had no My Messages tab, while mensahe.html's FAQ promised
   both (AUDIT.md §1.1, §1.2).

   This is the endpoint that page now calls.
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireUser, esc, fetchAll, safeRead, isSafeUrl } = require('./lib/common');

const TABLE = 'MessageRequests';

const STATUS_COPY = {
    Pending:   { label: 'Waiting to be accepted', tone: 'neutral' },
    Accepted:  { label: 'Accepted — in the queue', tone: 'progress' },
    Recording: { label: 'Yeng is recording this', tone: 'progress' },
    Delivered: { label: 'Ready to watch', tone: 'done' },
    Cancelled: { label: 'Cancelled', tone: 'cancelled' },
};

exports.handler = async (event) => {
    const pre = preflight(event, ['GET']);
    if (pre) return pre;

    const auth = await requireUser(event);
    if (!auth.ok) return auth.response;
    const { decoded } = auth;

    const base = getBase();

    try {
        const rows = await safeRead(
            () => fetchAll(base, TABLE, {
                filterByFormula: `{UserId} = '${esc(decoded.userId)}'`,
                sort: [{ field: 'RequestedAt', direction: 'desc' }],
            }, 50),
            []
        );

        const messages = rows.map((r) => {
            const f = r.fields;
            const status = f.Status || 'Pending';
            const url = f.DeliveryURL;
            return {
                id: r.id,
                type: f.Type || 'Video',
                occasion: f.Occasion || '',
                recipientName: f.RecipientName || '',
                instructions: f.PersonalInstructions || '',
                price: Number(f.Price) || 0,
                discountApplied: f.DiscountApplied || '',
                status,
                statusLabel: (STATUS_COPY[status] || {}).label || status,
                tone: (STATUS_COPY[status] || {}).tone || 'neutral',
                requestedAt: f.RequestedAt || null,
                deliveredAt: f.DeliveredAt || null,
                // Only ever hand back an http(s) URL.
                deliveryUrl: status === 'Delivered' && isSafeUrl(url) ? url : null,
            };
        });

        return json(200, {
            messages,
            count: messages.length,
            ready: messages.filter((m) => m.status === 'Delivered').length,
        });
    } catch (err) {
        console.error('get-my-messages error:', err);
        return json(500, { error: 'Could not load your messages right now.' });
    }
};
