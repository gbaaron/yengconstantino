/* ═══════════════════════════════════════════════════════
   STRIPE WEBHOOK — the only thing that may mark something paid
   ═══════════════════════════════════════════════════════

   The audit found membership and ticket grants triggered by an UNVERIFIED
   free-text "payment reference" typed by the fan — any string unlocked a
   ₱799 tier (AUDIT.md §3.5 #2). A signed webhook is the fix: nothing in this
   codebase marks a record paid except this file, and it only does so after
   Stripe's signature verifies.

   Handles:
     checkout.session.completed  → cameo request becomes Pending (her queue)
                                 → membership becomes Active
     charge.refunded             → reverse the grant
     payment_intent.failed       → release the record

   Required env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
   ═══════════════════════════════════════════════════════ */

const { getBase, nowISO } = require('./lib/common');
const points = require('./lib/points');

function reply(statusCode, body) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });

    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
        return reply(503, { error: 'Stripe is not configured' });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

    let stripeEvent;
    try {
        // Netlify may base64 the body; Stripe needs the exact raw bytes.
        const raw = event.isBase64Encoded
            ? Buffer.from(event.body, 'base64')
            : Buffer.from(event.body, 'utf8');
        stripeEvent = stripe.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('[stripe-webhook] signature verification failed:', err.message);
        return reply(400, { error: 'Invalid signature' });
    }

    const base = getBase();

    try {
        switch (stripeEvent.type) {
            case 'checkout.session.completed': {
                const session = stripeEvent.data.object;
                const meta = session.metadata || {};

                /* ── Cameo request ── */
                if (meta.requestId) {
                    await base('MessageRequests').update(meta.requestId, {
                        Status: 'Pending',            // now enters her queue
                        PaidAt: nowISO(),
                        PaymentReference: session.payment_intent || session.id,
                        AmountPaid: (session.amount_total || 0) / 100,
                    });
                    console.log('[stripe-webhook] cameo request paid:', meta.requestId);
                }

                /* ── Membership ── */
                if (meta.membershipId) {
                    await base('Memberships').update(meta.membershipId, {
                        Status: 'Active',
                        PaidAt: nowISO(),
                        PaymentReference: session.payment_intent || session.id,
                    });
                    if (meta.userId && meta.tier) {
                        const expiry = new Date();
                        // Monthly product → monthly expiry. The old code
                        // granted a full YEAR for one month's payment.
                        expiry.setMonth(expiry.getMonth() + 1);
                        await base('Users').update(meta.userId, {
                            MembershipTier: meta.tier,
                            MembershipExpiry: expiry.toISOString().split('T')[0],
                        });

                        // Premium buys points — same currency, second entrance.
                        const monthly = points.TIER_MONTHLY_POINTS[meta.tier] || 0;
                        if (monthly > 0) {
                            await points.earn(base, {
                                userId: meta.userId,
                                type: 'membership_grant',
                                amountOverride: monthly,
                                reason: `${meta.tier} monthly Yeng Points`,
                                refTable: 'Memberships',
                                refId: meta.membershipId,
                            });
                        }
                    }
                }
                break;
            }

            case 'charge.refunded': {
                const charge = stripeEvent.data.object;
                const pi = charge.payment_intent;
                if (pi) {
                    const rows = await base('MessageRequests')
                        .select({ filterByFormula: `{PaymentReference} = '${String(pi).replace(/'/g, "\\'")}'`, maxRecords: 1 })
                        .firstPage();
                    if (rows.length) {
                        await base('MessageRequests').update(rows[0].id, {
                            Status: 'Cancelled',
                            RefundedAt: nowISO(),
                        });
                    }
                }
                break;
            }

            case 'payment_intent.payment_failed': {
                const pi = stripeEvent.data.object;
                const requestId = (pi.metadata || {}).requestId;
                if (requestId) {
                    await base('MessageRequests').update(requestId, { Status: 'PaymentFailed' });
                }
                break;
            }

            default:
                // Unhandled types are fine — acknowledge so Stripe stops retrying.
                break;
        }

        return reply(200, { received: true, type: stripeEvent.type });
    } catch (err) {
        console.error('[stripe-webhook] handler error:', err);
        // 500 makes Stripe retry, which is what we want for a transient failure.
        return reply(500, { error: 'Webhook processing failed' });
    }
};
