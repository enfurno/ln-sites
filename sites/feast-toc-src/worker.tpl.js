// Feast / Taste of China PREVIEW worker. All business data comes live from Mother Sauce (MS) by slug.
// Nothing about hours, addresses, phones, menu, specials or modules is hard-coded.
const CFG = __CFG__;           // brand config: slug, names, copy, themes, logos, media host
const IMG = __IMG__; // name -> base64 webp
const MS = 'https://mothersauce.app';
const TTL = 300, NEG = 60;
const mem = new Map();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function ms(path, ctx) {
  const url = MS + path, now = Date.now(), m = mem.get(url);
  if (m && m.exp > now) return m.v;
  let v = null;
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(2500), cf: { cacheTtl: TTL, cacheEverything: true } });
    if (r.ok && /json/i.test(r.headers.get('content-type') || '')) { const t = await r.text(); if (t.length < 262144) v = JSON.parse(t); }
  } catch (e) { v = null; }
  mem.set(url, { v, exp: now + (v ? TTL : NEG) * 1000 });
  return v;
}

// ---- hours (same grouping rules as the Cove ln-hours.js script) ----
const D = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const S = {Monday:'Mon',Tuesday:'Tue',Wednesday:'Wed',Thursday:'Thu',Friday:'Fri',Saturday:'Sat',Sunday:'Sun'};
const t12 = v => { const [h, m] = String(v).split(':'); const H = +h; return (H % 12 || 12) + (m && m !== '00' ? ':' + m : '') + (H < 12 ? 'am' : 'pm'); };
const hasHours = h => Array.isArray(h) && h.some(x => x && (x.closed || (x.open && x.close)));
function groups(h) {
  const by = {}; h.forEach(x => by[x.day] = x);
  const k = d => { const x = by[d]; return !x ? '?' : x.closed ? 'closed' : (x.open && x.close ? x.open + '-' + x.close : '?'); };
  const o = [];
  for (const d of D) { const v = k(d); if (o.length && o[o.length - 1].v === v) o[o.length - 1].e = d; else o.push({ s: d, e: d, v }); }
  return o.filter(g => g.v !== '?');
}
const hoursRows = h => groups(h).map(g => ({ days: S[g.s] + (g.e !== g.s ? '–' + S[g.e] : ''), time: g.v === 'closed' ? 'Closed' : g.v.split('-').map(t12).join(' – '), closed: g.v === 'closed' }));
const ldHours = h => groups(h).filter(g => g.v !== 'closed').map(g => { const days = D.slice(D.indexOf(g.s), D.indexOf(g.e) + 1); const [o, c] = g.v.split('-'); return { '@type': 'OpeningHoursSpecification', dayOfWeek: days, opens: o, closes: c }; });

// ---- live "open now", computed here from MS hours + the client timezone ----
const DAYN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const toMin = t => { const [a, b] = String(t).split(':'); return (+a) * 60 + (+(b || 0)); };
function openNow(h, tz) {
  if (!hasHours(h)) return null;
  const TZ = tz || 'America/Chicago';
  let now;
  try { now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ })); if (isNaN(now)) now = new Date(); } catch (e) { now = new Date(); }
  const dow = now.getDay(), mins = now.getHours() * 60 + now.getMinutes();
  const by = {}; h.forEach(x => { if (x && x.day) by[x.day] = x; });
  const t = by[DAYN[dow]];
  if (t && !t.closed && t.open && t.close) {
    const o = toMin(t.open), c = toMin(t.close);
    if (c > o ? (mins >= o && mins < c) : (mins >= o)) return { state: 'open', closes: t.close };
  }
  const y = by[DAYN[(dow + 6) % 7]];
  if (y && !y.closed && y.open && y.close) { const o = toMin(y.open), c = toMin(y.close); if (c <= o && mins < c) return { state: 'open', closes: y.close }; }
  for (let i = 0; i < 8; i++) {
    const d = DAYN[(dow + i) % 7], x = by[d];
    if (!x || x.closed || !x.open || !x.close) continue;
    const o = toMin(x.open);
    if (i === 0 && mins >= o) continue;
    return { state: 'closed', opens: x.open, when: i === 0 ? '' : i === 1 ? 'tomorrow' : d };
  }
  return { state: 'closed' };
}
const openText = s => !s ? '' : s.state === 'open'
  ? 'Open now · closes ' + t12(s.closes)
  : 'Closed · opens ' + t12(s.opens) + (s.when ? ' ' + s.when : '');

// ---- modules: flags from public MS /api/public/modules/<slug> (keys: applications, reservations, catering, loyalty, blog). Unreadable = OFF.
// A button renders only when the flag is on AND a URL exists (URLs will come from /api/site/<slug> later).
const MOD_ALIAS = { club: 'loyalty', careers: 'applications', ordering: 'ordering' };
function modState(mods, key) {
  if (!mods || typeof mods !== 'object') return { on: false };
  const m = mods[key] ?? mods[MOD_ALIAS[key]] ?? (mods.modules && mods.modules[key]);
  if (m === true) return { on: true };
  if (m && typeof m === 'object') { const u = m.url || m.link || m.href; let url = null; try { if (u) { const x = new URL(u); if (/^https?:$/.test(x.protocol)) url = x.href; } } catch (e) {} return { on: m.on === true || m.enabled === true, url }; }
  return { on: false };
}
const safeUrl = u => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; } };

function themeCss(th) {
  return `:root{--navy:${th.navy||th.ink};--ink:${th.ink};--gold:${th.gold||th.acc};--bg:${th.bg};--fg:${th.fg};--mut:${th.mut};--brand:${th.brand};--brand-fg:${th.brandFg};--acc:${th.acc};--acc2:${th.acc2};--card:${th.card};--line:${th.line};--hf:${th.hf}}`;
}

// shared bits --------------------------------------------------------------
const chip = s => s ? `<span class="oc ${s.state}" data-open="${s.state}"><i aria-hidden="true"></i>${esc(openText(s))}</span>` : '';
const modRow = (m, cls) => `<li class="${cls}" data-mod="${m.key}" data-state="${m.on ? 'on' : 'off'}">
<span class="mn" aria-hidden="true">${m.n}</span>
<div class="mb"><h3>${esc(m.title)}</h3>${m.on
  ? `<p class="mc-on">${esc(m.onLine)}</p>${m.url ? `<a class="mgo" href="${esc(m.url)}" rel="noopener"${/^https?:/.test(m.url) && m.ext ? ' target="_blank"' : ''}>${esc(m.cta)}</a>` : (m.extra || '')}`
  : `<p class="mc-off">${esc(m.offLine)}</p><span class="msoon">${esc(m.soonLabel)}</span>`}</div></li>`;

function page(url, d) {
  const { contact, hours, menu, social, jobs, mods, site } = d;
  const themeKey = CFG.themes[url.searchParams.get('theme')] ? url.searchParams.get('theme') : CFG.theme;
  const th = CFG.themes[themeKey];
  const locs = (hours && Array.isArray(hours.locations) ? hours.locations : []).filter(l => l && l.slug);
  const cLocs = (contact && Array.isArray(contact.locations) ? contact.locations : []);
  const want = url.searchParams.get('loc');
  const loc = locs.find(l => l.slug === want) || locs.find(l => l.status === 'open') || locs[0] || null;
  const q = (extra) => { const p = new URLSearchParams(); if (themeKey !== CFG.theme) p.set('theme', themeKey); for (const [k, v] of Object.entries(extra)) p.set(k, v); const s = p.toString(); return s ? '/?' + s : '/'; };
  const name = (contact && contact.name) || (hours && hours.client) || CFG.name;
  const locName = loc ? (loc.name || '') : '';
  const addr = loc && loc.address ? loc.address : '';
  const phone = loc && loc.phone ? String(loc.phone) : '';
  const dg = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const gl = social && social.google_loc && loc && social.google_loc[loc.slug];
  const mapUrl = gl || (addr ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name + ' ' + addr) : '');
  const hRows = loc && hasHours(loc.hours) ? hoursRows(loc.hours) : (hasHours(hours && hours.hours) ? hoursRows(hours.hours) : []);
  const specials = [...((loc && loc.specials) || []), ...((hours && hours.specials) || [])].filter(s => s && (s.title || s.name));
  const cats = (menu && Array.isArray(menu.categories) ? menu.categories : []).filter(c => c && Array.isArray(c.items) && c.items.length);
  const live = { hours: hRows.length > 0, location: !!addr, menu: cats.length > 0, specials: specials.length > 0 };
  const M = k => modState(mods, k);
  const jobsOn = jobs && jobs.off !== true && Array.isArray(jobs.jobs) && jobs.jobs.length > 0;

  // ---- ordering + delivery: ONLY from MS /api/site/<slug> (missing/null/404 = off); per-location url overrides top-level ----
  const so = site && site.ordering && typeof site.ordering === 'object' ? site.ordering : null;
  const sl = so && Array.isArray(so.locations) && loc ? so.locations.find(l => l && l.slug === loc.slug) : null;
  const ORD = { on: !!(so && so.on === true), url: safeUrl(sl && sl.url) || safeUrl(so && so.url) };
  const dv = sl && sl.delivery && typeof sl.delivery === 'object' ? sl.delivery : {};
  const tel = dg.length === 10 ? '+1' + dg : '';
  const price = p => (typeof p === 'number' && p > 0) ? ' <span class="pr">$' + p.toFixed(2) + '</span>' : '';
  const open = openNow(loc && loc.hours, (hours && hours.tz) || 'America/Chicago');

  // module slots: each has an ON state and a deliberate OFF state (Eric's rule: no holes either way)
  const MC = CFG.mods;
  const modList = [
    { key: 'ordering', n: '01', title: 'Order online', st: ORD, onLine: MC.ordering.on, offLine: MC.ordering.off, cta: MC.ordering.cta, soon: MC.ordering.soon, ext: true },
    { key: 'reservations', n: '02', title: 'Reservations', st: M('reservations'), onLine: MC.reservations.on, offLine: MC.reservations.off, cta: MC.reservations.cta, soon: MC.reservations.soon, ext: true },
    { key: 'catering', n: '03', title: 'Catering', st: M('catering'), onLine: MC.catering.on, offLine: MC.catering.off, cta: MC.catering.cta, soon: MC.catering.soon, ext: true },
    { key: 'club', n: '04', title: MC.club.title || 'The club', st: M('club'), onLine: MC.club.on, offLine: MC.club.off, cta: MC.club.cta, soon: MC.club.soon, ext: true },
    { key: 'careers', n: '05', title: 'Careers', st: { on: !!jobsOn }, onLine: MC.careers.on, offLine: MC.careers.off, cta: MC.careers.cta, soon: MC.careers.soon, ext: false },
  ].map(m => {
    const url = m.st.url || null;
    const on = m.key === 'careers' ? !!m.st.on : !!(m.st.on && url);
    return { ...m, on, url, soonLabel: m.soon,
      extra: m.key === 'careers' && jobsOn ? `<ul class="jobs">${jobs.jobs.slice(0, 6).map(j => `<li>${esc(j.title || j.name || 'Open role')}</li>`).join('')}</ul>` : '' };
  });

  const delAll = [['doordash', 'DoorDash'], ['ubereats', 'Uber Eats'], ['grubhub', 'Grubhub']].map(([k, n]) => ({ n, u: dv[k] != null ? safeUrl(dv[k]) : null })).filter(x => x.u);
  const specHtml = specials.length ? `<ul class="spec">${specials.map(s => `<li><strong>${esc(s.title || s.name)}</strong>${s.description ? ' ' + esc(s.description) : ''}</li>`).join('')}</ul>` : '';
  const socLinks = social && social.links && typeof social.links === 'object' ? Object.entries(social.links).filter(([k, v]) => /^https:\/\//.test(String(v))).map(([k, v]) => ({ k, n: k[0].toUpperCase() + k.slice(1), u: String(v) })) : [];
  const menuHtml = cats.length
    ? cats.map(c => `<div class="mcat"><h3>${esc(c.name)}</h3><ul>${c.items.map(i => `<li><span class="mi">${esc(i.name)}${price(i.price)}</span>${i.description ? `<span class="md">${esc(i.description)}</span>` : ''}</li>`).join('')}</ul></div>`).join('')
    : '';
  const ld = locs.filter(l => l.address).map(l => ({ '@context': 'https://schema.org', '@type': 'Restaurant', name: name + (locs.length > 1 ? ' ' + l.name : ''), servesCuisine: CFG.cuisine, telephone: l.phone || undefined, address: { '@type': 'PostalAddress', streetAddress: l.address }, url: url.origin + q(locs.length > 1 ? { loc: l.slug } : {}), openingHoursSpecification: hasHours(l.hours) ? ldHours(l.hours) : undefined }));
  const title = esc(name + (locs.length > 1 && locName ? ' · ' + locName : '') + ' | ' + CFG.titleTail);
  const desc = esc(CFG.desc + (addr ? ' ' + addr + '.' : ''));
  const longDay = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
  const MED = CFG.media;

  // every place a module can appear gets a designed on + off state
  const navMods = modList.filter(m => m.on && m.url && m.key !== 'careers');
  const v = { name, locs, cLocs, loc, locName, addr, phone, tel, mapUrl, hRows, specHtml, socLinks, q, longDay, th, modList, delAll, menuHtml, open, jobsOn, cats, MED, navMods };
  const body = CFG.layout === 'toc' ? tocBody(v) : feastBody(v);
  const css = CFG.layout === 'toc' ? TOC_CSS : FEAST_CSS;
  return { live, html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${desc}"><meta name="robots" content="noindex,nofollow">
<link rel="canonical" href="${esc(url.origin + q(locs.length > 1 && loc ? { loc: loc.slug } : {}))}">
<meta property="og:type" content="restaurant"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:image" content="${url.origin}/img/${CFG.img.hero}.webp"><meta name="theme-color" content="${th.bg}">
<link rel="preload" as="image" href="/img/${CFG.img.hero}.webp" type="image/webp">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/icon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/icon-16.png" type="image/png" sizes="16x16">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="apple-mobile-web-app-title" content="${esc(CFG.icon.short)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${CFG.fonts}" rel="stylesheet">
${ld.map(x => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('')}
<style>${themeCss(th)}${css.replace(/__PATTERN__/g, '/img/' + CFG.img.pattern + '.webp')}</style></head><body>
<div class="pv" data-pv>Preview only. Not the live site.</div>
${body}
<script>${PAGE_JS}</script>
</body></html>` };
}

// browser behaviour: sticky header, mobile drawer, hero video fallback, subtle reveals
const PAGE_JS = `(function(){
var root=document.documentElement, RM=false;
try{RM=matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}
/* Hero motion:
   KB=1 (default): Ken Burns effect — a slow left-right pan + slight zoom on the hero still. No video.
   KB=0: the looped video clip, slowed to HB playback rate (0.55 = ~half speed). */
var KB=1;
var HB=0.55;
function onScroll(){var y=window.pageYOffset||root.scrollTop;root.classList[y>40?'add':'remove']('scrolled')}
addEventListener('scroll',onScroll,{passive:true});onScroll();

/* mobile drawer */
var btn=document.querySelector('[data-open-nav]'),dr=document.querySelector('[data-drawer]');
if(btn&&dr){
  var focusables=function(){return Array.prototype.slice.call(dr.querySelectorAll('a[href],button:not([disabled])'))};
  var openDrawer=function(){root.classList.add('nav-open');btn.setAttribute('aria-expanded','true');dr.removeAttribute('inert');
    var f0=focusables();if(f0[0])f0[0].focus();
    setTimeout(function(){if(!dr.contains(document.activeElement)){var f=focusables();if(f[0])f[0].focus()}},60)};
  var closeDrawer=function(returnFocus){root.classList.remove('nav-open');btn.setAttribute('aria-expanded','false');dr.setAttribute('inert','');if(returnFocus)btn.focus()};
  dr.setAttribute('inert','');
  btn.addEventListener('click',function(){root.classList.contains('nav-open')?closeDrawer(true):openDrawer()});
  dr.addEventListener('click',function(e){if(e.target.closest('a'))closeDrawer(false)});
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&root.classList.contains('nav-open')){e.preventDefault();closeDrawer(true);return}
    if(e.key!=='Tab'||!root.classList.contains('nav-open'))return;
    var f=focusables();if(!f.length)return;var i=f.indexOf(document.activeElement);
    if(e.shiftKey&&(i<=0)){e.preventDefault();f[f.length-1].focus()}
    else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus()}
  });
}

/* location switcher dropdown (Feast) */
Array.prototype.forEach.call(document.querySelectorAll('[data-sw]'),function(sw){
  var btn=sw.querySelector('[data-sw-btn]');if(!btn)return;
  var set=function(on){sw.classList.toggle('open',on);btn.setAttribute('aria-expanded',on?'true':'false')};
  btn.addEventListener('click',function(e){e.stopPropagation();set(!sw.classList.contains('open'))});
  sw.addEventListener('keydown',function(e){if(e.key==='Escape'){set(false);btn.focus()}});
  document.addEventListener('click',function(e){if(!sw.contains(e.target))set(false)});
});

/* hero video: poster stays until the video is actually painting; errors fall back to the poster */
Array.prototype.forEach.call(document.querySelectorAll('[data-hero]'),function(h){
  var v=h.querySelector('video');if(!v)return;
  if(KB){
    var poster=h.querySelector('.hposter');
    if(poster&&!RM)poster.classList.add('kb');
    try{v.removeAttribute('autoplay');v.setAttribute('preload','none');v.remove()}catch(e){}
    return;
  }
  try{v.defaultPlaybackRate=HB;v.playbackRate=HB}catch(e){}
  /* small screens take the 720 encode, but only before it has painted */
  try{if(v.dataset.small&&matchMedia('(max-width: 900px)').matches&&v.readyState<2){v.src=v.dataset.small;v.load()}}catch(e){}
  var live=false;
  var mark=function(){if(live)return;live=true;h.classList.add('vid-live');h.classList.remove('vid-fail')};
  v.addEventListener('playing',mark);
  v.addEventListener('timeupdate',function(){if(v.readyState>=2)mark()});
  v.addEventListener('error',function(){h.classList.add('vid-fail')});
  Array.prototype.forEach.call(v.querySelectorAll('source'),function(s){s.addEventListener('error',function(){if(!live)h.classList.add('vid-fail')})});
  if(RM){v.removeAttribute('autoplay');v.setAttribute('preload','none');try{v.pause()}catch(e){};return}
  if(v.readyState>=2&&!v.paused)mark();
  var go=function(){var p=v.play();if(p&&p.catch)p.catch(function(){})};
  v.addEventListener('canplay',go,{once:true});
  if(v.readyState>=3)go();
  setTimeout(function(){if(!live)h.classList.add('vid-fail')},7000);
});

/* scroll reveal, subtle, one-shot */
var targets=document.querySelectorAll('[data-rv]');
if(RM||!('IntersectionObserver' in window)){Array.prototype.forEach.call(targets,function(e){e.classList.add('in')})}
else{var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}})},{rootMargin:'0px 0px -8% 0px',threshold:.05});
Array.prototype.forEach.call(targets,function(e){io.observe(e)})}
})();`;

// ================= FEAST: energetic food hall =================
// ---- Loaded Nacho footer credit (v2 = the catfishcove.co treatment). One shared block for both brands. ----
const LN_CREDIT_CSS = `/* Loaded Nacho footer credit v2 (shared). Per-brand vars live in each theme's override below. */
.ln-credit{--lnc-label:#bfae98;--lnc-loaded:#f6efe3;--lnc-rule:rgba(246,239,227,.12);
  position:relative;z-index:1;box-sizing:border-box;max-width:1180px;margin:1.5rem auto 0;padding:.85rem 1rem 0;
  border-top:1px solid var(--lnc-rule);text-align:center;font-size:14.5px;line-height:1.4;letter-spacing:.01em}
.ln-credit a.ln-credit-a{display:inline-flex;align-items:center;gap:.45em;min-height:24px;padding:4px 6px;border-radius:var(--r-s)!important;
  color:var(--lnc-label);text-decoration:none;font-weight:400;transition:color .25s ease}
.ln-credit .ln-credit-mark{width:22px;height:22px;display:block;opacity:1;transition:opacity .25s ease,filter .25s ease}
.ln-credit .ln-credit-name{font-weight:700;white-space:nowrap}
.ln-credit .ln-l{color:var(--lnc-loaded)}
.ln-credit .ln-n{color:#f7892b;transition:text-shadow .25s ease}
.ln-credit .ln-credit-tag{opacity:.92;font-weight:400}
.ln-credit a.ln-credit-a:hover,.ln-credit a.ln-credit-a:focus-visible{color:var(--lnc-loaded)}
.ln-credit a.ln-credit-a:hover .ln-n,.ln-credit a.ln-credit-a:focus-visible .ln-n{text-shadow:0 0 10px rgba(247,137,43,.55)}
.ln-credit a.ln-credit-a:hover .ln-credit-mark,.ln-credit a.ln-credit-a:focus-visible .ln-credit-mark{opacity:1;filter:drop-shadow(0 0 4px rgba(247,137,43,.6))}
.ln-credit a.ln-credit-a:focus-visible{outline:2px solid #f7892b;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.ln-credit *{transition:none!important}}
/* phones: full "Crafted by [mark] LOADED NACHO - Empowering Digital Success", tightened but never abbreviated */
@media (max-width:640px){.ln-credit{text-align:center;font-size:12.5px}
.ln-credit a.ln-credit-a{display:inline-flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;padding:6px 8px;row-gap:2px}
.ln-credit .ln-credit-mark{width:20px;height:20px;opacity:1}
.ln-credit .ln-credit-name{font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:800}
.ln-credit .ln-credit-tag{opacity:.75;font-size:11.5px}}`;
// The single source of the credit markup. src = the brand's utm_source. Mark is inlined as a data URI at build time.
const LNMARK = CFG.creditMark || '/assets/ln-mark.png';
const lnCredit = src => `<p class="ln-credit"><a class="ln-credit-a" href="https://loadednacho.com/?utm_source=${src}&amp;utm_medium=referral&amp;utm_campaign=footer_credit" target="_blank" rel="noopener" aria-label="Crafted by Loaded Nacho, Empowering Digital Success (opens in a new tab)"><span>Crafted by</span><img class="ln-credit-mark" src="${LNMARK}" alt="" width="22" height="22" decoding="async"><span class="ln-credit-name"><span class="ln-l">Loaded</span> <span class="ln-n">Nacho</span></span><span class="ln-credit-tag">&middot; Empowering Digital Success</span></a></p>`;

const FEAST_CSS = `*,*:before,*:after{box-sizing:border-box;border-radius:0!important}
/* buttons get a small radius; cards and tiles stay square */
:root{--r-s:6px;--r-m:10px;--r-l:12px}
.sq,.ordcta,.seal-btn,.sw>button,.locpick,.burger,.drawer .x,.oc,.dlinks a,.mgo,.drawer .df .sw a,.logo{border-radius:var(--r-s)!important}
.locpick{overflow:hidden}
.loc .cur,.stn .im .tag,.mod .jobs li,.msoon{border-radius:4px!important}
.sw .menu{border-radius:var(--r-m)!important;overflow:hidden}
.sw .menu a{border-radius:6px!important}
.loc{border-radius:var(--r-l)!important}
.locs{overflow:hidden}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
:root{--max:1340px;--g:max(24px,calc((100vw - var(--max))/2));--pvh:28px;--hh:76px;
--s1:8px;--s2:16px;--s3:24px;--s4:40px;--s5:64px;--s6:clamp(76px,8.4vw,136px);--s7:clamp(96px,11vw,180px);
--t-h2:clamp(40px,5.4vw,88px);--t-h3:clamp(30px,3.4vw,48px);--t-h4:clamp(22px,2.2vw,30px);--t-b:15px;--lh-b:1.62;--msr:44ch;--msr-wide:56ch;--num-col:64px;
--line:rgba(244,239,230,.16);--line2:rgba(244,239,230,.08);--warm:rgba(244,239,230,.72);--ease:cubic-bezier(.22,.61,.36,1)}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.6 'Space Grotesk',system-ui,sans-serif;overflow-x:hidden;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img,video{max-width:100%}img{display:block}
a{color:inherit;text-decoration:none}
h1,h2,h3,h4,p,figure{margin:0}h1,h2,h3{text-wrap:balance}p{text-wrap:pretty}
:where(a,button,[tabindex]):focus-visible{outline:3px solid var(--acc);outline-offset:4px}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.skip{position:absolute;left:var(--g);top:-100px;z-index:99;background:var(--acc);color:#111;padding:12px 18px;font:700 12px/1 'Space Grotesk';letter-spacing:.14em;text-transform:uppercase}.skip:focus{top:8px}
.dsp{font-family:'Anton',Impact,'Arial Narrow',sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:.005em;line-height:.9}
.lbl{font:700 11px/1 'Space Grotesk';letter-spacing:.2em;text-transform:uppercase;color:var(--acc)}
.wrapx{padding-inline:var(--g)}

/* preview banner + sticky header */
.pv{position:fixed;inset:0 0 auto;z-index:70;height:var(--pvh);display:flex;align-items:center;justify-content:center;
background:var(--acc);color:#141217;font:700 10px/1 'Space Grotesk';letter-spacing:.2em;text-transform:uppercase}
.hdr{position:fixed;top:var(--pvh);left:0;right:0;z-index:60;height:var(--hh);display:flex;align-items:center;gap:var(--s3);
padding-inline:var(--g);border-bottom:1px solid transparent;transition:background .32s var(--ease),border-color .32s,height .32s}
.scrolled .hdr{background:rgba(11,10,13,.94);border-bottom-color:var(--line);height:62px;backdrop-filter:blur(14px) saturate(140%)}
.hdr .logo{display:block;flex:none;background:var(--fg);padding:8px 12px;transition:padding .3s}.hdr .logo svg{height:30px;width:auto;display:block}
.scrolled .hdr .logo{padding:6px 10px}.scrolled .hdr .logo svg{height:24px}
.hdr nav{display:flex;gap:clamp(14px,2vw,30px);margin-left:auto}
.hdr nav a{position:relative;font:700 11px/1 'Space Grotesk';letter-spacing:.18em;text-transform:uppercase;padding:10px 0;color:rgba(244,239,230,.82)}
.hdr nav a:after{content:"";position:absolute;left:0;right:0;bottom:2px;height:2px;background:var(--acc);transform:scaleX(0);transform-origin:0 50%;transition:transform .28s var(--ease)}
.hdr nav a:hover{color:var(--fg)}.hdr nav a:hover:after{transform:scaleX(1)}
.hdr .hact{display:flex;align-items:center;gap:var(--s3);margin-left:var(--s3);padding-left:var(--s3);border-left:1px solid var(--line)}
.hdr .ordcta{min-height:40px;padding:0 16px;font-size:10px;letter-spacing:.16em;white-space:nowrap}
.hdr .ordcta .ar{width:13px}
.hdr .tel{font:700 12px/1 'Space Grotesk';letter-spacing:.1em;white-space:nowrap}
.hdr .tel:hover{color:var(--acc)}
.sw{position:relative;flex:none}
.sw>button{display:flex;align-items:center;gap:10px;min-height:40px;padding:0 14px;background:transparent;border:1px solid rgba(244,239,230,.32);color:var(--fg);
font:700 10px/1 'Space Grotesk';letter-spacing:.18em;text-transform:uppercase;cursor:pointer}
.sw>button:hover{border-color:var(--acc);color:var(--acc)}
.sw>button svg{width:9px;height:6px;fill:none;stroke:currentColor;stroke-width:2;transition:transform .25s}
.sw[aria-expanded="true"]>button svg,.sw.open>button svg{transform:rotate(180deg)}
.sw .menu{position:absolute;top:calc(100% + 8px);right:0;min-width:230px;background:#0E0D10;border:1px solid var(--line);padding:6px;display:none;z-index:70;box-shadow:0 24px 50px -20px #000}
.sw.open .menu{display:block}
.sw .menu a{display:flex;justify-content:space-between;gap:var(--s3);padding:12px 12px;font:700 11px/1 'Space Grotesk';letter-spacing:.14em;text-transform:uppercase;border-bottom:1px solid var(--line2)}
.sw .menu a:last-child{border-bottom:0}.sw .menu a:hover{background:rgba(244,239,230,.06);color:var(--acc)}
.sw .menu a b{color:var(--acc)}
.burger{display:none;width:46px;height:46px;background:transparent;border:1px solid rgba(244,239,230,.32);cursor:pointer;padding:0;place-items:center;margin-left:auto}
.burger span,.burger span:before,.burger span:after{display:block;width:20px;height:2px;background:var(--fg);transition:transform .28s var(--ease),opacity .2s}
.burger span{position:relative;margin-inline:auto}
.burger span:before,.burger span:after{content:"";position:absolute;left:0}.burger span:before{top:-6px}.burger span:after{top:6px}
.nav-open .burger span{transform:rotate(45deg)}.nav-open .burger span:before{transform:translateY(6px) rotate(-90deg)}.nav-open .burger span:after{opacity:0}
.drawer{position:fixed;inset:0;z-index:80;background:#0B0A0D;display:flex;flex-direction:column;padding:calc(var(--pvh) + 18px) var(--g) var(--s5);
transform:translateY(-100%);visibility:hidden;transition:transform .42s var(--ease),visibility .42s}
.nav-open .drawer{transform:none;visibility:visible}
.drawer .dh{display:flex;align-items:center;justify-content:space-between;padding-bottom:var(--s3);border-bottom:1px solid var(--line)}
.drawer .dh .logo{background:var(--fg);padding:8px 12px}.drawer .dh .logo svg{height:26px;width:auto;display:block}
.drawer .x{width:46px;height:46px;background:transparent;border:1px solid var(--line);color:var(--fg);font:400 26px/1 'Space Grotesk';cursor:pointer}
.drawer nav{margin-top:var(--s4);display:flex;flex-direction:column}
.drawer nav a{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:clamp(30px,9vw,44px);line-height:1.14;padding:12px 0;border-bottom:1px solid var(--line2);display:flex;justify-content:space-between;align-items:baseline;gap:var(--s3)}
.drawer nav a em{font:700 10px/1 'Space Grotesk';letter-spacing:.18em;color:var(--acc);font-style:normal}
.drawer nav a:active,.drawer nav a:hover{color:var(--acc)}
.drawer .df{margin-top:auto;display:flex;flex-direction:column;gap:var(--s2);padding-top:var(--s4)}
.drawer .df .tel{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:26px;color:var(--acc)}
.drawer .df .sw{display:inline-flex;flex-direction:column;gap:8px}
.drawer .df .sw>.lab{font:700 10px/1 'Space Grotesk';letter-spacing:.2em;color:var(--warm);text-transform:uppercase}
.drawer .df .sw a{font:700 12px/1 'Space Grotesk';letter-spacing:.14em;text-transform:uppercase;padding:10px 0;border-bottom:1px solid var(--line2);display:flex;justify-content:space-between}
.drawer .df .sw a[aria-current]{color:var(--acc)}

/* hero */
main{padding-top:0}
.hero{position:relative;isolation:isolate;min-height:min(940px,calc(100svh - var(--pvh)));display:flex;align-items:flex-end;
padding:calc(var(--hh) + var(--s5) + var(--pvh)) var(--g) var(--s6);overflow:hidden}
.hero .media{position:absolute;inset:0;z-index:-2;overflow:hidden}
.hero .hposter{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center}
.hero video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .9s var(--ease)}
.hero.vid-live video{opacity:1}
.hero .hposter.kb{transform:scale(1.06);transform-origin:50% 50%;will-change:transform}
@media(prefers-reduced-motion:no-preference){.hero .hposter.kb{animation:lnkb 34s ease-in-out infinite}}
@keyframes lnkb{0%{transform:scale(1.06) translate(-1.2%,0)}50%{transform:scale(1.06) translate(1.2%,0)}100%{transform:scale(1.06) translate(-1.2%,0)}}
.hero .scrim{position:absolute;inset:0;z-index:-1;background:
linear-gradient(90deg,rgba(11,10,13,.94) 0%,rgba(11,10,13,.82) 34%,rgba(11,10,13,.42) 62%,rgba(11,10,13,.3) 100%),
linear-gradient(0deg,rgba(11,10,13,.96) 0%,rgba(11,10,13,.55) 26%,rgba(11,10,13,0) 62%)}
.hero .tx{position:relative;max-width:920px}
.hero .eb{display:flex;align-items:center;gap:var(--s3);flex-wrap:wrap;margin-bottom:var(--s3)}
.hero .eb .lbl{color:var(--acc)}
.hero .eb .sep{width:34px;height:1px;background:rgba(244,239,230,.4)}
.hero h1{font-size:clamp(58px,8.4vw,144px);line-height:.86;letter-spacing:-.005em}
.hero h1 em{font-style:normal;color:var(--acc);display:block}
.hero .lead{font-size:clamp(17px,1.35vw,20px);line-height:1.55;max-width:47ch;margin-top:var(--s3);color:rgba(244,239,230,.9)}
.hero .cta{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s2) var(--s3);margin-top:var(--s4)}
.hero .here{display:flex;align-items:center;gap:12px;margin-top:var(--s4);padding-top:var(--s3);border-top:1px solid rgba(244,239,230,.2);max-width:560px}
.hero .here .lb{font:700 10px/1 'Space Grotesk';letter-spacing:.2em;text-transform:uppercase;color:rgba(244,239,230,.62)}
.hero .here .nm{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:clamp(20px,2vw,28px);line-height:1;color:var(--acc)}
.hero .here .ad{font-size:13px;line-height:1.4;color:rgba(244,239,230,.74)}

/* open-now chip */
.oc{display:inline-flex;align-items:center;gap:9px;min-height:32px;padding:0 13px 0 11px;background:rgba(11,10,13,.55);
border:1px solid rgba(244,239,230,.26);font:700 10px/1 'Space Grotesk';letter-spacing:.16em;text-transform:uppercase;white-space:nowrap}
.oc i{width:7px;height:7px;background:#3ECC7A;flex:none;box-shadow:0 0 0 3px rgba(62,204,122,.22)}
.oc.closed{color:rgba(244,239,230,.8)}.oc.closed i{background:#E0281E;box-shadow:0 0 0 3px rgba(224,40,30,.22)}
@media(prefers-reduced-motion:no-preference){.oc.open i{animation:pulse 2.6s ease-in-out infinite}}
@keyframes pulse{0%,100%{box-shadow:0 0 0 3px rgba(62,204,122,.24)}50%{box-shadow:0 0 0 6px rgba(62,204,122,.06)}}

/* controls: square only */
.sq{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:0 30px;background:var(--brand);color:#fff;
font:700 12px/1 'Space Grotesk';letter-spacing:.16em;text-transform:uppercase;border:1px solid var(--brand);transition:background .22s,color .22s,border-color .22s}
.sq:hover{background:var(--acc);color:#141217;border-color:var(--acc)}
.sq .ar{width:16px;height:9px;fill:none;stroke:currentColor;stroke-width:2;transition:transform .25s var(--ease)}.sq:hover .ar{transform:translateX(4px)}
.ul{display:inline-flex;align-items:center;gap:9px;min-height:56px;font:700 12px/1 'Space Grotesk';letter-spacing:.16em;text-transform:uppercase;
color:var(--fg);background:none;border:0;padding:0}
.ul span{border-bottom:2px solid var(--acc);padding-bottom:5px}
.ul:hover{color:var(--acc)}.ul:hover span{border-color:var(--fg)}

/* ticker */
.tick{background:var(--brand);color:#0B0A0D;overflow:hidden;white-space:nowrap;padding:14px 0;border-block:1px solid rgba(0,0,0,.2)}
.tick .in{display:inline-block;font-family:'Anton',Impact,sans-serif;font-size:clamp(26px,3.3vw,46px);line-height:1;text-transform:uppercase;will-change:transform}
@media(prefers-reduced-motion:no-preference){.tick .in{animation:mq 44s linear infinite}}
@keyframes mq{to{transform:translateX(-50%)}}
.tick span{padding:0 .5em}.tick i{font-style:normal;color:var(--acc);font-size:.55em;vertical-align:.28em;padding:0 .2em}

/* detail bands */
.pend{height:74px;background:#0B0A0D;display:flex;align-items:flex-start;justify-content:space-between;padding:0 max(20px,calc((100vw - var(--max))/2));overflow:hidden;border-bottom:1px solid var(--line2)}
.pend i{display:block;width:2px;height:26px;background:#4a4750;position:relative;flex:none;margin-top:0}
.pend i:after{content:"";position:absolute;left:-11px;top:24px;width:24px;height:19px;background:var(--c);clip-path:polygon(20% 0,80% 0,100% 100%,0 100%);box-shadow:0 0 26px 7px color-mix(in srgb,var(--c) 55%,transparent)}
.plank{height:20px;background:repeating-linear-gradient(90deg,#3B2418 0 176px,#2B1A10 176px 179px,#432C1C 179px 330px,#2B1A10 330px 333px,#332014 333px 470px,#2B1A10 470px 473px)}

/* section rhythm */
.sec{padding-block:var(--s6)}
/* one header shape everywhere: eyebrow, big title, side note pinned to the same baseline */
.hd{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,34ch);align-items:end;gap:var(--s5) var(--s4);margin-bottom:var(--s5);padding-bottom:var(--s3);border-bottom:1px solid var(--line)}
.hd .t .lbl{display:block;margin-bottom:var(--s3)}
.hd h2{font-size:var(--t-h2)}
.hd .side{margin:0;font-size:12px;line-height:1.7;letter-spacing:.09em;text-transform:uppercase;color:var(--warm);text-align:right;min-height:2.4em}
[data-rv]{opacity:0;transform:translateY(18px);transition:opacity .7s var(--ease),transform .7s var(--ease)}
[data-rv].in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){[data-rv]{opacity:1;transform:none;transition:none}}

/* stations */
.stn-wrap{background:#0B0A0D}
.stn{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:var(--s3) var(--s4);align-items:center;padding-block:var(--s5);border-bottom:1px solid var(--line2)}
.stn:first-of-type{padding-top:0}
.stn .im{grid-column:1/span 7;margin-left:calc(var(--g) * -1);margin-block:calc(var(--s5) * -1);position:relative;overflow:hidden}
.stn.r .im{grid-column:6/span 7;margin-left:0;margin-right:calc(var(--g) * -1)}
.stn .im img{width:100%;height:100%;aspect-ratio:3/2;object-fit:cover;filter:saturate(1.03) contrast(1.02);transition:transform 1.1s var(--ease)}
.stn .im:hover img{transform:scale(1.035)}
.stn .im .tag{position:absolute;left:0;bottom:0;background:var(--brand);color:#fff;font:700 9px/1 'Space Grotesk';letter-spacing:.2em;text-transform:uppercase;padding:9px 12px}
.stn .tx{grid-column:9/span 4}.stn.r .tx{grid-column:1/span 4;grid-row:1}
.stn .no{display:flex;align-items:baseline;gap:var(--s2);margin-bottom:var(--s3)}
.stn .no b{font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:clamp(46px,4.6vw,72px);line-height:.8;color:var(--acc)}
.stn .no .rule{flex:1;height:1px;background:var(--line);min-width:20px}
.stn h3{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:var(--t-h3);line-height:.98;margin-bottom:var(--s2)}
.stn p{font-size:var(--t-b);line-height:var(--lh-b);color:var(--warm);max-width:var(--msr)}
/* typographic tiles: same number + rule + heading + line as the photo rows, one step down in size */
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border-top:1px solid var(--line);margin-top:var(--s5)}
.tile{padding:var(--s4) var(--s4) var(--s4) 0;display:flex;flex-direction:column;position:relative;transition:background .3s}
.tile+.tile{padding-left:var(--s4);border-left:1px solid var(--line2)}
.tile .no{display:flex;align-items:baseline;gap:var(--s2);margin-bottom:var(--s3)}
.tile .no b{font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:clamp(34px,3.2vw,52px);line-height:.8;color:var(--acc)}
.tile .no .rule{flex:1;height:1px;background:var(--line);min-width:20px}
.tile h3{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:var(--t-h3);line-height:.98;margin-bottom:var(--s2)}
.tile p{font-size:var(--t-b);line-height:var(--lh-b);color:var(--warm);max-width:var(--msr)}

/* hours + visit */
.duo{display:grid;grid-template-columns:7fr 5fr;gap:var(--s6);align-items:start}
.duo h2{font-size:var(--t-h2);margin-bottom:var(--s4)}
.duo .duo-h{font-size:var(--t-h4);margin-bottom:var(--s3)}
.duo>.visit{display:grid;grid-template-rows:auto auto auto auto auto auto;align-content:start}
.hrs{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.hrs li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--s3);align-items:baseline;padding:17px 0;border-bottom:1px solid var(--line);
font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:clamp(22px,2.3vw,34px);line-height:1}
.hrs li span:first-child{color:rgba(244,239,230,.62);letter-spacing:.02em}
.hrs li b{font-weight:400;color:var(--fg);text-align:right;font-variant-numeric:tabular-nums}
.hrs li.is-today{background:linear-gradient(90deg,rgba(245,166,35,.13),transparent 78%)}
.hrs li.is-today span:first-child{color:var(--acc)}.hrs li.is-today b{color:var(--acc)}
.hrs li.is-today span:first-child:before{content:"";display:inline-block;width:6px;height:6px;background:var(--acc);margin-right:12px;vertical-align:.12em}
.visit .addr{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:clamp(24px,2.3vw,34px);line-height:1.08;margin-bottom:var(--s3)}
.visit .ph{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:clamp(22px,2vw,30px);line-height:1;color:var(--acc);margin-bottom:var(--s3);display:inline-block}
.visit .ph:hover{color:var(--fg)}
.visit .oc{margin-bottom:var(--s3)}
.visit .r{display:flex;flex-direction:column;gap:var(--s2)}
.spec{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.spec li{padding:12px 0;border-bottom:1px solid var(--line);font-size:15px;line-height:1.55;color:var(--warm)}
.spec li strong{color:var(--fg);font-family:'Anton',Impact,sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:.02em;font-size:18px;margin-right:6px}

/* locations */
.locpick{display:inline-flex;align-items:stretch;margin-top:var(--s4);border:1px solid rgba(244,239,230,.34);background:rgba(11,10,13,.42);backdrop-filter:blur(6px)}
.locpick a{display:flex;align-items:center;padding:0 18px;min-height:44px;font:700 10.5px/1 'Space Grotesk';letter-spacing:.2em;text-transform:uppercase;color:rgba(244,239,230,.78);border-left:1px solid rgba(244,239,230,.2);transition:color .2s,background .2s}
.locpick a:first-child{border-left:0}
.locpick a:hover{color:var(--acc);background:rgba(244,239,230,.06)}
.locpick a[aria-current="page"]{background:var(--acc);color:#141217;pointer-events:none}
.locpick a[aria-current="page"]:hover{background:var(--acc);color:#141217}
.locs-sec{background:#0B0A0D;border-block:1px solid var(--line2)}
.locs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--line2);margin-top:var(--s5)}
.loc{background:#0B0A0D;padding:var(--s5) var(--s4) var(--s5);position:relative;display:flex;flex-direction:column;transition:background .3s}
.loc:hover{background:#12101A}
.loc .top{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);margin-bottom:var(--s4);min-height:24px}
.loc .top .lbl{color:rgba(244,239,230,.5)}
.loc .cur{font:700 9px/1 'Space Grotesk';letter-spacing:.2em;text-transform:uppercase;color:#141217;background:var(--acc);padding:7px 10px}
.loc .cur[hidden],.loc .cur.ghost{visibility:hidden}
.loc h3{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:clamp(34px,4.2vw,64px);line-height:.92;color:var(--acc);margin-bottom:var(--s3)}
.loc h3 a:hover{color:var(--fg)}
.loc .ad{font-size:15px;line-height:1.55;color:rgba(244,239,230,.86);margin-bottom:var(--s2);max-width:24ch}
.loc .ph{font:700 14px/1 'Space Grotesk';letter-spacing:.08em;margin-bottom:var(--s4)}
.loc .ph:hover{color:var(--acc)}
.loc .hh{display:flex;flex-wrap:wrap;gap:6px var(--s3);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:rgba(244,239,230,.62);margin-bottom:var(--s4)}
.loc .go{margin-top:auto;display:inline-flex;align-items:center;gap:10px;font:700 11px/1 'Space Grotesk';letter-spacing:.18em;text-transform:uppercase;color:var(--fg)}
.loc .go:after{content:"";width:26px;height:1px;background:var(--acc);transition:width .28s}.loc .go:hover:after{width:44px}
.loc[aria-current] h3:before{content:"";position:absolute;left:0;top:0;width:100%;height:3px;background:var(--acc)}

/* families */
.fam{background:var(--acc);color:#141217;padding-block:var(--s6)}
.fam .in{display:grid;grid-template-columns:5fr 7fr;gap:var(--s6);align-items:start}
.fam .lbl{color:#141217;opacity:.72}
.fam h2{font-size:var(--t-h2);margin-top:var(--s3)}
.fam ol{list-style:none;margin:0;padding:0;border-top:2px solid #141217}
.fam li{display:grid;grid-template-columns:74px 1fr;gap:var(--s3);padding:var(--s3) 0;border-bottom:2px solid #141217}
.fam li b{font-family:'Anton',Impact,sans-serif;font-weight:400;font-size:40px;line-height:1;color:var(--brand)}
.fam li strong{display:block;font-family:'Anton',Impact,sans-serif;font-weight:400;text-transform:uppercase;font-size:var(--t-h4);line-height:1.06;margin-bottom:6px}
.fam li p{font-size:16px;line-height:var(--lh-b);max-width:var(--msr)}

/* room banner */
.room{position:relative;min-height:min(66vh,620px);display:flex;align-items:flex-end;overflow:hidden;padding:0 var(--g) var(--s5);background:#151319}
.room img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.room:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(11,10,13,.94) 4%,rgba(11,10,13,.35) 46%,rgba(11,10,13,.12))}
.room .in{position:relative;z-index:2;width:100%;display:flex;align-items:flex-end;justify-content:space-between;gap:var(--s4);flex-wrap:wrap}
.room h2{font-size:clamp(38px,5.8vw,104px);max-width:16ch}
.room .cap{font:700 10px/1 'Space Grotesk';letter-spacing:.2em;text-transform:uppercase;color:rgba(244,239,230,.62);padding-bottom:8px}

/* modules */
.mods-sec{border-top:1px solid var(--line)}
.mods{list-style:none;margin:0;padding:0;border-top:1px solid var(--line);counter-reset:mod}
.mod{display:grid;grid-template-columns:var(--num-col) minmax(0,1fr) auto;gap:var(--s4);align-items:start;padding:var(--s4) 0;border-bottom:1px solid var(--line);position:relative;min-height:calc(var(--s4) * 2 + 84px)}
.mod .mn{font-family:'Anton',Impact,sans-serif;font-size:14px;letter-spacing:.08em;color:rgba(244,239,230,.42);padding-top:6px}
.mod .mb h3{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:var(--t-h4);line-height:1;margin-bottom:10px}
.mod .mb p{font-size:var(--t-b);line-height:var(--lh-b);max-width:var(--msr-wide)}
.mod[data-state="on"] .mb h3{color:var(--fg)}
.mod[data-state="on"] .mc-on{color:rgba(244,239,230,.82)}
.mod .mgo{justify-self:end;display:inline-flex;align-items:center;gap:10px;min-height:48px;padding:0 22px;background:var(--brand);color:#fff;
font:700 11px/1 'Space Grotesk';letter-spacing:.16em;text-transform:uppercase;border:1px solid var(--brand);transition:background .22s,color .22s,border-color .22s}
.mod .mgo:hover{background:var(--acc);color:#141217;border-color:var(--acc)}
.mod .mgo:after{content:"";width:14px;height:1px;background:currentColor}
.mod[data-state="off"] .mb h3{color:rgba(244,239,230,.56)}
.mod .mc-off{color:rgba(244,239,230,.56);max-width:52ch}
.mod .msoon{justify-self:end;display:inline-flex;align-items:center;gap:8px;font:700 9px/1 'Space Grotesk';letter-spacing:.22em;text-transform:uppercase;
color:rgba(244,239,230,.52);border:1px solid rgba(244,239,230,.18);padding:9px 12px;white-space:nowrap}
.mod .msoon:before{content:"";width:5px;height:5px;background:rgba(244,239,230,.45);transform:rotate(45deg)}
.mod .jobs{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.mod .jobs li{font:700 10px/1 'Space Grotesk';letter-spacing:.14em;text-transform:uppercase;color:var(--acc);border:1px solid rgba(245,166,35,.4);padding:8px 10px}
.dlv{margin-top:var(--s5);padding-top:var(--s4);border-top:1px solid var(--line);display:grid;grid-template-columns:var(--num-col) minmax(0,1fr) auto;gap:var(--s4);align-items:start;min-height:calc(var(--s4) * 2 + 84px)}
.dlv .mn{font-family:'Anton',Impact,sans-serif;font-size:14px;letter-spacing:.08em;color:rgba(244,239,230,.42);padding-top:6px}
.dlv h3{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:var(--t-h4);line-height:1;margin-bottom:8px}
.dlv p{font-size:var(--t-b);line-height:var(--lh-b);color:rgba(244,239,230,.62);max-width:var(--msr-wide)}
.dlinks{justify-self:end;display:flex;flex-wrap:wrap;gap:8px}
.dlinks a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border:1px solid rgba(244,239,230,.28);font:700 10px/1 'Space Grotesk';letter-spacing:.16em;text-transform:uppercase;transition:background .2s,color .2s,border-color .2s}
.dlinks a:hover{background:var(--acc);border-color:var(--acc);color:#141217}

/* menu */
.menu-sec{border-top:1px solid var(--line)}
.mgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s4) var(--s6)}
.mcat h3{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:var(--t-h4);line-height:1;padding-bottom:10px;border-bottom:2px solid var(--acc);margin-bottom:var(--s1)}
.mcat ul{list-style:none;margin:0;padding:0}
.mcat li{padding:12px 0;border-bottom:1px solid var(--line2)}
.mi{display:flex;justify-content:space-between;gap:var(--s3);font-weight:700;font-size:var(--t-b)}
.md{display:block;margin-top:3px;font-size:13px;line-height:1.55;color:rgba(244,239,230,.58);max-width:52ch}
.pr{color:var(--acc);font-variant-numeric:tabular-nums}
.menu-off{display:grid;grid-template-columns:5fr 7fr;gap:var(--s6);align-items:start}
.menu-off .big{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:var(--t-h2);line-height:.94;color:rgba(244,239,230,.34)}
.menu-off p{font-size:16px;line-height:var(--lh-b);color:rgba(244,239,230,.68);max-width:var(--msr)}
.menu-off .rule{width:56px;height:2px;background:var(--acc);margin-bottom:var(--s3)}
.menu-off .mo-r{display:flex;flex-direction:column;gap:var(--s4);padding-top:6px}
.menu-off .mo-lead{font-size:var(--t-b);line-height:var(--lh-b);color:rgba(244,239,230,.76);max-width:var(--msr-wide);margin:0}
.menu-off .mo-facts{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.menu-off .mo-facts li{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);gap:var(--s4);align-items:baseline;padding:14px 0;border-bottom:1px solid var(--line)}
.menu-off .mo-facts span{font:700 9px/1 'Space Grotesk';letter-spacing:.2em;text-transform:uppercase;color:rgba(244,239,230,.5)}
.menu-off .mo-facts b{font-weight:400;font-size:15px;color:rgba(244,239,230,.9);text-align:right}
.menu-off .mo-cta{margin:0}
.menu-off .mo-l{display:flex;flex-direction:column}

/* footer */
footer{background:#0B0A0D;border-top:3px solid var(--acc);padding-block:var(--s5) var(--s4)}
.fgrid{display:grid;grid-template-columns:1.6fr 1fr 1fr 1.2fr;gap:var(--s5) var(--s4)}
.fbrand .logo{display:inline-block;background:var(--fg);padding:8px 12px;margin-bottom:var(--s3)}
.fbrand .logo svg{height:28px;width:auto;display:block}
.fbrand p{font-size:14px;line-height:1.6;color:rgba(244,239,230,.6);max-width:32ch}
.fcol h4{font:700 10px/1 'Space Grotesk';letter-spacing:.2em;text-transform:uppercase;color:var(--acc);margin-bottom:var(--s3)}
.fcol ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.fcol a,.fcol li{font-size:14px;line-height:1.45;color:rgba(244,239,230,.78)}
.fcol a:hover{color:var(--acc)}
.fcol .nm{font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:17px;color:var(--acc);letter-spacing:.01em}
.fcol .sm{font-size:12px;color:rgba(244,239,230,.5);letter-spacing:.06em}
.fbot{margin-top:var(--s5);padding-top:var(--s3);border-top:1px solid var(--line2);display:flex;justify-content:space-between;gap:var(--s3);flex-wrap:wrap;
font:700 10px/1.6 'Space Grotesk';letter-spacing:.16em;text-transform:uppercase;color:rgba(244,239,230,.5)}
.fbot a:hover{color:var(--acc)}

/* Loaded Nacho footer credit: shared v2 block + Feast vars. Full-bleed element, content inset by --g so the rule matches .wrapx exactly. */
${LN_CREDIT_CSS}
.ln-credit{max-width:none;margin:var(--s3) var(--g) 0;padding:.9rem 0 0}

/* responsive */
@media(max-width:1180px){
.hdr nav{gap:clamp(10px,1.4vw,18px)}
.hdr .tel{display:none}
.stn .tx{grid-column:8/span 5}.stn.r .tx{grid-column:1/span 5}
.mgrid{grid-template-columns:1fr}
.fgrid{grid-template-columns:1fr 1fr}
}
@media(max-width:1024px){
.hdr nav,.hdr .hact{display:none}
.burger{display:grid}
.duo,.fam .in,.menu-off{grid-template-columns:1fr;gap:var(--s4)}
.fam li{grid-template-columns:58px 1fr}
.hd{display:block;padding-bottom:var(--s3)}.hd .side{text-align:left;margin-top:var(--s3);max-width:44ch;min-height:0}
}
@media(max-width:900px){
.stn,.stn.r{display:block;padding-block:var(--s5)}
.stn .im,.stn.r .im{margin:0 calc(var(--g) * -1) var(--s4);}
.stn .im img{aspect-ratio:4/3}
.stn .tx,.stn.r .tx{display:block;padding-inline:0}
.stn .no{margin-bottom:var(--s2)}
.tiles{grid-template-columns:1fr}
.tile{min-height:0;padding:var(--s4)}
.tile h3{margin-top:var(--s4)}
.locs{grid-template-columns:1fr}
.locpick{display:flex;width:100%;margin-top:var(--s3)}
.locpick a{flex:1 1 0;justify-content:center;padding:0 10px;min-height:46px;font-size:10px;letter-spacing:.16em}
.mod,.dlv{grid-template-columns:40px minmax(0,1fr);gap:var(--s2) var(--s3)}
.mod .mgo,.mod .msoon,.dlinks{grid-column:2;justify-self:start;margin-top:var(--s2)}
.dlv .mn{grid-row:1}
}
@media(max-width:760px){
:root{--hh:64px;--s6:clamp(56px,13vw,80px)}
.hero{min-height:0;display:block;padding:calc(var(--hh) + var(--pvh) + 30vh) 0 var(--s5);overflow:hidden}
.hero .media{position:absolute;inset:0}
.hero .scrim{background:linear-gradient(0deg,var(--bg) 2%,rgba(11,10,13,.86) 26%,rgba(11,10,13,.4) 56%,rgba(11,10,13,.55) 100%)}
.hero .tx{padding-inline:var(--g)}
.hero h1{font-size:clamp(46px,13.4vw,78px);line-height:.9}
.hero .lead{font-size:16px;max-width:none}
.hero .cta{gap:12px}
.hero .cta .sq{width:100%}
.hero .here{display:block;margin-top:var(--s3);padding-top:var(--s3)}
.hero .here .nm{margin:6px 0 4px}
.sq,.ul{min-height:52px}
.pend{height:56px}.pend i{height:20px}.pend i:after{top:19px;width:20px;height:16px;left:-9px}
.pv{font-size:9px;letter-spacing:.14em}
.hrs li{font-size:clamp(18px,5.2vw,24px);padding:14px 0}
.fam li{grid-template-columns:44px 1fr;gap:var(--s2)}
.fam li b{font-size:30px}
.locs-sec .loc{padding:var(--s4) var(--g) var(--s5)}
.fgrid{grid-template-columns:1fr;gap:var(--s4)}
.room{min-height:52vh}.room .in{display:block}.room .cap{margin-top:10px}
.mod{padding:var(--s3) 0}
.mod .mn{padding-top:2px}
.dlv{margin-top:var(--s4)}
footer{padding-block:var(--s4)}
.drawer{padding-inline:var(--g)}
}
@media(max-width:420px){
.hero h1{font-size:clamp(42px,12.6vw,60px)}
.hrs li{font-size:17px}
.mod .mb h3{font-size:24px}
.fcol .nm{font-size:16px}
}
@media(prefers-reduced-motion:reduce){
html{scroll-behavior:auto}
.tick .in{animation:none!important;transform:none!important}
.stn .im img{transition:none}
.hero video{transition:none}
}
`;

// Hero video block: absolute media-host URLs from config; the inlined still is the always-present fallback.
const heroMedia = (v) => {
  const V = CFG.video || {};
  const src = (u, t) => u ? `<source src="${esc(u)}" type="${t}">` : '';
  return `<div class="media">
<img class="hposter" src="/img/${CFG.img.hero}.webp" alt="${esc(CFG.img.heroAlt)}" width="1600" height="900" fetchpriority="high" decoding="async">
<video muted loop playsinline preload="metadata" autoplay${V.poster ? ` poster="${esc(V.poster)}"` : ''}${V.mp4_720 ? ` data-small="${esc(V.mp4_720)}"` : ''} aria-hidden="true" tabindex="-1">${src(V.webm, 'video/webm')}${src(V.mp4, 'video/mp4')}</video>
</div>
<div class="scrim" aria-hidden="true"></div>`;
};

const arrow = '<svg class="ar" viewBox="0 0 16 9" aria-hidden="true"><path d="M0 4.5h14M10.5 1 14 4.5 10.5 8"/></svg>';
const chev = '<svg viewBox="0 0 9 6" aria-hidden="true"><path d="M1 1l3.5 3.5L8 1"/></svg>';

function feastHeader(v) {
  const { locs, loc, tel, phone, q, MED } = v;
  const nav = [['#stations', 'The hall'], ['#locations', 'Locations'], ['#hours', 'Hours'], ['#menu', 'Menu'], ['#more', 'Order & more']];
  const ord = v.modList[0];
  const ordBtn = ord.on && ord.url ? `<a class="sq ordcta" href="${esc(ord.url)}" rel="noopener" target="_blank">Order online${arrow}</a>` : '';
  const sw = locs.length > 1 ? `<div class="sw" data-sw>
<button type="button" data-sw-btn aria-expanded="false" aria-controls="locmenu"><span>${esc(loc ? loc.name : 'Locations')}</span>${chev}</button>
<div class="menu" id="locmenu" role="group" aria-label="Choose a location">${locs.map(l => `<a href="${esc(q({ loc: l.slug }))}" ${l === loc ? 'aria-current="page"' : ''}><span>${esc(l.name)}</span>${l === loc ? '<b>You are here</b>' : ''}</a>`).join('')}</div></div>` : '';
  const drawerSw = locs.length > 1 ? `<div class="sw"><span class="lab">Location</span>${locs.map(l => `<a href="${esc(q({ loc: l.slug }))}" ${l === loc ? 'aria-current="page"' : ''}><span>${esc(l.name)}</span>${l === loc ? '<b>You are here</b>' : ''}</a>`).join('')}</div>` : '';
  return `<div class="pv">Preview only. Not the live site.</div>
<header class="hdr">
<a class="logo" href="${esc(q({}))}" aria-label="${esc(v.name)} home">${CFG.logos[v.th.logo]}</a>
<nav aria-label="Main">${nav.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>
<div class="hact">${ordBtn}${sw}${tel ? `<a class="tel" href="tel:${tel}">${esc(phone)}</a>` : ''}</div>
<button class="burger" type="button" data-open-nav aria-expanded="false" aria-controls="drawer" aria-label="Open menu"><span></span></button>
</header>
<div class="drawer" id="drawer" data-drawer aria-label="Menu">
<div class="dh"><a class="logo" href="${esc(q({}))}" aria-label="${esc(v.name)} home">${CFG.logos[v.th.logo]}</a><button class="x" type="button" data-open-nav aria-label="Close menu">&times;</button></div>
<nav aria-label="Mobile">${nav.map(([h, t], i) => `<a href="${h}">${t}<em>${String(i + 1).padStart(2, '0')}</em></a>`).join('')}</nav>
<div class="df">${tel ? `<a class="tel" href="tel:${tel}">${esc(phone)}</a>` : ''}${drawerSw}</div></div>`;
}

function feastHero(v) {
  const { locs, loc, tel, phone, mapUrl, addr, open, MED } = v;
  const sw = locs.length > 1 ? `<div class="locpick" role="group" aria-label="Choose a location">${locs.map(l => `<a href="${esc(v.q({ loc: l.slug }))}" ${l === loc ? 'aria-current="page"' : ''}>${esc(l.name)}</a>`).join('')}</div>` : '';
  return `<section class="hero" data-hero>
${heroMedia(v)}
<div class="tx">
<div class="eb"><span class="lbl">${esc(CFG.eyebrow)}</span>${open ? `<span class="sep" aria-hidden="true"></span>${chip(open)}` : ''}</div>
<h1 class="dsp">${CFG.headline}</h1>
<p class="lead">${esc(CFG.lead)}</p>
${sw}
<div class="cta">${tel ? `<a class="sq" href="tel:${tel}">Call ${esc(loc ? loc.name : v.name)}${arrow}</a>` : ''}${mapUrl ? `<a class="ul" href="${esc(mapUrl)}" rel="noopener" target="_blank"><span>Directions</span></a>` : ''}<a class="ul" href="#menu"><span>The menu</span></a></div>
${addr ? `<p class="here"><span class="lb">You're looking at</span><span class="nm">${esc(loc ? loc.name : '')}</span><span class="ad">${esc(addr)}</span></p>` : ''}
</div></section>`;
}

const img = (f, w = 1400, h = 933, cls = '', lazy = true) => `<img${cls ? ` class="${cls}"` : ''} src="/img/${f.src}.webp" alt="${esc(f.alt)}"${lazy ? ' loading="lazy"' : ''} decoding="async" width="${w}" height="${h}">`;

function feastStations(v) {
  const ST = CFG.stations;
  const photo = ST.filter(s => s.img), plain = ST.filter(s => !s.img);
  const byName = {}; CFG.img.food.forEach(f => byName[f.src] = f);
  const rows = photo.map((s, i) => {
    const f = byName[s.img];
    return `<article class="stn${i % 2 ? ' r' : ''}" data-rv>
<div class="im"><img src="/img/${f.src}.webp" alt="${esc(f.alt)}" loading="lazy" decoding="async" width="1400" height="933">${f.real ? '<span class="tag">From our own kitchen</span>' : ''}</div>
<div class="tx"><div class="no"><b>${s.n}</b><span class="rule" aria-hidden="true"></span></div><h3>${esc(s.name)}</h3><p>${esc(s.line)}</p></div></article>`;
  }).join('');
  const tiles = plain.length ? `<div class="tiles">${plain.map(s => `<article class="tile" data-rv><div class="no"><b>${s.n}</b><span class="rule" aria-hidden="true"></span></div><h3>${esc(s.name)}</h3><p>${esc(s.line)}</p></article>`).join('')}</div>` : '';
  return `<section class="stn-wrap" id="stations"><div class="sec wrapx">
<div class="hd"><div class="t"><span class="lbl">${esc(CFG.stationsEyebrow)}</span><h2 class="dsp">${esc(CFG.stationsTitle)}</h2></div><p class="side">Photos are representative. The lineup changes day to day.</p></div>
${rows}${tiles}</div></section>`;
}

function feastLocations(v) {
  const { locs, loc, q, cLocs } = v;
  if (locs.length < 2) return '';
  const rows = locs.map(l => {
    const c = cLocs.find(x => (x.loc || x.slug) === l.slug);
    const hrs = c && Array.isArray(c.hours) ? c.hours : [];
    const dg = String(l.phone || '').replace(/\D/g, '');
    const map = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(v.name + ' ' + (l.address || ''));
    return `<article class="loc" ${l === loc ? 'aria-current="true"' : ''}>
<div class="top"><span class="lbl">Location ${String(locs.indexOf(l) + 1).padStart(2, '0')}</span>${l === loc ? '<span class="cur">You are here</span>' : '<span class="cur ghost" aria-hidden="true">You are here</span>'}</div>
<h3><a href="${esc(q({ loc: l.slug }))}">${esc(l.name)}</a></h3>
${l.address ? `<p class="ad">${esc(l.address)}</p>` : ''}
${dg.length === 10 ? `<a class="ph" href="tel:+1${dg}">${esc(l.phone)}</a>` : ''}
${hrs.length ? `<div class="hh">${hrs.map(h => `<span>${esc(h)}</span>`).join('')}</div>` : ''}
${l.address ? `<a class="go" href="${esc(map)}" rel="noopener" target="_blank">Directions</a>` : ''}
</article>`;
  }).join('');
  return `<section class="locs-sec sec" id="locations"><div class="wrapx">
<div class="hd"><div class="t"><span class="lbl">Two rooms, one Feast</span><h2 class="dsp">Pick your location</h2></div><p class="side">Same spread, two sides of the city. Hours and phone are per location.</p></div>
<div class="locs">${rows}</div></div></section>`;
}

function feastHours(v) {
  const { hRows, addr, phone, tel, mapUrl, open, specHtml, loc } = v;
  const dayNow = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long' }).format(new Date()).slice(0, 3);
  return `<section class="sec wrapx" id="hours">
<div class="hd"><div class="t"><span class="lbl">Hours${loc ? ' &middot; ' + esc(loc.name) : ''}</span><h2 class="dsp">When we're open</h2></div><p class="side">Hours and phone follow the location you picked at the top.</p></div>
<div class="duo">
<div>
${hRows.length ? `<ul class="hrs">${hRows.map(r => `<li class="${r.days.split('–').includes(dayNow) || r.days === dayNow ? 'is-today' : ''}"><span>${esc(r.days)}</span><b>${esc(r.time)}</b></li>`).join('')}</ul>` : '<p class="soon">Hours are being confirmed.</p>'}
</div>
<div class="visit"><span class="lbl">Find us</span><h3 class="dsp duo-h">Come hungry</h3>
${open ? chip(open) : ''}
${addr ? `<p class="addr">${esc(addr)}</p>` : ''}
${phone ? `<a class="ph" href="tel:${tel}">${esc(phone)}</a>` : ''}
<div class="r">${mapUrl ? `<a class="ul" href="${esc(mapUrl)}" rel="noopener" target="_blank"><span>Open in Google Maps</span></a>` : ''}</div>
${specHtml ? `<div style="margin-top:var(--s5)"><span class="lbl">Specials</span>${specHtml}</div>` : ''}</div></div></section>`;
}

function feastModules(v) {
  const { modList, delAll } = v;
  const on = modList.filter(m => m.on).length;
  return `<section class="sec wrapx mods-sec" id="more">
<div class="hd"><div class="t"><span class="lbl">Online</span><h2 class="dsp">Order &amp; more</h2></div><p class="side">${on ? 'Live now at this location.' : 'Nothing live at this location yet. Everything here is wired and waiting.'}</p></div>
<ul class="mods">${modList.map(m => modRow(m, 'mod')).join('')}</ul>
<div class="dlv"><span class="mn">06</span><div><h3>Delivery apps</h3><p>${delAll.length ? 'Order from us through a delivery app. Links open the app or its website.' : 'Delivery links appear here the moment the location is connected. Until then, call us and we will sort you out.'}</p></div>${delAll.length ? `<div class="dlinks">${delAll.map(d => `<a href="${esc(d.u)}" rel="noopener" target="_blank">${esc(d.n)}</a>`).join('')}</div>` : '<span class="msoon">Coming soon</span>'}</div>
</section>`;
}

function feastMenu(v) {
  const { menuHtml, cats, tel } = v;
  return `<section class="sec wrapx menu-sec" id="menu">
<div class="hd"><div class="t"><span class="lbl">What's on</span><h2 class="dsp">The buffet</h2></div><p class="side">One price, and the line keeps moving. What is out changes as the day goes on, so the second pass is never the same as the first.</p></div>
${cats.length ? `<div class="mgrid">${menuHtml}</div>` : `<div class="menu-off"><div class="mo-l"><div class="rule" aria-hidden="true"></div><p class="big">The board is still being written</p></div><div class="mo-r"><p class="mo-lead">The exact dishes rotate, and we would rather tell you the truth than print a menu that goes stale by Tuesday. Here is what never changes.</p><ul class="mo-facts"><li><span>Price</span><b>One price. Go back as often as you like.</b></li><li><span>The line</span><b>Kept full from open to close</b></li><li><span>Today</span><b>${tel ? 'Call the restaurant' : 'Ask at the door'}</b></li></ul>${tel ? `<p class="mo-cta"><a class="sq" href="tel:${tel}">Call for today's lineup${arrow}</a></p>` : ''}</div></div>`}
</section>`;
}

function feastFamilies(v) {
  return `<section class="fam" id="families"><div class="wrapx in">
<div><span class="lbl">${esc(CFG.fam.eyebrow)}</span><h2 class="dsp">${esc(CFG.fam.title)}</h2></div>
<ol>${CFG.fam.items.map((x, i) => `<li data-rv><b>${String(i + 1).padStart(2, '0')}</b><div><strong>${esc(x[0])}</strong><p>${esc(x[1])}</p></div></li>`).join('')}</ol>
</div></section>`;
}

function feastFooter(v) {
  const { locs, cLocs, tel, phone, socLinks, modList, menuHtml } = v;
  const nav = [['#stations', 'The hall'], ['#locations', 'Locations'], ['#hours', 'Hours'], ['#menu', 'Menu'], ['#more', 'Order & more'], ['#families', 'Families']];
  return `<footer><div class="wrapx">
<div class="fgrid">
<div class="fbrand"><a class="logo" href="${esc(v.q({}))}" aria-label="${esc(v.name)} home">${CFG.logos[v.th.logo]}</a><p>${esc(CFG.footLine)}</p></div>
<div class="fcol"><h4>Explore</h4><ul>${nav.map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul></div>
<div class="fcol"><h4>Find us</h4><ul>${locs.map(l => `<li><span class="nm">${esc(l.name)}</span><br>${esc(l.address || '')}${l.phone ? `<br><a href="tel:+1${String(l.phone).replace(/\D/g, '')}">${esc(l.phone)}</a>` : ''}</li>`).join('')}</ul></div>
<div class="fcol"><h4>Online</h4><ul>${modList.filter(m => m.on && m.url).map(m => `<li><a href="${esc(m.url)}" rel="noopener"${m.ext ? ' target="_blank"' : ''}>${esc(m.title)}</a></li>`).join('') || '<li class="sm">Online ordering, reservations and more arrive as they go live.</li>'}${socLinks.map(s => `<li><a href="${esc(s.u)}" rel="noopener" target="_blank">${esc(s.n)}</a></li>`).join('')}</ul></div>
</div>
${tel ? `<p style="margin-top:var(--s4)"><a class="sq" href="tel:${tel}">Call ${esc(v.loc ? v.loc.name : v.name)}${arrow}</a></p>` : ''}
<div class="fbot"><span>&copy; ${new Date().getFullYear()} ${esc(v.name)}. All rights reserved.</span><span>Powered by Mother Sauce</span></div>
</div>
${lnCredit('feast')}</footer>`;
}

function feastBody(v) {
  const mq = CFG.marquee.map(x => `<span>${esc(x)}</span>`).join('<i>★</i>') + '<i>★</i>';
  return `${feastHeader(v)}
<main>
${feastHero(v)}
<div class="tick" aria-hidden="true"><div class="in">${mq}${mq}${mq}${mq}${mq}${mq}</div></div>
<div class="pend" aria-hidden="true">${['#E0281E','#F5A623','#3D5AFE','#E0281E','#8E44AD','#F5A623','#3D5AFE','#E0281E','#F5A623'].map(c => `<i style="--c:${c}"></i>`).join('')}</div>
${feastStations(v)}
${feastFamilies(v)}
<div class="plank" aria-hidden="true"></div>
${feastLocations(v)}
<div class="room"><img src="/img/${CFG.img.room}.webp" alt="${esc(CFG.img.roomAlt)}" loading="lazy" decoding="async" width="1400" height="900"><div class="in"><h2 class="dsp">${esc(CFG.roomLine)}</h2><span class="cap">Illustration</span></div></div>
${feastHours(v)}
${feastMenu(v)}
${feastModules(v)}
</main>
${feastFooter(v)}`;
}

// ================= TASTE OF CHINA: lacquer + rice paper editorial =================
const TOC_CSS = `*,*:before,*:after{box-sizing:border-box;border-radius:0!important}
/* buttons get a small radius; cards and panels stay square */
:root{--r-s:6px;--r-m:10px;--r-l:12px}
.sq,.ordcta,.seal-btn,.sw>button,.burger,.drawer .x,.oc,.dlinks a,.mgo,.seal,.logo,.drawer .df .sw a{border-radius:var(--r-s)!important}
.mod .jobs li,.msoon{border-radius:4px!important}
.frame{border-radius:var(--r-l)!important}
.frame:before{border-radius:8px!important}
.frame .imw{border-radius:3px!important}
.stamp{border-radius:9px!important}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
:root{--strip:96px;--max:1200px;--col:670px;--g:clamp(24px,4.4vw,68px);--pvh:28px;--hh:80px;
--s1:8px;--s2:16px;--s3:24px;--s4:40px;--s5:64px;--s6:clamp(80px,9vw,140px);--s7:clamp(104px,12vw,190px);
--hair:rgba(20,17,15,.22);--ease:cubic-bezier(.22,.61,.36,1);
--t-h2:clamp(38px,4.4vw,64px);--t-h3:clamp(34px,3.6vw,52px);--t-h4:clamp(24px,2.6vw,34px);--t-b:var(--fs);--msr:36ch;--msr-wide:52ch;--num-col:46px}
body{--fs:19px;margin:0;background:var(--bg);color:var(--fg);font:19px/1.68 'Cormorant Garamond',Georgia,'Times New Roman',serif;overflow-x:hidden;-webkit-font-smoothing:antialiased}
body:before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:url(__PATTERN__);background-size:460px;opacity:.5}
img,video{max-width:100%}img{display:block}
a{color:inherit;text-decoration:none}
h1,h2,h3,h4,p,figure{margin:0}h1,h2,h3{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;line-height:1.04;text-wrap:balance}p{text-wrap:pretty}
:where(a,button,[tabindex]):focus-visible{outline:2px solid var(--brand);outline-offset:4px}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.skip{position:absolute;left:var(--g);top:-100px;z-index:99;background:var(--brand);color:var(--bg);padding:12px 18px;font:500 11px/1 'Jost';letter-spacing:.2em;text-transform:uppercase}.skip:focus{top:8px}
.cap{font:500 10px/1 'Jost',system-ui,sans-serif;letter-spacing:.32em;text-transform:uppercase}
.rn{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:500}

/* preview banner sits above everything, full width */
.pv{position:fixed;inset:0 0 auto;z-index:70;height:var(--pvh);display:flex;align-items:center;justify-content:center;
background:var(--ink);color:var(--gold);font:500 9.5px/1 'Jost';letter-spacing:.3em;text-transform:uppercase;border-bottom:1px solid rgba(201,162,75,.45)}

/* left rail */
.strip{position:fixed;left:0;top:var(--pvh);bottom:0;width:var(--strip);z-index:50;display:flex;flex-direction:column;align-items:center;
padding:var(--s4) 0 var(--s4);gap:var(--s3);border-right:1px solid rgba(201,162,75,.55);
background:
radial-gradient(circle at 20% 30%,rgba(243,233,210,.055) 0 1px,transparent 2px) 0 0/9px 9px,
radial-gradient(circle at 72% 64%,rgba(201,162,75,.09) 0 1px,transparent 2px) 0 0/13px 13px,
linear-gradient(180deg,#131A2B,#0D1220 55%,#131A2B)}
.strip .seal{width:52px;height:52px;background:var(--brand);color:#F6EBD2;display:grid;place-items:center;
font:600 20px/1 'Cormorant Garamond';outline:1px solid var(--gold);outline-offset:3px;flex:none;transition:outline-offset .25s}
.strip .seal:hover{outline-offset:6px}
.strip .vt{writing-mode:vertical-rl;font:600 24px/1 'Cormorant Garamond';letter-spacing:.34em;text-transform:uppercase;color:var(--gold);margin-top:var(--s2)}
.strip .rail{margin-top:var(--s3);display:flex;flex-direction:column;gap:var(--s3);align-items:center}
.strip .rail a{writing-mode:vertical-rl;font:500 9px/1 'Jost';letter-spacing:.28em;text-transform:uppercase;color:rgba(243,233,210,.62);padding:6px 0;position:relative}
.strip .rail a:after{content:"";position:absolute;left:50%;bottom:-4px;width:0;height:1px;background:var(--gold);transform:translateX(-50%);transition:width .25s}
.strip .rail a:hover{color:var(--gold)}.strip .rail a:hover:after{width:18px}
.strip .vs{margin-top:auto;writing-mode:vertical-rl;color:rgba(243,233,210,.48);font:500 9px/1 'Jost';letter-spacing:.26em;text-transform:uppercase}

.page{margin-left:var(--strip)}
.in{padding-inline:var(--g)}
.col{max-width:var(--col);margin-inline:auto}

/* header: transparent over the hero, solid after scroll */
.hdr{position:fixed;top:var(--pvh);left:var(--strip);right:0;z-index:45;height:var(--hh);display:flex;align-items:center;gap:var(--s3);
padding-inline:var(--g);border-bottom:1px solid transparent;transition:background .34s var(--ease),border-color .34s,height .34s,box-shadow .34s}
.scrolled .hdr{background:rgba(243,233,210,.97);border-bottom-color:rgba(158,27,20,.24);height:66px;backdrop-filter:blur(12px);box-shadow:0 1px 0 rgba(201,162,75,.5),0 10px 30px -24px rgba(0,0,0,.5)}
.hdr .logo{flex:none;display:block}.hdr .logo svg{height:62px;width:auto;display:block;transition:height .3s}
.hdr .logo svg.mk-dark,.drawer .dh .logo svg.mk-light{display:none}
.scrolled .hdr .logo svg.mk-light{display:none}
.scrolled .hdr .logo svg.mk-dark{display:block}
.scrolled .hdr .logo svg{height:40px}
.hdr nav{display:flex;gap:clamp(16px,2.4vw,38px);margin-left:auto;align-items:center}
.hdr nav a{font:500 10px/1 'Jost',sans-serif;letter-spacing:.26em;text-transform:uppercase;color:var(--fg);padding:10px 0;position:relative}
.hdr nav a:after{content:"";position:absolute;left:0;right:0;bottom:2px;height:1px;background:var(--brand);transform:scaleX(0);transform-origin:0 50%;transition:transform .3s var(--ease)}
.hdr nav a:hover{color:var(--brand)}.hdr nav a:hover:after{transform:scaleX(1)}
.hdr .hact{display:flex;align-items:center;gap:var(--s3);margin-left:var(--s3);padding-left:var(--s3);border-left:1px solid rgba(20,17,15,.2)}
.hdr .ordcta{display:inline-flex;align-items:center;min-height:38px;padding:0 15px;background:var(--brand);color:#F8EDD6;
font:500 9.5px/1 'Jost';letter-spacing:.22em;text-transform:uppercase;outline:1px solid var(--brand);outline-offset:2px;white-space:nowrap;transition:outline-offset .22s}
.hdr .ordcta:hover{outline-offset:6px}
.hdr .tel{font:500 11px/1 'Jost';letter-spacing:.16em;white-space:nowrap}
.hdr .tel:hover{color:var(--brand)}
/* header sits on the dark hero before scroll, so its text has to be light there */
.hdr nav a,.hdr .tel{color:rgba(243,233,210,.88)}
.hdr .hact{border-left-color:rgba(243,233,210,.28)}
.hdr .burger{border-color:rgba(243,233,210,.42)}
.hdr .burger span,.hdr .burger span:before,.hdr .burger span:after{background:#F3E9D2}
.scrolled .hdr nav a,.scrolled .hdr .tel{color:var(--fg)}
.scrolled .hdr .hact{border-left-color:rgba(20,17,15,.2)}
.scrolled .hdr .burger{border-color:rgba(20,17,15,.32)}
.scrolled .hdr .burger span,.scrolled .hdr .burger span:before,.scrolled .hdr .burger span:after{background:var(--fg)}
.burger{display:none;width:46px;height:46px;background:none;border:1px solid rgba(20,17,15,.32);cursor:pointer;padding:0;place-items:center;margin-left:auto}
.burger span,.burger span:before,.burger span:after{display:block;width:19px;height:1px;background:var(--fg);transition:transform .3s var(--ease),opacity .2s}
.burger span{position:relative;margin-inline:auto}
.burger span:before,.burger span:after{content:"";position:absolute;left:0}.burger span:before{top:-6px}.burger span:after{top:6px}
.nav-open .burger span{transform:rotate(45deg)}.nav-open .burger span:before{transform:translateY(6px) rotate(-90deg)}.nav-open .burger span:after{opacity:0}
.drawer{position:fixed;inset:0;z-index:80;background:linear-gradient(180deg,#131A2B,#0B0F1A);color:#F3E9D2;display:flex;flex-direction:column;
padding:calc(var(--pvh) + 20px) var(--g) var(--s5);transform:translateY(-100%);visibility:hidden;transition:transform .46s var(--ease),visibility .46s}
.nav-open .drawer{transform:none;visibility:visible}
.drawer .dh{display:flex;align-items:center;justify-content:space-between;padding-bottom:var(--s3);border-bottom:1px solid rgba(201,162,75,.5)}
.drawer .dh .logo svg{height:38px;width:auto;display:block}
.drawer .x{width:46px;height:46px;background:none;border:1px solid rgba(201,162,75,.5);color:var(--gold);font:300 24px/1 'Jost';cursor:pointer}
.drawer nav{margin-top:var(--s4);display:flex;flex-direction:column;border-top:1px solid rgba(201,162,75,.34)}
.drawer nav a{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(30px,8.4vw,42px);font-weight:600;line-height:1.15;padding:12px 0;
border-bottom:1px solid rgba(201,162,75,.34);display:flex;justify-content:space-between;align-items:baseline;gap:var(--s3);color:#F3E9D2}
.drawer nav a em{font:500 9px/1 'Jost';letter-spacing:.28em;font-style:normal;color:var(--gold)}
.drawer nav a:hover{color:var(--gold)}
.drawer .df{margin-top:auto;padding-top:var(--s4);display:flex;flex-direction:column;gap:12px}
.drawer .df .tel{font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;color:var(--gold)}
.drawer .df .cap{color:rgba(243,233,210,.6)}

/* hero with video */
.hero{position:relative;isolation:isolate;min-height:min(880px,calc(100svh - var(--pvh)));display:flex;align-items:center;overflow:hidden;
padding:calc(var(--hh) + var(--pvh) + var(--s5)) var(--g) var(--s6)}
.hero .media{position:absolute;inset:0;z-index:-2}
.hero .hposter{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 1s var(--ease)}
.hero.vid-live video{opacity:1}
.hero .hposter.kb{transform:scale(1.06);transform-origin:50% 50%;will-change:transform}
@media(prefers-reduced-motion:no-preference){.hero .hposter.kb{animation:lnkb 34s ease-in-out infinite}}
@keyframes lnkb{0%{transform:scale(1.06) translate(-1.2%,0)}50%{transform:scale(1.06) translate(1.2%,0)}100%{transform:scale(1.06) translate(-1.2%,0)}}
.hero .scrim{position:absolute;inset:0;z-index:-1;background:
linear-gradient(90deg,rgba(15,10,9,.9) 0%,rgba(15,10,9,.74) 42%,rgba(15,10,9,.34) 72%,rgba(6,9,16,.55) 100%),
linear-gradient(0deg,rgba(10,7,6,.92) 0%,rgba(10,7,6,.4) 34%,rgba(10,7,6,.05) 70%)}
.hero .wrapx{width:100%}
.hero .tx{max-width:760px;color:#F3E9D2}
.hero .kick{display:flex;align-items:center;gap:var(--s3);color:var(--gold);margin-bottom:var(--s3);flex-wrap:wrap}
.hero .kick:after{content:"";width:56px;height:1px;background:rgba(201,162,75,.6)}
.hero h1{font-size:clamp(52px,6.4vw,104px);line-height:.98;letter-spacing:-.012em}
.hero h1 i{font-style:italic;font-weight:500}
.hero h1 .loc{color:var(--gold);font-style:italic;font-weight:500}
.hero .lead{font-size:clamp(19px,1.6vw,23px);line-height:1.56;max-width:38ch;margin-top:var(--s3);color:rgba(243,233,210,.86)}
.hero .seals{display:flex;gap:var(--s3);flex-wrap:wrap;margin-top:var(--s4)}
.hero .meta{margin-top:var(--s4);padding-top:var(--s3);border-top:1px solid rgba(201,162,75,.34);display:flex;align-items:center;gap:var(--s3);flex-wrap:wrap;max-width:640px}
.hero .meta .ad{font-size:15px;line-height:1.5;color:rgba(243,233,210,.82)}
.hero .oc{color:#F3E9D2;border-color:rgba(243,233,210,.4);background:rgba(11,10,9,.5)}

/* open-now chip */
.oc{display:inline-flex;align-items:center;gap:9px;min-height:32px;padding:0 13px 0 11px;border:1px solid rgba(20,17,15,.3);
font:500 9.5px/1 'Jost';letter-spacing:.2em;text-transform:uppercase;white-space:nowrap}
.oc i{width:6px;height:6px;background:#2E7D4F;flex:none;box-shadow:0 0 0 3px rgba(46,125,79,.2)}
.oc.closed i{background:var(--brand);box-shadow:0 0 0 3px rgba(158,27,20,.18)}
@media(prefers-reduced-motion:no-preference){.oc.open i{animation:pulse 2.8s ease-in-out infinite}}
@keyframes pulse{0%,100%{box-shadow:0 0 0 3px rgba(46,125,79,.22)}50%{box-shadow:0 0 0 6px rgba(46,125,79,.05)}}

/* seal buttons (TOC control) */
.seal-btn{width:118px;height:118px;background:var(--brand);color:#F8EDD6;display:flex;flex-direction:column;justify-content:center;align-items:center;
text-align:center;outline:1px solid var(--brand);outline-offset:5px;font:600 21px/1 'Cormorant Garamond';letter-spacing:.08em;text-transform:uppercase;
transition:outline-offset .28s var(--ease),background .22s}
.seal-btn small{font:500 8px/1.35 'Jost',sans-serif;letter-spacing:.2em;margin-top:9px;opacity:.9;max-width:94px}
.seal-btn:hover{outline-offset:9px}
.seal-btn.alt{background:transparent;color:#F3E9D2;outline-color:rgba(243,233,210,.72)}
.seal-btn.alt:hover{background:rgba(243,233,210,.1)}
.hero .seal-btn.alt{color:var(--gold);outline-color:rgba(201,162,75,.7)}
.sq{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 26px;background:var(--brand);color:#F8EDD6;
font:500 10px/1 'Jost';letter-spacing:.24em;text-transform:uppercase;outline:1px solid var(--brand);outline-offset:3px;transition:outline-offset .25s,background .2s}
.sq:hover{outline-offset:7px}
.ul{display:inline-flex;align-items:center;font:500 10px/1 'Jost';letter-spacing:.24em;text-transform:uppercase;padding:8px 0;border-bottom:1px solid var(--brand)}
.ul:hover{color:var(--brand)}

/* navy band + rods */
.navyband{background:var(--navy);color:rgba(243,233,210,.92);padding:15px var(--g);display:flex;flex-wrap:wrap;justify-content:center;
gap:8px clamp(18px,3vw,40px);border-block:1px solid var(--gold);font:500 9.5px/1.9 'Jost';letter-spacing:.28em;text-transform:uppercase}
.navyband span{white-space:nowrap;display:inline-flex;align-items:center}
.navyband span:before{content:"";width:5px;height:5px;background:var(--gold);transform:rotate(45deg);margin-right:12px;flex:none}
.rod{height:1px;background:linear-gradient(90deg,transparent,rgba(201,162,75,.55),transparent);position:relative;max-width:var(--max);margin-inline:auto}
.rod:before,.rod:after{content:"";position:absolute;top:-4px;width:9px;height:9px;border:1px solid var(--gold);transform:rotate(45deg);background:var(--bg)}
.rod:before{left:0}.rod:after{right:0}

/* section rhythm */
.blk{padding-block:var(--s6);position:relative;max-width:var(--max);margin-inline:auto;padding-inline:var(--g)}
.ttl{margin-bottom:var(--s5);max-width:52ch;padding-bottom:var(--s3);border-bottom:1px solid rgba(20,17,15,.14)}
.ttl .ch{display:flex;align-items:center;gap:var(--s3);color:var(--brand);margin-bottom:var(--s3)}
.ttl .ch .rn{font-size:15px;letter-spacing:.1em;color:var(--brand)}
.ttl .ch .ln{flex:0 0 60px;height:1px;background:var(--gold)}
.ttl h2{font-size:var(--t-h2);letter-spacing:-.01em}
.ttl .sub{margin-top:var(--s2);font-size:17px;color:var(--mut);max-width:var(--msr-wide)}
[data-rv]{opacity:0;transform:translateY(16px);transition:opacity .8s var(--ease),transform .8s var(--ease)}
[data-rv].in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){[data-rv]{opacity:1;transform:none;transition:none}}

/* chaptered editorial photo frames */
.chapter{display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:calc(var(--s5) + var(--s2));align-items:center;padding-block:var(--s5)}
.chapter+.chapter{border-top:1px solid rgba(20,17,15,.12)}
.chapter:nth-of-type(even){grid-template-columns:minmax(0,5fr) minmax(0,7fr)}
.chapter:nth-of-type(even) .frame{order:2}
.frame{position:relative;padding:12px;background:linear-gradient(140deg,#241207,#0F0703 58%,#241207);box-shadow:0 34px 70px -38px rgba(0,0,0,.55)}
.frame:before{content:"";position:absolute;inset:6px;border:1px solid rgba(201,162,75,.55);pointer-events:none;z-index:2}
.frame .imw{position:relative;overflow:hidden;aspect-ratio:5/4}
.frame img{width:100%;height:100%;object-fit:cover;object-position:center;display:block;transition:transform 1.2s var(--ease)}
.frame:hover img{transform:scale(1.03)}
.chapter .body .ch{display:flex;align-items:center;gap:var(--s3);margin-bottom:var(--s3);color:var(--gold)}
.chapter .body .ch .rn{font-size:14px;color:var(--gold)}
.chapter .body .ch .ln{flex:1;height:1px;background:rgba(201,162,75,.55);max-width:80px}
.chapter h3{font-size:var(--t-h3);line-height:1.05;margin-bottom:var(--s2)}
.chapter p{font-size:var(--t-b);line-height:1.62;color:var(--mut);max-width:var(--msr)}
.chapter .rule{width:46px;height:1px;background:var(--gold);margin-top:var(--s3)}
.chapter .tag{margin-top:var(--s2);font:500 9px/1 'Jost';letter-spacing:.24em;text-transform:uppercase;color:var(--brand)}
.stamp{position:absolute;right:-14px;top:-14px;width:70px;height:70px;background:var(--brand);color:#F8EDD6;display:grid;place-items:center;
font:600 26px/1 'Cormorant Garamond';outline:1px solid var(--gold);outline-offset:3px;z-index:3}
.stamp.sm{width:58px;height:58px;font-size:21px;right:-12px;top:-12px}

/* lacquer/navy detail band */
.band{background:linear-gradient(100deg,#0E1420 0%,#172034 46%,#0E1420 100%);color:rgba(243,233,210,.9);position:relative;overflow:hidden;padding-block:var(--s5)}
.band:before,.band:after{content:"";position:absolute;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(201,162,75,.7) 12%,rgba(201,162,75,.7) 88%,transparent)}
.band:before{top:14px}.band:after{bottom:14px}
.band .in{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s4);max-width:var(--max);margin-inline:auto;align-items:center}
.band .bn{text-align:center;padding-inline:var(--s2)}
.band .bn .n{font:600 40px/1 'Cormorant Garamond';color:var(--gold);letter-spacing:.02em}
.band .bn .t{margin-top:10px;font:500 9.5px/1.7 'Jost';letter-spacing:.26em;text-transform:uppercase;color:rgba(243,233,210,.72)}
.band .bn+.bn{border-left:1px solid rgba(201,162,75,.34)}

/* hours + visit */
.hours-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:calc(var(--s5) + var(--s2));align-items:start}
.hours-grid>div:first-child>.hrs{margin-top:0}
.hrs{list-style:none;margin:var(--s4) 0 0;padding:0;border-top:1px solid rgba(201,162,75,.55)}
.hrs li{display:grid;grid-template-columns:auto minmax(20px,1fr) auto;align-items:baseline;gap:var(--s2);padding:11px 0;
font-size:clamp(18px,1.7vw,22px);border-bottom:1px solid rgba(20,17,15,.14)}
.hrs .ln{border-bottom:1px dotted rgba(20,17,15,.32);transform:translateY(-4px)}
.hrs .t{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.hrs li.is-today .d{color:var(--brand);font-weight:600}.hrs li.is-today .t{color:var(--brand);font-weight:600}
.hrs li.is-today .d:before{content:"";display:inline-block;width:4px;height:4px;background:var(--brand);transform:rotate(45deg);margin-right:9px;vertical-align:.24em}
.visit .cap{color:var(--brand);display:block;margin-bottom:var(--s2)}
.visit .ad{font-size:clamp(20px,1.9vw,26px);line-height:1.42;margin-bottom:var(--s2)}
.visit .ph{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(24px,2.2vw,32px);color:var(--brand);display:inline-block;margin-bottom:var(--s2)}
.visit .ph:hover{color:var(--fg)}
.visit .oc{margin-bottom:var(--s3)}
.visit .r{display:flex;gap:var(--s3);flex-wrap:wrap;margin-top:var(--s2)}
.spec{list-style:none;margin:var(--s2) 0 0;padding:0}
.spec li{padding:10px 0;border-bottom:1px solid rgba(20,17,15,.14);font-size:17px;line-height:1.55;color:var(--mut)}
.spec li strong{font-weight:600;color:var(--fg)}

/* family panel */
.fam{position:relative;background:linear-gradient(165deg,#121A2B,#0C1019 70%);color:#F3E9D2;padding-block:var(--s6);overflow:hidden}
.fam .wrapf{max-width:var(--max);margin-inline:auto;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:calc(var(--s5) + var(--s2));align-items:start;padding-inline:var(--g)}
.fam .stamp{width:86px;height:86px;font-size:32px;position:static;margin-bottom:var(--s4);outline-offset:4px}
.fam .cap{color:var(--gold);display:block;margin-bottom:var(--s2)}
.fam h2{font-size:var(--t-h2);color:#F7EFDC}
.fam .lead2{margin-top:var(--s3);font-size:16px;line-height:1.6;color:rgba(243,233,210,.62);max-width:var(--msr);font-family:'Jost',sans-serif}
.fam ol{list-style:none;margin:0;padding:0;border-top:1px solid rgba(201,162,75,.55)}
.fam li{display:grid;grid-template-columns:56px 1fr;gap:var(--s3);padding:var(--s3) 0;border-bottom:1px solid rgba(201,162,75,.34)}
.fam li .rn{font-size:20px;color:var(--gold);line-height:1.2}
.fam li strong{display:block;font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(22px,2.1vw,28px);font-weight:600;line-height:1.16;margin-bottom:5px;color:#F7EFDC}
.fam li p{color:rgba(243,233,210,.76);font-size:17px;line-height:1.6;max-width:var(--msr)}

/* room */
.room{max-width:var(--max);margin-inline:auto;padding-inline:var(--g);padding-block:var(--s6)}
.room .frame .imw{aspect-ratio:21/9;min-height:0}
.room .ov{position:absolute;inset:12px;display:flex;flex-direction:column;justify-content:flex-end;padding:calc(var(--s4) + 8px);z-index:1;
background:linear-gradient(0deg,rgba(9,7,6,.82),rgba(9,7,6,.12) 62%)}
.room h2{color:#F7EFDC;font-size:clamp(30px,3.6vw,54px);max-width:20ch}
.room .cap{color:var(--gold);margin-top:var(--s2);display:block}

/* modules */
.mods{list-style:none;margin:0;padding:0;border-top:1px solid rgba(201,162,75,.55)}
.mod{display:grid;grid-template-columns:var(--num-col) minmax(0,1fr) auto;gap:var(--s3);align-items:start;padding:var(--s4) 0;border-bottom:1px solid rgba(20,17,15,.16);min-height:calc(var(--s4) * 2 + 78px)}
.mod .mn{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:20px;line-height:1;letter-spacing:.02em;color:var(--gold);padding-top:4px}
.mod .mb h3{font-size:var(--t-h4);line-height:1.1;margin-bottom:6px}
.mod .mb p{font-size:16.5px;line-height:1.58;max-width:var(--msr-wide);color:var(--mut)}
.mod[data-state="off"] .mb h3{color:rgba(20,17,15,.55)}
.mod[data-state="off"] .mb p{color:rgba(90,79,69,.85);font-style:italic}
.mod .mgo{align-self:center;display:inline-grid;place-items:center;min-height:46px;padding:0 22px;background:var(--brand);color:#F8EDD6;
font:500 9.5px/1 'Jost';letter-spacing:.26em;text-transform:uppercase;outline:1px solid var(--brand);outline-offset:3px;transition:outline-offset .25s,background .2s}
.mod .mgo:hover{outline-offset:7px}
.mod .msoon{align-self:center;font:500 9px/1 'Jost';letter-spacing:.26em;text-transform:uppercase;color:rgba(20,17,15,.5);
border-bottom:1px solid rgba(20,17,15,.28);padding-bottom:5px;white-space:nowrap}
.mod .jobs{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.mod .jobs li{font:500 9.5px/1 'Jost';letter-spacing:.18em;text-transform:uppercase;color:var(--brand);border:1px solid rgba(158,27,20,.32);padding:8px 10px}
.dlv{margin-top:var(--s5);padding-top:var(--s4);border-top:1px solid rgba(201,162,75,.55);display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap:var(--s3);align-items:start}
.dlv .mn{font:500 11px/1 'Jost';letter-spacing:.2em;color:rgba(20,17,15,.42);padding-top:9px}
.dlv h3{font-size:clamp(22px,2.3vw,30px);line-height:1.1;margin-bottom:5px}
.dlv p{font-size:16px;line-height:1.58;color:var(--mut);max-width:50ch}
.dlinks{align-self:center;display:flex;flex-wrap:wrap;gap:8px}
.dlinks a{display:inline-grid;place-items:center;min-height:42px;padding:0 16px;border:1px solid rgba(20,17,15,.34);
font:500 9.5px/1 'Jost';letter-spacing:.22em;text-transform:uppercase;transition:background .2s,color .2s,border-color .2s}
.dlinks a:hover{background:var(--navy);color:var(--gold);border-color:var(--navy)}
.dlv .msoon{align-self:center;font:500 9px/1 'Jost';letter-spacing:.26em;text-transform:uppercase;color:rgba(20,17,15,.5);border-bottom:1px solid rgba(20,17,15,.28);padding-bottom:5px;white-space:nowrap}

/* menu */
.menu-sec .ttl{margin-bottom:var(--s4)}
.mcats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s5) calc(var(--s5) + var(--s2))}
.mcat h3{font-size:clamp(24px,2.4vw,32px);line-height:1.1;padding-bottom:8px;border-bottom:1px solid var(--gold);margin-bottom:var(--s2)}
.mcat ul{list-style:none;margin:0;padding:0}
.mcat li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:var(--s2);align-items:baseline;padding:9px 0;border-bottom:1px solid rgba(20,17,15,.12)}
.mi{font-size:18px;font-weight:600}
.md{grid-column:1;font-size:15px;line-height:1.5;color:var(--mut);margin-top:-2px}
.pr{font-variant-numeric:tabular-nums;color:var(--brand);font-weight:600;white-space:nowrap}
.menu-off{display:grid;grid-template-columns:minmax(0,6fr) minmax(0,6fr);gap:calc(var(--s5) + var(--s2));align-items:start}
.menu-off .big{font-family:'Cormorant Garamond',Georgia,serif;font-size:clamp(30px,3.4vw,50px);line-height:1.08;font-style:italic;font-weight:500;color:rgba(20,17,15,.62)}
.menu-off p{font-size:18px;line-height:1.62;color:var(--mut);max-width:44ch;margin-bottom:var(--s3)}
.menu-off .g{width:52px;height:1px;background:var(--gold);margin-bottom:var(--s3)}
.menu-off .mo-r{display:flex;flex-direction:column;gap:var(--s4);padding-top:4px}
.menu-off .mo-lead{font-size:var(--t-b);line-height:1.62;color:var(--mut);max-width:var(--msr-wide);margin:0}
.menu-off .mo-facts{list-style:none;margin:0;padding:0;border-top:1px solid rgba(20,17,15,.16)}
.menu-off .mo-facts li{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);gap:var(--s4);align-items:baseline;padding:13px 0;border-bottom:1px solid rgba(20,17,15,.16)}
.menu-off .mo-facts span{font:500 9px/1 'Jost';letter-spacing:.26em;text-transform:uppercase;color:rgba(20,17,15,.5)}
.menu-off .mo-facts b{font-weight:500;font-size:17px;color:var(--fg);text-align:right}
.menu-off .mo-cta{margin:0}
.menu-off .mo-l{display:flex;flex-direction:column}

/* footer */
footer{background:linear-gradient(180deg,#121A2B,#0B0F1A);color:#F3E9D2;margin-left:0;padding-block:var(--s5) var(--s4);margin-top:0;border-top:1px solid rgba(201,162,75,.55)}
.fgrid{display:grid;grid-template-columns:1.5fr 1fr 1.2fr 1fr;gap:var(--s5) var(--s4);max-width:var(--max);margin-inline:auto;padding-inline:var(--g)}
.fbrand .logo{display:block;margin-bottom:var(--s3)}.fbrand .logo svg{height:42px;width:auto;filter:brightness(0) invert(1) sepia(.28) saturate(2.4) hue-rotate(3deg)}
.fbrand p{font-family:'Jost',sans-serif;font-size:13px;line-height:1.65;color:rgba(243,233,210,.6);max-width:30ch}
.fcol h4{font:500 9px/1 'Jost';letter-spacing:.28em;text-transform:uppercase;color:var(--gold);margin-bottom:var(--s3)}
.fcol ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.fcol a,.fcol li{font-family:'Jost',sans-serif;font-size:13px;line-height:1.55;color:rgba(243,233,210,.76)}
.fcol a:hover{color:var(--gold)}
.fcol .nm{font-family:'Cormorant Garamond',Georgia,serif;font-size:19px;color:var(--gold);display:block;line-height:1.2}
.fbot{max-width:var(--max);margin:var(--s5) auto 0;padding:var(--s3) var(--g) 0;border-top:1px solid rgba(201,162,75,.3);
display:flex;justify-content:space-between;gap:var(--s3);flex-wrap:wrap;font:500 9px/1.7 'Jost';letter-spacing:.24em;text-transform:uppercase;color:rgba(243,233,210,.5)}
.fbot a:hover{color:var(--gold)}

/* Loaded Nacho footer credit: shared v2 block + Taste of China vars. Box matches .fbot so the hairline lines up. Label is the site's own muted cream, not the generic warm beige, which reads muddy on the navy. */
${LN_CREDIT_CSS}
.ln-credit{max-width:var(--max);margin:var(--s3) auto 0;padding-inline:var(--g);
  --lnc-label:rgba(243,233,210,.72);--lnc-loaded:#F3E9D2;--lnc-rule:rgba(201,162,75,.3)}

/* responsive */
@media(max-width:1240px){.fgrid{grid-template-columns:1fr 1fr}}
@media(max-width:1100px){
:root{--strip:76px;--g:clamp(24px,3.4vw,44px)}
.strip .vt{font-size:20px;letter-spacing:.28em}.strip .seal{width:44px;height:44px;font-size:17px}
.chapter,.chapter:nth-of-type(even){grid-template-columns:minmax(0,6fr) minmax(0,6fr);gap:var(--s4)}
.mcats{grid-template-columns:1fr}
}
@media(max-width:980px){
.hdr nav,.hdr .hact{display:none}
.burger{display:grid}
.strip{display:none}
.page{margin-left:0}
.hdr{left:0}
.hours-grid,.fam .wrapf,.menu-off{grid-template-columns:1fr}
.band .in{grid-template-columns:1fr;gap:var(--s4)}
.band .bn+.bn{border-left:0;border-top:1px solid rgba(201,162,75,.3);padding-top:var(--s4)}
.chapter,.chapter:nth-of-type(even){grid-template-columns:1fr}
.chapter:nth-of-type(even) .frame{order:0}
.chapter .body{order:1}
}
@media(max-width:760px){
:root{--hh:64px;--s6:clamp(56px,12vw,80px);--g:22px}
.hero{min-height:0;display:block;padding:calc(var(--hh) + var(--pvh) + 34vh) 0 var(--s5);overflow:hidden}
.hero .tx{padding-inline:var(--g)}
.hero h1{font-size:clamp(40px,11.6vw,62px)}
.hero .lead{font-size:18px}
.hero .seal-btn{width:96px;height:96px;font-size:18px}.hero .seal-btn small{font-size:7.5px}
.hero .meta{display:block}.hero .oc{margin-top:10px}
.pv{font-size:8.5px;letter-spacing:.2em}
.hrs li{grid-template-columns:1fr auto;gap:4px 12px}
.hrs .ln{display:none}
.hrs li{padding:12px 0;border-bottom:1px solid rgba(20,17,15,.12)}
.mod,.dlv{grid-template-columns:34px minmax(0,1fr)}
.mod .mgo,.mod .msoon,.dlv .msoon,.dlinks{grid-column:2;justify-self:start;margin-top:var(--s2)}
.mod .mn,.dlv .mn{font-size:10px;padding-top:6px}
.frame{padding:9px}.frame:before{inset:4px}
.stamp{width:58px;height:58px;font-size:20px;right:-8px;top:-8px}
.room{padding-inline:var(--g)}.room .frame .imw{aspect-ratio:4/3;min-height:0}
.room .ov{padding:var(--s3)}
.mcats{gap:var(--s4)}
.fgrid{grid-template-columns:1fr;gap:var(--s4)}
footer{padding-block:var(--s4)}
.ttl h2{font-size:clamp(32px,8.4vw,44px)}
}
@media(max-width:420px){.hero h1{font-size:clamp(36px,11vw,50px)}.band .bn .n{font-size:32px}.chapter p{font-size:18px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.hero video{transition:none}.frame img{transition:none}}
`;

const RN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const sealChev = '<svg viewBox="0 0 9 6" aria-hidden="true" style="width:9px;height:6px;fill:none;stroke:currentColor;stroke-width:1.5"><path d="M1 1l3.5 3.5L8 1"/></svg>';

function tocHeader(v) {
  const nav = [['#chapters', 'The table'], ['#hours', 'Hours'], ['#family', 'Family'], ['#menu', 'Menu'], ['#more', 'Order & more']];
  const ord = v.modList[0];
  const ordBtn = ord.on && ord.url ? `<a class="ordcta" href="${esc(ord.url)}" rel="noopener" target="_blank">Order online</a>` : '';
  return `<div class="pv">Preview only. Not the live site.</div>
<aside class="strip" aria-label="${esc(v.name)}">
<a class="seal" href="${esc(v.q({}))}" aria-label="${esc(v.name)} home">${esc(CFG.sealText)}</a>
<div class="vt">${esc(v.name)}</div>
<nav class="rail" aria-label="Sections">${nav.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>
<div class="vs">${esc(CFG.eyebrow)}</div>
</aside>
<div class="page">
<header class="hdr">
<a class="logo" href="${esc(v.q({}))}" aria-label="${esc(v.name)} home">${CFG.logos[v.th.logo]}</a>
<nav aria-label="Main">${nav.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>
<div class="hact">${ordBtn}${v.tel ? `<a class="tel" href="tel:${v.tel}">${esc(v.phone)}</a>` : ''}</div>
<button class="burger" type="button" data-open-nav aria-expanded="false" aria-controls="drawer" aria-label="Open menu"><span></span></button>
</header>
<div class="drawer" id="drawer" data-drawer aria-label="Menu">
<div class="dh"><a class="logo" href="${esc(v.q({}))}" aria-label="${esc(v.name)} home">${CFG.logos[v.th.logo]}</a><button class="x" type="button" data-open-nav aria-label="Close menu">&times;</button></div>
<nav aria-label="Mobile">${nav.map(([h, t], i) => `<a href="${h}">${t}<em>${RN[i]}</em></a>`).join('')}</nav>
<div class="df">${v.tel ? `<a class="tel" href="tel:${v.tel}">${esc(v.phone)}</a>` : ''}<span class="cap">${esc(CFG.eyebrow)}</span></div></div>`;
}

function tocHero(v) {
  const { tel, phone, mapUrl, addr, open, MED } = v;
  return `<section class="hero" data-hero>
${heroMedia(v)}
<div class="wrapx"><div class="tx">
<p class="kick cap">${esc(CFG.eyebrow)}</p>
<h1>${CFG.headline}</h1>
<p class="lead">${esc(CFG.lead)}</p>
<div class="seals">${tel ? `<a class="seal-btn" href="tel:${tel}">Call<small>${esc(phone)}</small></a>` : ''}${mapUrl ? `<a class="seal-btn alt" href="${esc(mapUrl)}" rel="noopener" target="_blank">Visit<small>Directions</small></a>` : ''}<a class="seal-btn alt" href="#menu">Menu<small>See it</small></a></div>
${addr || open ? `<div class="meta">${open ? chip(open) : ''}${addr ? `<span class="ad">${esc(addr)}</span>` : ''}</div>` : ''}
</div></div></section>`;
}

function tocChapters(v) {
  const F = CFG.img.food, CH = CFG.chapters;
  const items = CH.map((c, i) => {
    const f = F.find(x => x.src === c.img) || F[i % F.length];
    return `<article class="chapter" data-rv>
<div class="frame"><div class="imw"><img src="/img/${f.src}.webp" alt="${esc(f.alt)}" loading="lazy" decoding="async" width="1400" height="1120"></div>${i === 1 ? '<span class="stamp" aria-hidden="true">家</span>' : ''}</div>
<div class="body"><div class="ch"><span class="rn">${RN[i]}</span><span class="ln" aria-hidden="true"></span></div><h3>${esc(c.name)}</h3><p>${esc(c.line)}</p>${f.real ? `<span class="tag">From our own kitchen</span>` : ''}<div class="rule" aria-hidden="true"></div></div>
</article>`;
  }).join('');
  return `<section class="blk in" id="chapters">
<div class="ttl"><div class="ch"><span class="rn cap">Chapters</span><span class="ln" aria-hidden="true"></span></div><h2>${esc(CFG.foodTitle)}</h2><p class="sub">${esc(CFG.foodSub)}</p></div>
${items}
<p class="cap" style="color:var(--mut);margin-top:var(--s4)">Photos are representative. Dishes vary day to day.</p>
</section>`;
}

function tocBand(v) {
  return `<div class="band" aria-hidden="true"><div class="in">${CFG.bandItems.map(b => `<div class="bn"><div class="n">${esc(b[0])}</div><div class="t">${esc(b[1])}</div></div>`).join('')}</div></div>`;
}

function tocHours(v) {
  const { hRows, addr, phone, tel, mapUrl, open, specHtml } = v;
  const dayNow = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date());
  return `<section class="blk in" id="hours">
<div class="ttl"><div class="ch"><span class="rn cap">Hours &amp; place</span><span class="ln" aria-hidden="true"></span></div><h2>Come sit with us</h2><p class="sub">Open seven days for lunch through dinner.</p></div>
<div class="hours-grid">
<div>${hRows.length ? `<ul class="hrs">${hRows.map(r => { const [a, b] = r.days.split('–'); const today = r.days.split('–').includes(dayNow) || r.days === dayNow; return `<li class="${today ? 'is-today' : ''}"><span class="d">${esc(v.longDay[a] || a)}${b ? ' – ' + esc(v.longDay[b] || b) : ''}</span><span class="ln" aria-hidden="true"></span><span class="t">${esc(r.time)}</span></li>`; }).join('')}</ul>` : '<p class="menu-off-p" style="font-style:italic;color:var(--mut)">Hours are being confirmed.</p>'}
${specHtml ? `<div style="margin-top:var(--s5)"><span class="cap" style="color:var(--brand);display:block;margin-bottom:var(--s2)">Specials</span>${specHtml}</div>` : ''}</div>
<div class="visit"><span class="cap">Find us</span>${open ? chip(open) : ''}
${addr ? `<p class="ad">${esc(addr)}</p>` : ''}
${phone ? `<a class="ph" href="tel:${tel}">${esc(phone)}</a>` : ''}
<div class="r">${mapUrl ? `<a class="ul" href="${esc(mapUrl)}" rel="noopener" target="_blank">Open in Google Maps</a>` : ''}</div>
</div></div></section>`;
}

function tocFamily(v) {
  return `<section class="fam" id="family"><div class="wrapf">
<div><div class="stamp" aria-hidden="true">家</div><span class="cap">${esc(CFG.fam.eyebrow)}</span><h2>${esc(CFG.fam.title)}</h2><p class="lead2">${esc(CFG.fam.lead)}</p></div>
<ol>${CFG.fam.items.map((x, i) => `<li data-rv><span class="rn">${RN[i]}</span><div><strong>${esc(x[0])}</strong><p>${esc(x[1])}</p></div></li>`).join('')}</ol>
</div></section>`;
}

function tocMenu(v) {
  const { cats, menuHtml, tel } = v;
  return `<section class="blk in menu-sec" id="menu">
<div class="ttl"><div class="ch"><span class="rn cap">What's on</span><span class="ln" aria-hidden="true"></span></div><h2>The buffet</h2><p class="sub">One price, and the line keeps moving. What is out shifts as the day goes on, which is the whole reason to take a second pass.</p></div>
${cats.length ? `<div class="mcats">${menuHtml}</div>` : `<div class="menu-off"><div class="mo-l"><div class="g" aria-hidden="true"></div><p class="big">The kitchen is still writing it</p></div><div class="mo-r"><p class="mo-lead">Specific dishes change with the day, and we would rather say so than post a menu that is wrong by the weekend. Here is what holds steady.</p><ul class="mo-facts"><li><span>Price</span><b>One price. As many passes as you want.</b></li><li><span>The line</span><b>Refilled all through service</b></li><li><span>Today</span><b>${tel ? 'Call the restaurant' : 'Ask at the door'}</b></li></ul>${tel ? `<p class="mo-cta"><a class="sq" href="tel:${tel}">Call for today's lineup</a></p>` : ''}</div></div>`}
</section>`;
}

function tocModules(v) {
  const { modList, delAll } = v;
  const on = modList.filter(m => m.on).length;
  return `<section class="blk in" id="more">
<div class="ttl"><div class="ch"><span class="rn cap">Online</span><span class="ln" aria-hidden="true"></span></div><h2>Order &amp; more</h2><p class="sub">${on ? 'Available now.' : 'Wired and waiting. Nothing is live here yet.'}</p></div>
<ul class="mods">${modList.map((m, i) => modRow({ ...m, n: RN[i] || m.n }, 'mod')).join('')}</ul>
<div class="dlv"><span class="mn">VI</span><div><h3>Delivery apps</h3><p>${delAll.length ? 'Order through a delivery app. Links open the app or its website.' : 'Delivery links appear here as soon as the restaurant is connected. Until then, call us.'}</p></div>${delAll.length ? `<div class="dlinks">${delAll.map(d => `<a href="${esc(d.u)}" rel="noopener" target="_blank">${esc(d.n)}</a>`).join('')}</div>` : '<span class="msoon">Coming soon</span>'}</div>
</section>`;
}

function tocFooter(v) {
  const { socLinks, modList, tel, phone } = v;
  const nav = [['#chapters', 'The table'], ['#hours', 'Hours'], ['#family', 'Family'], ['#menu', 'Menu'], ['#more', 'Order & more']];
  return `<footer><div class="fgrid">
<div class="fbrand"><a class="logo" href="${esc(v.q({}))}" aria-label="${esc(v.name)} home">${CFG.logos[v.th.logo]}</a><p>${esc(CFG.footLine)}</p></div>
<div class="fcol"><h4>Explore</h4><ul>${nav.map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul></div>
<div class="fcol"><h4>Find us</h4><ul>${v.addr ? `<li><span class="nm">${esc(v.name)}</span>${esc(v.addr)}</li>` : ''}${tel ? `<li><a href="tel:${tel}">${esc(phone)}</a></li>` : ''}</ul></div>
<div class="fcol"><h4>Online</h4><ul>${modList.filter(m => m.on && m.url).map(m => `<li><a href="${esc(m.url)}" rel="noopener"${m.ext ? ' target="_blank"' : ''}>${esc(m.title)}</a></li>`).join('') || '<li>Online ordering and reservations arrive as they go live.</li>'}${socLinks.map(s => `<li><a href="${esc(s.u)}" rel="noopener" target="_blank">${esc(s.n)}</a></li>`).join('')}</ul></div>
</div>
<div class="fbot"><span>&copy; ${new Date().getFullYear()} ${esc(v.name)}. All rights reserved.</span><span>Powered by Mother Sauce</span></div>
${lnCredit('tasteofchina')}</footer>`;
}

function tocBody(v) {
  return `${tocHeader(v)}
<main>
${tocHero(v)}
<div class="navyband" aria-hidden="true">${CFG.band}</div>
${tocChapters(v)}
${tocBand(v)}
${tocHours(v)}
${tocFamily(v)}
<div class="room"><div class="frame"><div class="imw"><img src="/img/${CFG.img.room}.webp" alt="${esc(CFG.img.roomAlt)}" loading="lazy" decoding="async" width="1400" height="600"><div class="ov"><h2>${esc(CFG.roomLine)}</h2><span class="cap">Illustration</span></div></div></div></div>
${tocMenu(v)}
<div class="in"><div class="rod" aria-hidden="true"></div></div>
${tocModules(v)}
</main>
${tocFooter(v)}
</div>
`;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } });
    const ICONS = { '/favicon.svg': ['svg', 'image/svg+xml'], '/favicon.ico': ['ico', 'image/x-icon'], '/icon-32.png': ['png32', 'image/png'], '/icon-16.png': ['png16', 'image/png'], '/icon-180.png': ['png180', 'image/png'] };
    if (ICONS[url.pathname]) { const [k, t] = ICONS[url.pathname]; const b = Uint8Array.from(atob(CFG.icons[k]), c => c.charCodeAt(0)); return new Response(b, { headers: { 'content-type': t, 'cache-control': 'public, max-age=86400' } }); }
    if (url.pathname === '/site.webmanifest') return new Response(JSON.stringify({ name: CFG.icon.name, short_name: CFG.icon.short, icons: [{ src: '/icon-180.png', sizes: '180x180', type: 'image/png' }, { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }], theme_color: CFG.icon.theme, background_color: CFG.icon.theme, display: 'standalone' }), { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=86400' } });
    const im = url.pathname.match(/^\/img\/([a-z_]+)\.webp$/); if (im && IMG[im[1]]) { const b = Uint8Array.from(atob(IMG[im[1]]), c => c.charCodeAt(0)); return new Response(b, { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=86400' } }); }
    if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('Not found', { status: 404, headers: { 'x-robots-tag': 'noindex' } });
    const s = CFG.slug;
    const [contact, hours, menu, social, jobs, mods, site] = await Promise.all([
      ms('/api/contact/' + s, ctx), ms('/api/hours/' + s, ctx), ms('/api/menu/' + s, ctx), ms('/api/social/' + s, ctx), ms('/api/jobs/' + s, ctx), ms('/api/public/modules/' + s, ctx), ms('/api/site/' + s, ctx)]);
    const { html, live } = page(url, { contact, hours, menu, social, jobs, mods, site });
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-robots-tag': 'noindex, nofollow',
      'x-ms-live': Object.entries(live).map(([k, v]) => k + ':' + (v ? 1 : 0)).join(';') + ';modules:' + (mods ? 1 : 0) } });
  }
};
