/* ═══════════════════════════════════════════════════════
   CAMEO — Stripe Connect checkout (she is merchant of record)
   ═══════════════════════════════════════════════════════

   From the brief: "She gets paid direct. Stripe Connect or equivalent, her
   account as merchant of record. The platform takes a cut or flat fee and is
   never the payment processor. Refunds and disputes are hers, not mine."

   Implemented as a DESTINATION CHARGE with `on_behalf_of`:

     on_behalf_of      → her connected account is the merchant of record, so
                         the charge settles under her Stripe account, her
                         descriptor appears on the statement, and disputes and
                         refunds are handled by her.
     transfer_data     → funds route to her account.
     application_fee   → the platform's cut, taken automatically.

   The platform never holds the money. There is no path in this file that
   moves funds into a Globally Ballin balance.

   Pricing is read from SiteConfig so she or the handler can change it from
   the dashboard — the audit found the price hardcoded in four places
   (AUDIT.md §2 feature 4).

   Required env:
     STRIPE_SECRET_KEY          platform key
     STRIPE_CONNECT_ACCOUNT_ID  her connected account (acct_...)
     PLATFORM_FEE_PERCENT       optional, default 15
     SITE_URL                   for success/cancel redirects
   ═══════════════════════════════════════════════════════ */

const {
    preflight, json, getBase, requireUser, esc, fetchAll, safeRead,
    nowISO, TIER_DISCOUNTS,
} = require('./lib/common');

const CONFIG_TABLE = 'SiteConfig';
const TABLE = 'MessageRequests';

const DEFAULT_PRICES = { Video: 1500, Voice: 800, Written: 300 };

/** Prices live in SiteConfig so the dashboard can change them. */
async function loadPricing(base) {
    const rows = await safeRead(
        () => fetchAll(base, CONFIG_TABLE, {
            filterByFormula: `OR({Key} = 'cameo_price_video', {Key} = 'cameo_price_voice', {Key} = 'cameo_price_written')`,
        }, 10),
        []
    );
    const prices = { ...DEFAULT_PRICES };
    for (const r of rows) {
        const v = parseInt(r.fields.Value, 10);
        if (!Number.isFinite(v) || v < 0) continue;
        if (r.fields.Key === 'cameo_price_video') prices.Video = v;
        if (r.fields.Key === 'cameo_price_voice') prices.Voice = v;
        if (r.fields.Key === 'cameo_price_written') prices.Written = v;
    }
    return prices;
}

exports.handler = async (event) => {
    const pre = preflight(event, ['POST', 'GET']);
    if (pre) return pre;

    const base = getBase();

    /* ── GET: current pricing, for the page ── */
    if (event.httpMethod === 'GET') {
        const prices = await loadPricing(base);
        return json(200, {
            prices,
            currency: 'PHP',
            configured: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_CONNECT_ACCOUNT_ID),
            merchantOfRecord: 'artist',
        });
    }

    const auth = await requireUser(event);
    if (!auth.ok) return auth.response;
    const { decoded } = auth;

    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_CONNECT_ACCOUNT_ID) {
        return json(503, {
            error: 'Payments are not connected yet.',
            reason: 'stripe_not_configured',
            needed: ['STRIPE_SECRET_KEY', 'STRIPE_CONNECT_ACCOUNT_ID'],
        });
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return json(400, { error: 'Invalid request' });
    }

    const type = ['Video', 'Voice', 'Written'].includes(body.type) ? body.type : null;
    if (!type) return json(400, { error: 'Pick a message type.' });

    const recipientName = String(body.recipientName || '').trim().slice(0, 120);
    const occasion = String(body.occasion || '').trim().slice(0, 80);
    const instructions = String(body.instructions || '').trim().slice(0, 1500);
    if (!recipientName) return json(400, { error: 'Who is this for?' });

    try {
        const user = await base('Users').find(decoded.userId);
        const userName = user.fields.Name || user.fields.Username || 'Fan';
        const userEmail = user.fields.Email || '';
        const tier = user.fields.MembershipTier || 'Free';

        /* Price is derived SERVER-SIDE. The client never names a price —
           create-order.js let it, and that is how you sell a hoodie for ₱1. */
        const prices = await loadPricing(base);
        const listPrice = prices[type];
        const discountPct = TIER_DISCOUNTS[tier] || 0;
        const finalPrice = Math.round(listPrice * (1 - discountPct / 100));

        const feePercent = Math.min(Math.max(parseFloat(process.env.PLATFORM_FEE_PERCENT || '15'), 0), 50);
        const applicationFee = Math.round(finalPrice * (feePercent / 100) * 100); // centavos

        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

        // Create the request first so the webhook has something to attach to.
        const request = await base(TABLE).create({
            UserId: decoded.userId,
            UserName: userName,
            UserEmail: userEmail,
            Type: type,
            Occasion: occasion,
            RecipientName: recipientName,
            PersonalInstructions: instructions,
            Price: finalPrice,
            DiscountApplied: discountPct ? `${discountPct}%` : 'None',
            Status: 'AwaitingPayment',
            PaymentMethod: 'Stripe',
            RequestedAt: nowISO(),
        });

        const siteUrl = process.env.SITE_URL || 'https://yengconstantino.netlify.app';

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: userEmail || undefined,
            line_items: [{
                price_data: {
                    currency: 'php',
                    unit_amount: finalPrice * 100,
                    product_data: {
                        name: `Personalised ${type.toLowerCase()} message from Yeng`,
                        description: `For ${recipientName}${occasion ? ` — ${occasion}` : ''}`,
                    },
                },
                quantity: 1,
            }],
            payment_intent_data: {
                // Her account is the merchant of record.
                on_behalf_of: process.env.STRIPE_CONNECT_ACCOUNT_ID,
                transfer_data: { destination: process.env.STRIPE_CONNECT_ACCOUNT_ID },
                application_fee_amount: applicationFee,
                description: `Mensahe ni Yeng — ${type} for ${recipientName}`,
            },
            metadata: {
                requestId: request.id,
                userId: decoded.userId,
                type,
            },
            success_url: `${siteUrl}/profile.html#messages?paid=1`,
            cancel_url: `${siteUrl}/mensahe.html?cancelled=1`,
        });

        await base(TABLE).update(request.id, {
            PaymentReference: session.id,
        });

        return json(200, {
            checkoutUrl: session.url,
            requestId: request.id,
            price: finalPrice,
            listPrice,
            discountApplied: discountPct,
            platformFeePercent: feePercent,
            merchantOfRecord: 'Yeng Constantino',
            note: 'Payment goes directly to Yeng\'s Stripe account. The platform takes a service fee and never holds the funds.',
        });
    } catch (err) {
        console.error('create-cameo-checkout error:', err);
        return json(500, { error: 'Could not start checkout right now.' });
    }
};
