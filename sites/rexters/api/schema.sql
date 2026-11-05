-- Rexter's Self Storage — D1 schema for rent + pay (Stripe path, spillway for a platform later).
-- Provider-agnostic: payments/reservations are keyed by `provider`, so ESS/StorEdge/QuikStor
-- can be added without changing the site.

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY,
  size TEXT NOT NULL,                 -- '10x10'
  label TEXT,                         -- '10×10'
  monthly_rate_cents INTEGER NOT NULL,
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  unit_type TEXT DEFAULT 'standard',  -- standard | climate | driveup | rv
  available INTEGER NOT NULL DEFAULT 1,
  sort INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER REFERENCES units(id),
  tenant_name TEXT NOT NULL,
  tenant_email TEXT,
  tenant_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paying | active | cancelled
  access_code TEXT,
  provider TEXT NOT NULL DEFAULT 'stripe', -- stripe | ess | storedge | quikstor
  provider_external_id TEXT,         -- stripe session/sub id, platform reservation id
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  reservation_id INTEGER REFERENCES reservations(id),
  amount_cents INTEGER NOT NULL,
  kind TEXT NOT NULL,                -- deposit | rent | late | platform
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_ref TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);