# Rexter's Self Storage — rent + pay backend

This scaffolds the online rental/payment path on **Path A (Stripe, built by us)**, with a
deliberate seam so a storage-management platform **(Path B: ESS / StorEdge / QuikStor)** can be
dropped in later without rebuilding the site.

## How the flow will work
1. Guest picks a unit on the site → **Rent now**.
2. Our Worker calls `startRental` (`api/reserve.js`) → creates a Stripe Checkout Session
   (first month + deposit).
3. Guest pays by card/ACH on Stripe's hosted checkout.
4. Stripe webhook confirms payment → we mark the reservation `active`, log the payment, and email
   the tenant their confirmation + (later) access code.
5. Monthly billing: Stripe Billing / Payment Link sends recurring invoices + reminders.

## What we still need to flip it on live
- A **Stripe account for Rexter's Self Storage** (free to create; only used when we go live).
- Stripe **secret key** stored as a Cloudflare secret (we never hard-code it).
- A **D1 database** on the account with `api/schema.sql` applied, and the `STRIPE_SECRET`,
  `D1` and `URL` bindings on the Worker.
- Real **unit sizes + prices** to seed `units` (they'll replace the sample pricing).

The reserve/contact forms on the preview currently behave as **lead capture** (no keys yet) — the
page falls back to "we'll call you" automatically, so the preview stays honest until Stripe is wired.

## Switching to a platform later (the seam)
All the site reads/writes go through **one** function (`startRental`) and a provider-agnostic
schema (`provider` column). To use a platform:
- Their hosted **"Rent Online"/"Pay Online"** widget can be embedded from the site (`iframe`/link)
  with almost no code — the lowest-effort option.
- Or, where an API/SDK exists, swap `startRental`'s body to call their checkout/API and record the
  returned `provider_external_id`. The page and DB stay the same.

We won't lock the site to Stripe, so this is a drop-in, not a rebuild.

## What packaged platforms cost (rough, confirm with the vendor today)
Prices change and depend on features/gate hardware; treat these as ballparks.
- **Easy Storage Solutions (ESS)** — the value pick; roughly **~$25–$50/mo** SaaS. Includes web
  rental, e-sign, card/ACH, tenant portal, and gate access via their (separately sold) gate gear.
- **StorEdge** — a fuller management system (part of the EZ Storage family); often a **monthly
  license in the low-to-mid hundreds**, better for larger/multi-site operators.
- **QuikStor** — one-time license (~$1–2k) plus support; no recurring SaaS, less modern web/leasing.
- All add **card/ACH processing fees** (about 2.9% + 30¢ per card swipe through their gateway) and
  you'd buy **gate/access hardware** separately if you want automated entry.
- **Our Stripe path:** the only ongoing cost is **Stripe's transaction fees** (no monthly software
  fee); our cost is the one-time build effort.

## Files
- `api/schema.sql` — D1 tables (units, reservations, payments), provider-agnostic.
- `api/reserve.js` — `startRental` entry point (Stripe now, swappable for a platform).