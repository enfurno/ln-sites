-- Rexter's Self Storage PLATFORM — multi-facility D1 schema, reused for every customer site.
-- One codebase backs many facilities; every row is keyed by facility_slug. Payments/access are
-- provider-agnostic too, so a gate controller or a management platform can plug in later
-- without changing the site or the database.

CREATE TABLE IF NOT EXISTS facilities (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,          -- 'rexters' — the route/host key
  name TEXT NOT NULL,
  domain TEXT,                        -- e.g. rextersselfstorage.com (pending)
  email TEXT, phone TEXT,
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_state TEXT DEFAULT 'pending',-- pending | configured
  gate_state TEXT DEFAULT 'unknown',  -- pending | api | closed | integrated
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY,
  facility_slug TEXT NOT NULL REFERENCES facilities(slug),
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
  facility_slug TEXT NOT NULL REFERENCES facilities(slug),
  unit_id INTEGER REFERENCES units(id),
  tenant_name TEXT NOT NULL,
  tenant_email TEXT,
  tenant_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paying | active | cancelled
  access_code TEXT,
  provider TEXT NOT NULL DEFAULT 'stripe', -- stripe | ess | storedge | quikstor | gate
  provider_external_id TEXT,         -- stripe session/sub id, gate code, platform reservation id
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  facility_slug TEXT NOT NULL REFERENCES facilities(slug),
  reservation_id INTEGER REFERENCES reservations(id),
  amount_cents INTEGER NOT NULL,
  kind TEXT NOT NULL,                -- deposit | rent | late | platform
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_ref TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);