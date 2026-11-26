Feast Buffet + Taste of China generator. build.mjs reads worker.tpl.js, images/, icons/inline.json and logos/ (all relative to this folder, so a build runs anywhere: `node build.mjs` here) and writes dist/feast-preview.js and dist/toc-preview.js. The footer credit mark is inlined from logos/ln-mark.png, a copy of the shared Loaded Nacho mark.

## Uploading (previews only)

Two preview workers are served from this folder's output: `feast-preview` and
`toc-preview`. They are **not** in `deploy.yml`, so merging here deploys nothing.

- `node build.mjs` writes `dist/<brand>.js` and `dist/<brand>.meta.json` (worker name,
  bindings, compatibility date, byte size). The bundle and its metadata are always
  written together; `upload.mjs` refuses to run without the metadata.
- `node upload.mjs <feast-preview|toc-preview> [--dry-run]` uploads that bundle
  through `tools/deploylib.mjs` (Cloudflare API, never wrangler), with the bindings
  from the metadata and the workers.dev subdomain re-enabled. It prints the worker
  name, the returned script id and the byte size.
- The runner has a hard allowlist of the two preview names. `feast-loadednacho` and
  `tasteofchina-loadednacho` — the production workers — are refused, and no
  environment variable can retarget it (`WORKER_NAME` is ignored by design).
- In GitHub: Actions → **upload-feast-toc** → Run workflow, typing
  `upload-previews` in the confirm box. That workflow builds and uploads both brands.

Rollback: a PUT adds a new version and Cloudflare keeps the previous deployments, so
`GET /accounts/<id>/workers/scripts/<name>/deployments` lists them and
`POST …/deployments` with the previous `versions` puts it back. The simpler undo is a
revert commit plus a re-run of the workflow.
