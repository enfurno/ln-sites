# Site deploys: one config, pre-check, smoke test, rollback

Why: on Oct 25, 2026, a scrollspy deploy for Meiji and Canrock's used hand-copied scripts (`dep/s2S-*`) that left out `run_worker_first: true`. For about 4 minutes, pages for turned-off modules loaded. That can't happen this way now.

## The one config: `sites.config.json`
Each site (meiji, canrocks, cove, loadednacho) has these settings:
- `worker`, `dir`, `base`, `biz`
- `assets`: html_handling, not_found_handling, **run_worker_first: true**
- `bindings`: what the live worker must have (ASSETS, DB, PORTAL, secrets, and so on)
- `crons`
- `noindex`
- `pages_200`
- `module_pages`: maps a path to its Mainframe module

`deploylib.mjs` is the only code that reads it. No script copies settings from an older script any more. The old `mkdeploy2` did that with a regex, which is how the setting got lost.

## Deploy steps

Run these from the repo root. `dir` and `worker_src` in `sites.config.json` are paths like `sites/meiji/public` and `sites/meiji/worker.js`. The API token is `CLOUDFLARE_API_TOKEN`. The account id is `CLOUDFLARE_ACCOUNT_ID`. Neither is written into the scripts.

GitHub Actions runs the same steps on a merge to `main`. See `DEPLOY.md`.

1. `node tools/mkdeploy2.mjs <dir> <site-or-worker> [worker-src.js]`
   - **Pre-check:** it refuses to build (exit 2) if the config lacks `run_worker_first: true` or the ASSETS or PORTAL binding.
   - It writes `dep/s1-<worker>.js`, `dep/s2tpl-<worker>.js` and `dep/rollback-<worker>.js`.
   - Pass `worker-src.js` to ship new worker code. Without it, the live code is kept.
2. `node tools/deploylib.mjs deploy <site>` runs the rest: the asset session, `up2.mjs`, the worker upload, the read-back, smoke, and rollback. `up2.mjs` reads the account id from `CLOUDFLARE_ACCOUNT_ID` (not from an argument). The asset upload itself uses the session jwt.
3. Inside the upload script:
   - It refuses before uploading if the asset config lacks run_worker_first or the **live** worker lacks a required binding.
   - It uploads, sets crons, and then reads the bindings and crons back.
   - **If one is missing, it rolls back to the previous version by itself** and returns `rolledBack`.
4. Run **`node tools/smoke.mjs <site>` right away**. It checks:
   - the `pages_200` pages return 200;
   - `/_headers` returns 404;
   - every module that is OFF in Mainframe (`/api/modules/<biz>`) returns 404, with and without `.html`;
   - the noindex header on Cove.

   If it fails (exit 2), pass `--rollback` (`node tools/smoke.mjs <site> --rollback`) or run `node tools/deploylib.mjs rollback <site>`. That puts the previous version back live. The deploy command does this by itself when smoke fails.

## Dry run (no deploy)
`node tools/deploylib.mjs dry-run` builds the `dep/` scripts and does not call the API.

`node tools/deploy-check.mjs` checks:
- the config, including the binding list;
- that every s2tpl was generated from the config and has run_worker_first;
- live bindings and crons, only when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set (GET only), or when you pass a saved snapshot file.

`node tools/smoke.mjs all` checks the live sites. It does not roll back unless you pass `--rollback`.

## Retired
The hand-made one-off scripts are in `dep/retired/` and `retired-scripts/`. Don't run them. The `dep/s2S-meiji` and `dep/s2S-canrocks` scripts are the ones that lacked run_worker_first. The templates from before this change are in `dep/pre-config-backup/`.


## Versioning (from v1.77.2, Oct 27 2026)
MS versions use the **1.x scheme**: build with `APP_VERSION=v1.<n>.<p> node build.mjs` (e.g. `APP_VERSION=v1.77.2`). The drawer badge shows `v1.77.2`; public `GET /api/version` returns `{"version":"1.77.2"}` (leading v stripped). Releases count up from 1.77.2: next v1.77.3, v1.78.0, ... Never build a deploy with the default `dev`. tests-version.mjs enforces the 1.x format.
