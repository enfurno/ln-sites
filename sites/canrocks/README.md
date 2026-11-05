# canrocks
- Cloudflare worker: `canrocks-loadednacho` (account 1dff9fd0…)
- Domains: canrocks.loadednacho.com
- Source: /workspace/cf/drafts-next/canrocks; worker includes LN module gate v1 + security headers (do not replace with a bare passthrough)
- Deploy today: manual from the box. Static assets in `public/` are uploaded via the Cloudflare API asset-upload session (tools/mkdeploy2.mjs → up2.mjs → s2 script update), worker settings from tools/sites.config.json. No git/CI deploy: pushing to GitHub does NOT update the live site.
- worker.js = live script downloaded from Cloudflare on 2026-11-04. Secrets (BREVO_API_KEY, TURNSTILE_SECRET etc.) are bindings, not in code.
