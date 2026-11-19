# New client template

Scaffold a client site with:

```
node tools/new-site.mjs <slug>
```

It copies this folder to `sites/<slug>/`, wires the slug and base URL in `worker.js`, adds the
entry to `tools/sites.config.json`, and refuses to overwrite an existing site. Then do the design
pass. **No business facts are typed into markup**: hours, address, phone, menu, prices, modules and
social links come from Mother Sauce over the bridge.

The worker already has the LN bridge block injected and serves `/api/site` and `/ln-hours.js`. Keep
the three hours markers:

- `[data-ln-hours]` — a text block (footer or drawer)
- `[data-ln-hours-list]` — a `<dl>` of day groups
- `script[data-ln-hours-ld]` — Restaurant JSON-LD

## Do not scaffold a client-managed site

Check `_exceptions` in `tools/sites.config.json` first. **Uptown Jerky** is a client-managed Wix
site: the client edits its hours and business facts in Wix, and we do not carry them. It is an
exception, not a migration. Rexter's Self Storage is our platform but outside this pipeline.
