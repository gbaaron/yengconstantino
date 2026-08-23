/* ═══════════════════════════════════════════════════════
   MEDIA UPLOAD — signed Cloudinary credentials
   ═══════════════════════════════════════════════════════

   The audit's #1 cross-cutting blocker: "No file/media upload infrastructure
   of any kind" — every media field in the codebase was a URL pasted by hand,
   which is why voice memos, archive audio and video delivery were all stuck.

   This unblocks all three without putting a secret in the browser: the client
   asks for a signature, uploads DIRECTLY to Cloudinary, and hands us back the
   resulting URL. Large files never pass through a Netlify function, so the
   10-second / 6MB function limits don't apply.

   Only admins may request a signature. Fans do not upload media anywhere in
   this product — that was a deliberate scope decision (fan cover uploads are
   dormant, see AUDIT.md §3.3), and it keeps the moderation surface small.

   Required env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
   ═══════════════════════════════════════════════════════ */

const crypto = require('crypto');
const { preflight, json, getBase, requireAdmin } = require('./lib/common');

const FOLDERS = {
    answer:  'yeng/answers',    // Ask Yeng voice memos
    archive: 'yeng/archive',    // approved archive audio
    cameo:   'yeng/cameo',      // personalised video deliveries
};

exports.handler = async (event) => {
    const pre = preflight(event, ['POST']);
    if (pre) return pre;

    const base = getBase();
    const gate = await requireAdmin(event, base);
    if (!gate.ok) return gate.response;

    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const key = process.env.CLOUDINARY_API_KEY;
    const secret = process.env.CLOUDINARY_API_SECRET;

    if (!cloud || !key || !secret) {
        return json(503, {
            error: 'Media uploads are not configured yet.',
            reason: 'cloudinary_not_configured',
            needed: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
        });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return json(400, { error: 'Invalid request' });
    }

    const kind = FOLDERS[body.kind] ? body.kind : 'answer';
    const folder = FOLDERS[kind];
    const timestamp = Math.floor(Date.now() / 1000);

    // Cloudinary signs the alphabetically-sorted parameter string.
    const params = { folder, timestamp };
    const toSign = Object.keys(params).sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&');
    const signature = crypto.createHash('sha256').update(toSign + secret).digest('hex');

    return json(200, {
        cloudName: cloud,
        apiKey: key,
        timestamp,
        folder,
        signature,
        // 'video' is Cloudinary's resource type for audio as well as video.
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloud}/video/upload`,
        signatureAlgorithm: 'sha256',
    });
};
