# ln-sites — Loaded Nacho websites
| Site | Folder | Worker | Live URL |
|---|---|---|---|
| Loaded Nacho marketing (support/security/privacy/terms) | sites/loadednacho | loadednacho-preview | https://loadednacho.com |
| Meiji | sites/meiji | meiji-loadednacho | https://meijiok.com, meiji.loadednacho.com |
| Catfish Cove | sites/cove | catfishcove-preview | https://catfishcove.co |
| CanRocks | sites/canrocks | canrocks-loadednacho | https://canrocks.loadednacho.com |
| Feast Buffet (draft) | sites/feast | feast-preview | feast-preview.loadednacho.workers.dev |
| Taste of China (draft) | sites/toc | toc-preview | toc-preview.loadednacho.workers.dev |
| Feast/ToC generator | sites/feast-toc-src | — | — |
| Rexter's Self Storage (outside pipeline) | sites/rexters | — | rexters-preview.loadednacho.workers.dev |
| Shared workers | shared/ (ln-portal, ln-media, short-redirect) | | |
| Deploy tooling | tools/ | | |

All sites are Cloudflare Workers with static assets. Production deploys for Loaded Nacho, Meiji, Catfish Cove, and CanRocks run from GitHub Actions after a merge to `main`. See [DEPLOY.md](DEPLOY.md). That pipeline calls the Cloudflare API directly and does not use `wrangler deploy`. `sites/feast`, `sites/toc`, `sites/feast-toc-src`, and `shared/` are not deployed from git.

## Outside the deploy pipeline

**Uptown Jerky is a client-managed Wix site.** It is not in this repo or the deploy pipeline. The client edits its hours and business facts in Wix; we do not carry them, and it must not be converted to the bridge. Rexter's Self Storage (`sites/rexters`) is our own storage platform, preview only and built from `facilities/rexters.json`, also outside this pipeline. The complete exception list lives in `_exceptions` in `tools/sites.config.json`.
