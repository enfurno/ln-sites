# LN bridge — hours

`hours.js` is the only hours-rendering implementation in this repo. It is injected into each
converted site worker at deploy between `LN-BRIDGE:START` / `LN-BRIDGE:END` (workers are uploaded
as one module, no bundler).

- `lnBridge(env, slug)` — one `/api/site/<slug>` call through the `PORTAL` binding, 60s memo,
  last-known-good on failure. Falls back to `/api/hours/<slug>` until the v1 payload is live.
- `lnBridgeRender(html, data)` — rewrites `[data-ln-hours]`, `[data-ln-hours-list]` and
  `data-ln-hours-ld` before the HTML is returned.
- `lnBridgeClient()` — the browser refresh, generated from the same formatter; the worker serves it
  at `/ln-hours.js`.

Commands:

```
node tools/bridge.mjs --check   # fail when a site block differs from hours.js (runs in CI)
node tools/bridge.mjs --sync    # write hours.js into every marked worker
node tools/test-bridge.mjs cove # JS-off check against a deployed site and its payload
```

A site is converted only if Mother Sauce carries its business facts. Do not add hours, address,
phone or prices to markup; they come from the payload.

## Exceptions — do not convert these

The complete list is `_exceptions` in `tools/sites.config.json`.

- **Uptown Jerky** — client-managed Wix site. Not in this repo or the deploy pipeline. Hours and
  business facts are the client's to edit in Wix; we do not carry them.
- **Rexter's Self Storage** — our storage platform under `sites/rexters`, built from
  `facilities/rexters.json`, preview only (domain pending). Not in `sites.config.json`, no hours
  markers, not deployed by this pipeline.
- **feast**, **toc** — drafts built from `sites/feast-toc-src` and uploaded by hand, outside this
  pipeline.
- **storage-api** — internal storage admin API, uploaded by hand; not a client site.

Before scaffolding a new client with `tools/new-site.mjs`, confirm it is ours to host. A
client-managed site (Wix, Squarespace, their own stack) is an exception, not a migration.
