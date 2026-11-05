# v5 rebuild — Feast / Taste of China previews (2026-10-28)

## Backups
- `worker.tpl.v4.js`, `build.v4.mjs` — state before this rebuild.
- `worker.tpl.v5.js`, `build.v5.mjs` — snapshot of what shipped.

## Deployed
- feast-preview -> https://feast-preview.loadednacho.workers.dev (ok:true)
- toc-preview   -> https://toc-preview.loadednacho.workers.dev (ok:true)
- New worker: ln-media (asset host), serves /feast/{hero.webm,hero.mp4,hero-720.mp4,hero-poster.webp} and the same under /toc/.
  Encodes on the host are the parent's canonical renders: 4.433s, 1920x1080 (720p variant 1280x720), no audio.

## Bundle size
- feast-preview.js 0.58 MB, toc-preview.js 0.53 MB (limit 2.5 MB). Images inlined base64; video NOT inlined.

## Verified (Firefox, live previews)
- 1440 / 1024 / 768 / 390 x {Feast OKC, Feast MWC, TOC}: no horizontal scroll, no text overlap, 0 rounded corners, 0 console errors.
- Hero video plays at every width: webm 1920 at >=1024, hero-720.mp4 at <=900 (chosen in JS because the `media` attribute is unreliable on <source>).
- Reduced motion: video paused, poster still shown, all reveals visible, ticker animation off.
- Drawer: full height, focus moves inside, Esc closes, focus returns to the trigger, aria-expanded true/false.
- Location switcher: opens, Esc closes, navigates to ?loc=midwest-city, marks current, updates hero label and loc card.
- Heading order is monotonic (no h3 before h2). Every img has alt. Navs labelled.
- Contrast measured on body copy: .stn p 17.24:1, .lead 16.25:1, .mod .mc-off 16.25:1, .visit .addr 16.25:1.

## Module states (real MS: all OFF)
Ordering, reservations, catering, club, careers and delivery all render designed editorial OFF copy + a status label.
Nothing greyed out, no dead buttons, no holes. Order CTA in the header is absent (correct: ordering.on false).

Tested ON paths with `DEMO=on node local.mjs` (harness in local.mjs, not deployed):
- ordering -> per-location URL wins (okc -> /order-okc), MWC falls back to the top-level /order.
- reservations / catering / club -> on with correct hrefs.
- delivery -> only the apps present per location (okc: DoorDash+Grubhub, MWC: Uber Eats).
- careers -> jobs array empty in MS, stays OFF with "No roles posted".
Fixed during this pass: module `on` was computed before `url` in the same object literal, so every module read as off.

## Screenshots
/workspace/feast-toc/shots/v5/*.png (full page, PNG), plus feast_drawer_390.png and toc_drawer_390.png.
