# Rexter's Self Storage — built as a reusable platform

Goal: one clean site for Rexter's now, architected so the **same codebase + backend** can be
white-labeled for more storage facilities later (you said you want to market to other customers).

## Model (mirrors the Feast/ToC generator you already use)
- **One site template → many facilities.** Each facility = a config file (see
  `facilities/rexters.json`) with name, contact, theme colors, units/pricing, and which modules are
  on. A build step renders the branded site from that config.
- **One shared multi-facility backend.** All facilities use the same D1 + API; every row is keyed
  by `facility_slug` (`api/schema.sql`). No changing the database when you add a customer.
- **Provider-agnostic payments + gate.** `api/reserve.js` (Stripe now) and `api/gate.js` (gate
  adapter, pending hardware) both key off the facility, and all swap points are in one place.

## Where things stand
- Customer #1 (Rexter's): site **live at** https://rexters-preview.loadednacho.workers.dev
  (domain pending). Logo correct, theming done. Source merged to `main`.
- Backend scaffolded (D1 schema, Stripe checkout, gate adapter seam). Online payments + gate codes
  are **off** until live inputs arrive; the site degrades to lead-capture automatically.

## To flip a customer "live"
1. Add `facilities/<slug>.json` config + `public/assets/<slug>-logo.png` (their logo).
2. Seed their `units` (+ real prices) in D1.
3. They set up a Stripe account → store their secret as a Cloudflare secret; set `online_rental`/`pay_online` to `stripe`.
4. Point their domain at Cloudflare; build + deploy their worker; wire the domain route.
5. When you know their **gate/keypad model**, implement `api/gate.js` adapter (most modern WiFi gate controllers expose an API) and set `gate` → `api` or `integrated`.

## Open inputs we're waiting on (not blockers for building ahead)
- Rexter's final **domain** (register + point to Cloudflare, ~5-min wiring after).
- **Gate/access controller** model at the facility (to confirm API + build live `setGateCode`).
- Real **unit sizes + monthly prices** (replace sample data).
- Rexter's **Stripe account** (to flip online payments on).
- Facility **photos** (hero + unit imagery).

## Buy vs build (your call)
Building it ourselves (Stripe + D1 + gate adapter) avoids a monthly license and keeps it fully
custom + reusable as a product. Packaged tools (ESS/StorEdge/SiteLink) are the alternative when you
want them to own billing/collections/tax and hardware integrations — or as a fallback if a gate
controller turns out closed. The src is designed so that switch stays a drop-in, not a rebuild.