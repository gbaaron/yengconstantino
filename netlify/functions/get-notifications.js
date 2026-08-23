/* ═══════════════════════════════════════════════════════
   NOTIFICATIONS — pull model
   ═══════════════════════════════════════════════════════
   There is no remote push in this stack (see AUDIT.md §2 blockers:
   native-bridge.js is local-notification only). So "Yeng answered the
   question you were part of" is delivered by polling this endpoint on
   page load, and the native shell mirrors it into a LOCAL notification.

   GET  → unread + recent
   POST → { markRead: true } or { markRead: [ids] }
   ═══════════════════════════════════════════════════════ */

const { preflight, json, getBase, requireUser, esc, fetchAll, safeRead, nowISO } = require('./lib/common');

const TABLE = 'Notifications';

exports.handler = async (event) => {
    const pre = preflight(event, ['GET', 'POST']);
    if (pre) return pre;

    const auth = await requireUser(event);
    if (!auth.ok) return auth.response;
    const { decoded } = auth;

    const base = getBase();

    try {
        if (event.httpMethod === 'POST') {
            let body;
            try {
                body = JSON.parse(event.body || '{}');
            } catch {
                return json(400, { error: 'Invalid request' });
            }

            const rows = await safeRead(
                () => fetchAll(base, TABLE, {
                    filterByFormula: `AND({UserId} = '${esc(decoded.userId)}', {Read} = FALSE())`,
                }, 200),
                []
            );

            const target = Array.isArray(body.markRead)
                ? rows.filter((r) => body.markRead.includes(r.id))
                : rows;

            for (const r of target) {
                try {
                    await base(TABLE).update(r.id, { Read: true, ReadAt: nowISO() });
                } catch { /* best effort */ }
            }

            return json(200, { marked: target.length });
        }

        const rows = await safeRead(
            () => fetchAll(base, TABLE, {
                filterByFormula: `{UserId} = '${esc(decoded.userId)}'`,
                sort: [{ field: 'CreatedAt', direction: 'desc' }],
            }, 40),
            []
        );

        const notifications = rows.map((r) => ({
            id: r.id,
            kind: r.fields.Kind || 'info',
            title: r.fields.Title || '',
            body: r.fields.Body || '',
            linkUrl: r.fields.LinkUrl || null,
            clusterId: r.fields.ClusterId || null,
            read: !!r.fields.Read,
            createdAt: r.fields.CreatedAt,
        }));

        return json(200, {
            notifications,
            unread: notifications.filter((n) => !n.read).length,
        });
    } catch (err) {
        console.error('get-notifications error:', err);
        return json(500, { error: 'Could not load notifications right now.' });
    }
};
