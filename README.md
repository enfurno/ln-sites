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
| Shared workers | shared/ (ln-portal, ln-media, short-redirect) | | |
| Deploy tooling | tools/ | | |

All sites are Cloudflare Workers with static assets, deployed manually from Frankie's box via the Cloudflare API. Nothing deploys from git today; a GitHub Actions + wrangler deploy would be needed for push-to-deploy.
