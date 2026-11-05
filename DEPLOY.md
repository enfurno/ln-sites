# Deploys

Work on a branch and open a pull request. The PR workflow runs pre-checks only: config paths, `run_worker_first`, the binding list, and the generated upload script. It does not deploy, and it does not receive the Cloudflare token.

Merging to `main` deploys. The push workflow looks at which `sites/<name>/` paths changed. For each changed production site it runs the existing pipeline: pre-checks, refuse if a live binding is missing, upload assets, deploy while keeping every binding and `run_worker_first`, read the settings back, `node tools/smoke.mjs`, and roll back to the previous version if that fails.

Production sites: `loadednacho`, `meiji`, `cove`, `canrocks`.

Never deployed from this workflow: `sites/feast`, `sites/toc`, `sites/feast-toc-src`, `shared/ln-portal`, and the rest of `shared/`.

The workflow does not use `wrangler deploy`.

A merge deploys a site only when files under that `sites/<name>/` directory change. Editing `tools/` alone does not redeploy.

## Secrets

Add these repository secrets (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN` — API token with **Workers Scripts: Edit**, scoped to account `1dff9fd00b30d94667191b97494a1fbe`. Use an expiring token.
- `CLOUDFLARE_ACCOUNT_ID` — `1dff9fd00b30d94667191b97494a1fbe`

The token and account id are read from the environment. They are not stored in the repo.

## Branch protection

Turn on branch protection for `main`: require a pull request before merging, and require the `deploy / precheck` check to pass. Direct pushes to `main` would run this workflow with the Cloudflare token, so keep that branch review-only.
