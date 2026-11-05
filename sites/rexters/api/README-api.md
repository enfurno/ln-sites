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

## Can we build our own backend to manage gate access + the rest?
Yes, and here's the honest split of what that means:

**Fully buildable by us (the "management software"):**
- Tenant accounts, unit inventory, rental/lease records, deposits & first month → **Stripe**.
- **Recurring monthly billing, payment reminders, late notices**, and a customer "pay my bill / manage" page.
- **Access-code policy**: auto-issue a gate PIN when a lease starts, expire it when it ends or rent lapses.
- Emailed receipts and renewals. Everything stays in our D1 DB + Stripe.

**The one thing you can't do in pure software — the physical gate:**
- Somewhere at the facility there is a **gate controller / keypad / electric gate opener**. "Managing gate access" ultimately means telling *that box* to accept/revoke a code.
- **If that controller has a cloud or local API** (many modern "WiFi/cellular gate control" boxes do), we can talk to it directly over HTTP and issue/revoke codes — no vendor middle-man needed. That's the `api/gate.js` adapter.
- **If it's a closed controller** (only pairs with ESS/StorEdge/SiteLink's software), then to automate gate codes you either replace the controller or use the vendor's access features.

**Bottom line:** you can build ~90% of what ESS/StorEdge do (the software: rentals, billing, payments, codes, portal) with Stripe + D1 + a gate adapter. What you keep that's physical is the gate hardware itself — and you'll want an installer/quote for that. Tell us **which gate/access controller is at the facility** and we'll say with certainty whether it has an open API (most do these days).

## Files
- `api/schema.sql` — D1 tables (units, reservations, payments), provider-agnostic.
- `api/reserve.js` — `startRental` entry point (Stripe now, swappable for a platform).
- `api/gate.js` — gate/access adapter seam (`setGateCode` / `revokeGateCode`), ready for a physical controller's API.