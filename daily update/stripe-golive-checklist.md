---
author: claude
type: prep
date: 2026-07-02
---

# Stripe Go-Live Checklist — TEAM 3332

Flips payments from test to live. Grounded in the actual code: `backend/routes/stripe.js`
(checkout + webhook, price built via `price_data`), env keys `STRIPE_SECRET_KEY`,
`STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` (optional in code — REQUIRED for live, see #4).

## Gates before flipping (in order)

1. **Lawyer review of ToS + Privacy** — still pending. This was always the agreed gate for live
   keys. The 14-day refund promise in the ToS must match how you'll actually handle Stripe refunds.
2. **App Store purchase-model decision** — if the iOS app ships with no in-app purchase UI
   (recommended path in appstore-submission-packet.md), Stripe stays web-only and Apple has no say.
3. **Business readiness:** Stripe account fully activated (business details, bank account for
   payouts, tax info) in the live dashboard.

## The flip (≈15 min, on Railway)

- [ ] Stripe Dashboard → toggle OFF "Test mode" → Developers → API keys → copy **live** `sk_live_…`
      and `pk_live_…`
- [ ] Railway → backend service → Variables: replace `STRIPE_SECRET_KEY` and
      `STRIPE_PUBLISHABLE_KEY` with the live keys
- [ ] **Webhook (critical):** Stripe Dashboard (live mode) → Developers → Webhooks → Add endpoint
      `https://team3332.com/api/stripe/webhook`, events: `checkout.session.completed` (plus any
      others the route handles) → copy the signing secret → set `STRIPE_WEBHOOK_SECRET` on Railway.
      ⚠️ The code only verifies signatures **if** `STRIPE_WEBHOOK_SECRET` is set — in live mode it
      must be set, or anyone could POST fake "paid" events.
- [ ] Redeploy / confirm the service picked up the new vars

## Verify (same day)

- [ ] Real card, cheapest path: buy a membership yourself → confirm `subscription_status`
      flips to `active` in the DB and `/api/stripe/status` reports paid
- [ ] Refund that charge in the Stripe dashboard → note what the app shows (refund handling on
      the webhook may be a TODO — check if a `charge.refunded` handler exists; if not, that's a
      fast follow, not a blocker)
- [ ] Check the welcome email fired (Resend, noreply@team3332.com)
- [ ] Stripe Dashboard → confirm payout schedule + bank account

## Notes

- Keep the test keys somewhere handy — you'll still want test mode for development.
- Prices are created inline via `price_data` (Standard $199 / Elite $249) — no dashboard Product
  setup needed; they work identically in live mode.
- `.env` on disk holds test keys; Railway variables are what production actually uses.
