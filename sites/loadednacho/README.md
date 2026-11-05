# loadednacho
- Cloudflare worker: `loadednacho-preview` (account 1dff9fd0…)
- Domains: loadednacho.com
- Source: /workspace/loadednacho/site (incl. support, security, privacy, terms, mother-sauce)
- Deploy today: manual from the box. Static assets in `public/` are uploaded via the Cloudflare API asset-upload session (tools/mkdeploy2.mjs → up2.mjs → s2 script update), worker settings from tools/sites.config.json. No git/CI deploy: pushing to GitHub does NOT update the live site.
- worker.js = live script downloaded from Cloudflare on 2026-11-04. Secrets (BREVO_API_KEY, TURNSTILE_SECRET etc.) are bindings, not in code.
