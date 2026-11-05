# toc (draft)
- Worker: `toc-preview` → https://toc-preview.loadednacho.workers.dev
- worker.js is a self-contained bundle (HTML + inlined images) built by `sites/feast-toc-src/build.mjs` from `worker.tpl.js` (rebuilt 2026-11-04 from current source). No public/ dir.
- Hero videos are hosted on the ln-media worker (https://ln-media.loadednacho.workers.dev/toc/v2/…), not in this repo.
- Deploy today: `node build.mjs` then upload dist/deploy-toc-preview.js through the Cloudflare API from the box. No git/CI.
