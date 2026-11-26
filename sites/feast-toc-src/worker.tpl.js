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
// A bare `true` means ON. Eric's rule (2026-11-23, reversed): a module that is OFF is absent from the
// page - no placeholder, no "coming soon", no hole. A module whose real feature is not on this worker yet
// (the catering and reservation forms live in a follow-up) also renders nothing, never a dead CTA.
const MOD_ALIAS = { club: 'loyalty', careers: 'applications', ordering: 'ordering' };
function modState(mods, key) {
  if (!mods || typeof mods !== 'object') return { on: false };
  const m = mods[key] ?? mods[MOD_ALIAS[key]] ?? (mods.modules && mods.modules[key]);
  if (m === true) return { on: true };
  if (m && typeof m === 'object') { const u = m.url || m.link || m.href; let url = null; try { if (u) { const x = new URL(u); if (/^https?:$/.test(x.protocol)) url = x.href; } } catch (e) {} return { on: m.on === true || m.enabled === true, url }; }
  return { on: false };
}
const safeUrl = u => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; } };

// ---- real requests, not promises -------------------------------------------------------------
// Reservations and catering render an actual form and post to this worker (/api/reserve, /api/catering).
// The worker relays to Mother Sauce the same way cove/meiji do: catering -> PORTAL internal/catering,
// reservations -> the shared cove_reservations table through the DB binding, separated by brand.
const fld = (k, l, t, o) => `<div class="mf"><label for="m-${k}">${esc(l)}</label><input id="m-${k}" name="${k}" type="${t}"${o || ''}></div>`;
const RES_FORM = `<form class="mform" data-ln-form="/api/reserve" action="/api/reserve" method="post">
<span class="mfh">Book a table</span>
<div class="r2">${fld('name', 'Name', 'text', ' required autocomplete="name" maxlength="80"')}${fld('phone', 'Phone', 'tel', ' required autocomplete="tel" maxlength="30"')}</div>
${fld('email', 'Email', 'email', ' autocomplete="email" maxlength="200"')}
<div class="r2">${fld('date', 'Date', 'date', ' required')}${fld('time', 'Time', 'time', ' required')}</div>
<div class="r2">${fld('party', 'Party size', 'number', ' min="1" max="30" required inputmode="numeric"')}${fld('location', 'Location', 'text', ' maxlength="60"')}</div>
<label for="m-notes">Anything we should know?</label><textarea id="m-notes" name="notes" rows="2" maxlength="1000"></textarea>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<button class="sq msub" type="submit">Request a table</button>
<p class="mmsg" role="status" aria-live="polite"></p></form>`;
const CAT_FORM = `<form class="mform" data-ln-form="/api/catering" action="/api/catering" method="post">
<span class="mfh">Request catering</span>
<div class="r2">${fld('name', 'Name', 'text', ' required autocomplete="name" maxlength="80"')}${fld('phone', 'Phone', 'tel', ' required autocomplete="tel" maxlength="30"')}</div>
${fld('email', 'Email', 'email', ' autocomplete="email" maxlength="200"')}
<div class="r2">${fld('event_date', 'Event date', 'date', ' required')}${fld('guests', 'Guests', 'number', ' min="10" max="1000" required inputmode="numeric"')}</div>
<label for="m-notes">Menu ideas, allergies, anything else</label><textarea id="m-notes" name="notes" rows="2" maxlength="2000"></textarea>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<button class="sq msub" type="submit">Send request</button>
<p class="mmsg" role="status" aria-live="polite"></p></form>`;

const MOD_CSS = `.mod .mform{display:grid;gap:10px;margin-top:14px;max-width:640px;text-align:left}
.mod .mform .r2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:600px){.mod .mform .r2{grid-template-columns:1fr}}
.mod .mform .mf{display:block;min-width:0}
.mod .mform .mfh{font:700 13px/1.2 'Space Grotesk',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--acc,currentColor)}
.mod .mform label{display:block;margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.75}
.mod .mform input,.mod .mform textarea{width:100%;min-height:42px;padding:10px 12px;font:inherit;font-size:16px;color:inherit;background:transparent;border:1px solid var(--line,currentColor);border-radius:4px}
.mod .mform textarea{min-height:76px}
.mod .mform .hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.mod .mform .msub{justify-self:start;margin-top:4px}
.mod .mform .mmsg{margin:2px 0 0;font-size:.92em;min-height:1.2em}`;

// One small handler for both forms: post JSON, keep the page, show the answer.
const FORM_JS = `(function(){
document.querySelectorAll('form[data-ln-form]').forEach(function(f){
var t0=Date.now();f.addEventListener('submit',function(e){
e.preventDefault();var b=f.querySelector('button[type=submit]'),m=f.querySelector('.mmsg');
var o={};new FormData(f).forEach(function(v,k){o[k]=v});o.elapsed=Date.now()-t0;
b.disabled=true;if(m)m.textContent='Sending…';
fetch(f.getAttribute('data-ln-form'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(o)})
.then(function(r){return r.json().then(function(j){return [r.ok,j]}).catch(function(){return [r.ok,{}]})})
.then(function(x){if(x[0]){f.reset();if(m)m.textContent='Thanks! We got it and will be in touch.'}else if(m)m.textContent=(x[1]&&x[1].error)||'Something went wrong. Please call us.'})
.catch(function(){if(m)m.textContent='Something went wrong. Please call us.'})
.then(function(){b.disabled=false});});});})();`;

function themeCss(th) {
  return `:root{--navy:${th.navy||th.ink};--ink:${th.ink};--gold:${th.gold||th.acc};--bg:${th.bg};--fg:${th.fg};--mut:${th.mut};--brand:${th.brand};--brand-fg:${th.brandFg};--acc:${th.acc};--acc2:${th.acc2};--card:${th.card};--line:${th.line};--hf:${th.hf}}`;
}

// shared bits --------------------------------------------------------------
const chip = s => s ? `<span class="oc ${s.state}" data-open="${s.state}"><i aria-hidden="true"></i>${esc(openText(s))}</span>` : '';
const modRow = (m, cls) => `<li class="${cls}" data-mod="${m.key}" data-state="on">
<span class="mn" aria-hidden="true">${m.n}</span>
<div class="mb"><h3>${esc(m.title)}</h3>${m.form || `<p class="mc-on">${esc(m.onLine)}</p>${m.url ? `<a class="mgo" href="${esc(m.url)}" rel="noopener"${/^https?:/.test(m.url) && m.ext ? ' target="_blank"' : ''}>${esc(m.cta)}</a>` : (m.extra || '')}`}</div></li>`;

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
    // Only a module with a working feature on this worker renders: ordering (link), careers (job list),
    // reservations and catering (the forms below). Club has no form and no signup yet, so it renders
    // nothing rather than a dead row.
    const on = m.key === 'ordering' ? !!(m.st.on && url)
      : (m.key === 'careers' || m.key === 'reservations' || m.key === 'catering') ? !!m.st.on : false;
    return { ...m, on, url, form: (m.key === 'reservations' ? RES_FORM : m.key === 'catering' ? CAT_FORM : null),
      soonLabel: m.soon,
      extra: m.key === 'careers' && jobsOn ? `<ul class="jobs">${jobs.jobs.slice(0, 6).map(j => `<li>${esc(j.title || j.name || 'Open role')}</li>`).join('')}</ul>` : '' };
  });

  const delAll = [['doordash', 'DoorDash'], ['ubereats', 'Uber Eats'], ['grubhub', 'Grubhub']].map(([k, n]) => ({ n, u: dv[k] != null ? safeUrl(dv[k]) : null })).filter(x => x.u);
  // Eric's rule: off = absent. The section exists only when something inside it does.
  const liveMods = modList.filter(m => m.on);
  const showMore = liveMods.length > 0 || delAll.length > 0;
  const moreHead = liveMods.map(m => m.key === 'ordering' ? 'Order online' : m.key === 'careers' ? 'Careers' : m.key === 'reservations' ? 'Book a table' : m.key === 'catering' ? 'Catering' : '').filter(Boolean);
  const moreLine = moreHead.length ? moreHead.join(', ').replace(/, ([^,]*)$/, ' and $1') + '.' : '';
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
  const v = { name, locs, cLocs, loc, locName, addr, phone, tel, mapUrl, hRows, specHtml, socLinks, q, longDay, th, modList, delAll, menuHtml, open, jobsOn, cats, MED, navMods, showMore, moreLine };
  const body = CFG.layout === 'toc' ? tocBody(v) : feastBody(v);
  const css = (CFG.layout === 'toc' ? TOC_CSS : FEAST_CSS) + MOD_CSS;
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
<script>${FORM_JS}</script>
</body></html>` };
}

// browser behaviour: sticky header, mobile drawer, hero video fallback, subtle reveals
const PAGE_JS = `(function(){
var root=document.documentElement, RM=false;
try{RM=matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}
/* Hero video: the looped clip is a ~4.4s forward-and-back camera push (zoom in/out).
   Slowing the playback rate makes that push much gentler. 1 = as shot, 0.55 = ~half speed. */
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

const RAIL_SVG_TOC = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 857"><g transform="translate(75,75)"><rect x="-75" y="-75" width="150" height="150" rx="18" fill="#B3261E"/><rect x="-62" y="-62" rx="10" fill="none" stroke="#F6E7C8" stroke-width="4"/><path d="M-41.20725622558594 -28.6H-14.796524780273437Q-13.08050573730469 -28.6 -11.896835266113282 -28.927596191406252Q-10.713164794921873 -29.255192382812503 -9.767398132324217 -29.563288574218753Q-8.821631469726562 -29.871384765625002 -7.846621948242188 -29.871384765625002Q-6.083785766601565 -29.871384765625002 -5.210170532226563 -29.025067626953128Q-4.336555297851561 -28.178750488281253 -3.798343872070312 -26.162409545898434L-1.2750505371093794 -13.292380981445312Q-0.9825457763671892 -11.837655273437498 -1.5051562500000024 -10.926989562988279Q-2.0277667236328156 -10.01632385253906 -3.2952905273437523 -9.797920043945311Q-4.457511474609376 -9.544415283203122 -5.348677185058595 -9.951970520019529Q-6.239842895507813 -10.359525756835936 -6.856054321289065 -11.603645751953124Q-9.082972412109378 -16.186150512695313 -10.672234313964847 -18.67241241455078Q-12.261496215820316 -21.15867431640625 -13.706445739746094 -22.14928479003906Q-15.151395263671873 -23.139895263671875 -17.019477172851566 -23.139895263671875H-19.70250769042969V17.848876220703126Q-19.70250769042969 18.80048193359375 -19.19550769042969 19.39133526611328Q-18.688507690429688 19.982188598632813 -17.721305786132817 20.344895263671873L-16.05994958496094 20.879198120117188Q-14.121627685546876 21.596813354492188 -14.121627685546876 23.55075048828125Q-14.121627685546876 26.0 -17.23778576660156 26.0H-38.76599523925781Q-40.36112475585938 26.0 -41.12163903808594 25.333086669921876Q-41.8821533203125 24.66617333984375 -41.8821533203125 23.55075048828125Q-41.8821533203125 21.596813354492188 -39.943831420898434 20.879198120117188L-38.282475219726564 20.344895263671873Q-37.28017236328125 19.982188598632813 -36.79072283935547 19.39133526611328Q-36.30127331542969 18.80048193359375 -36.30127331542969 17.848876220703126V-23.139895263671875H-38.984303833007814Q-40.8133857421875 -23.139895263671875 -42.2758857421875 -22.14928479003906Q-43.7383857421875 -21.15867431640625 -45.32764764404297 -18.67241241455078Q-46.916909545898434 -16.186150512695313 -49.147726684570316 -11.603645751953124Q-49.7600390625 -10.359525756835936 -50.653154296875 -9.951970520019529Q-51.546269531250005 -9.544415283203122 -52.70849047851563 -9.797920043945311Q-53.940913330078125 -10.01632385253906 -54.46352380371094 -10.926989562988279Q-54.98613427734375 -11.837655273437498 -54.72873046875 -13.292380981445312L-52.20543713378906 -26.162409545898434Q-51.66722570800781 -28.178750488281253 -50.79361047363281 -29.025067626953128Q-49.919995239257815 -29.871384765625002 -48.157159057617186 -29.871384765625002Q-47.17825048828125 -29.871384765625002 -46.234433349609375 -29.563288574218753Q-45.2906162109375 -29.255192382812503 -44.104996215820314 -28.927596191406252Q-42.91937622070313 -28.6 -41.20725622558594 -28.6ZM54.2919990234375 10.684620971679687Q54.2919990234375 13.679841918945312 52.70274188232422 16.65750762939453Q51.11348474121093 19.63517333984375 48.122172363281244 22.10583428955078Q45.130859985351556 24.576495239257813 40.90129522705078 26.05655047607422Q36.67173046875 27.536605712890626 31.352115234374995 27.536605712890626Q22.686298095703123 27.536605712890626 16.36828381347656 23.890105712890627Q10.050269531249995 20.243605712890627 6.614360961914058 13.798853332519533Q3.178452392578121 7.354100952148439 3.178452392578121 -1.015302856445313Q3.178452392578121 -7.294302856445313 5.222058105468746 -12.59245428466797Q7.265663818359371 -17.890605712890626 10.951173339843745 -21.82375714111328Q14.63668286132812 -25.756908569335934 19.566293334960932 -27.935059997558593Q24.495903808593745 -30.11321142578125 30.232812377929683 -30.11321142578125Q33.93389428710937 -30.11321142578125 36.2251323852539 -29.45411999511719Q38.51637048339843 -28.795028564453126 39.89306762695312 -28.118386657714844Q41.269764770507805 -27.44174475097656 42.205774291992185 -27.44174475097656Q43.305581909179686 -27.44174475097656 43.97249523925781 -28.063790466308593Q44.639408569335934 -28.685836181640624 45.3414228515625 -29.290331420898436Q46.043437133789055 -29.894826660156248 47.174446655273435 -29.894826660156248Q48.08316284179687 -29.894826660156248 48.68377331542968 -29.315665710449217Q49.284383789062495 -28.736504760742186 49.68609045410156 -27.355880004882813L53.72648474121093 -13.647356201171874Q54.061888549804685 -12.508539062499999 53.46322760009765 -11.613474304199219Q52.86456665039062 -10.718409545898439 51.725749511718746 -10.43760192871094Q50.49722570800781 -10.156794311523434 49.4890552368164 -10.615051452636717Q48.48088476562499 -11.07330859375 47.93487524414062 -12.336933349609374Q45.914682861328124 -17.00913525390625 43.49474285888672 -19.639676208496095Q41.07480285644531 -22.27021716308594 38.38772570800781 -23.342707641601564Q35.70064855957031 -24.41519812011719 32.82249426269531 -24.41519812011719Q29.81953234863281 -24.41519812011719 27.415221862792965 -22.999510498046877Q25.01091137695312 -21.583822875976566 23.316394226074216 -18.92209429931641Q21.621877075195307 -16.260365722656253 20.720997070312496 -12.50274285888672Q19.820117065429685 -8.745119995117186 19.820117065429685 -4.057350463867188Q19.820117065429685 3.485226684570314 21.920239929199216 8.570799072265626Q24.020362792968747 13.656371459960937 27.723370422363278 16.21280194091797Q31.42637805175781 18.769232421875 36.25843139648437 18.769232421875Q40.59516284179687 18.769232421875 44.0992857055664 16.593054321289063Q47.60340856933593 14.416876220703125 49.80691333007812 10.2595009765625Q50.42312475585937 9.093380981445314 51.144639038085934 8.722876220703126Q51.8661533203125 8.352371459960938 52.73586950683593 8.527876220703124Q53.56268664550781 8.668280029296874 53.927342834472654 9.224041931152342Q54.2919990234375 9.779803833007811 54.2919990234375 10.684620971679687Z" fill="#F6E7C8" /></g><g transform="translate(75,523.30) rotate(90) translate(-560.625,-105.215)"><path d="M241.42862304687497 72.8H274.971107421875Q276.79508398437497 72.8 277.94225878906246 72.3391953125Q279.08943359374996 71.878390625 280.00141308593743 71.4415859375Q280.91339257812496 71.00478125 281.96938085937495 71.00478125Q283.59173632812497 71.00478125 284.43651757812495 71.78716015625Q285.281298828125 72.5695390625 285.77088476562494 74.431888671875L288.97729296874996 89.83985351562501Q289.265287109375 91.241421875 288.78049999999996 92.1246025390625Q288.29571289062494 93.007783203125 287.0957421875 93.218978515625Q285.98216796875 93.45897265625 285.1229873046875 93.0365791015625Q284.263806640625 92.614185546875 283.67822070312496 91.38541015625Q281.21104296874995 85.817416015625 279.43505761718745 82.9374306640625Q277.65907226562496 80.0574453125 275.87347167968744 78.996658203125Q274.08787109375 77.93587109375 271.515048828125 77.93587109375H265.649240234375V131.84015234375Q265.649240234375 132.9249453125 266.27324023437495 133.60174121093752Q266.897240234375 134.278537109375 268.05883789062494 134.62412890625L270.76609179687495 135.238525390625Q272.82046484374996 135.891306640625 272.82046484374996 137.7344609375Q272.82046484374996 140.0 269.86373632812496 140.0H246.53599414062495Q245.01923046874998 140.0 244.299248046875 139.38081640625Q243.57926562499998 138.7616328125 243.57926562499998 137.7344609375Q243.57926562499998 135.891306640625 245.63363867187496 135.238525390625L248.34089257812496 134.62412890625Q249.53128906249998 134.278537109375 250.14088964843748 133.60174121093752Q250.75049023437498 132.9249453125 250.75049023437498 131.84015234375V77.93587109375H244.88468164062496Q242.35985937499996 77.93587109375 240.55985937499997 78.996658203125Q238.75985937499996 80.0574453125 236.98387402343747 82.9374306640625Q235.20788867187497 85.817416015625 232.72150976562497 91.38541015625Q232.15512499999997 92.614185546875 231.28634374999996 93.0365791015625Q230.41756249999997 93.45897265625 229.30398828124996 93.218978515625Q228.13281640624996 93.007783203125 227.64802929687497 92.1246025390625Q227.16324218749997 91.241421875 227.42243749999997 89.83985351562501L230.62884570312497 74.431888671875Q231.11843164062498 72.5695390625 231.96321289062496 71.78716015625Q232.80799414062497 71.00478125 234.43034960937496 71.00478125Q235.50553906249996 71.00478125 236.40791796874998 71.4415859375Q237.31029687499998 71.878390625 238.46707226562498 72.3391953125Q239.62384765624998 72.8 241.42862304687497 72.8ZM324.86246679687497 133.84642578125V132.838431640625L323.940904296875 132.61762109375V104.02896874999999Q323.940904296875 100.649673828125 322.2176591796875 98.8064287109375Q320.49441406249997 96.96318359374999 317.37432617187494 96.96318359374999Q314.53262890624995 96.96318359374999 313.001392578125 98.16802050781249Q311.47015624999995 99.372857421875 311.47015624999995 101.11050195312501V105.36324218749999Q311.47015624999995 108.262373046875 309.53580664062497 109.8271337890625Q307.60145703124994 111.39189453125 304.09755664062493 111.39189453125Q301.07363867187496 111.39189453125 299.532875 109.9663203125Q297.99211132812496 108.54074609375 297.99211132812496 106.07359765625Q297.99211132812496 103.040005859375 300.4976884765624 100.12162109375001Q303.0032656249999 97.203236328125 307.87520996093747 95.29284863281251Q312.74715429687495 93.3824609375 319.879853515625 93.3824609375Q328.73097265624995 93.3824609375 333.04133398437494 96.968052734375Q337.35169531249994 100.55364453125 337.35169531249994 106.64002343749999V131.600146484375Q337.35169531249994 132.934572265625 337.90370117187496 133.611376953125Q338.45570703125 134.288181640625 339.4733105468749 134.288181640625Q340.53892578125 134.288181640625 341.0525263671875 133.779376953125Q341.566126953125 133.270572265625 341.959724609375 132.78096875Q342.23812109374995 132.464169921875 342.5309169921875 132.2337705078125Q342.82371289062496 132.00337109375 343.24610937499995 132.00337109375Q343.85089648437497 132.00337109375 344.13409179687494 132.44976171874998Q344.41728710937497 132.89615234375 344.41728710937497 133.616140625Q344.41728710937497 135.248111328125 343.27491113281246 137.00007617187498Q342.13253515624996 138.752041015625 339.89098437499996 139.9712158203125Q337.64943359374996 141.190390625 334.32790624999996 141.190390625Q330.01756835937493 141.190390625 327.440017578125 139.2320087890625Q324.86246679687497 137.273626953125 324.86246679687497 133.84642578125ZM295.97609374999996 129.929609375Q295.97609374999996 123.92964453125 301.3616591796874 120.22885156250001Q306.74722460937494 116.52805859375 316.36635546874993 116.52805859375Q319.486373046875 116.52805859375 322.01119824218745 117.0560673828125Q324.5360234375 117.584076171875 326.37925390624997 118.457685546875L325.32328906249995 121.6160234375Q323.66244921874994 120.867212890625 321.96799999999996 120.4256005859375Q320.27355078125 119.98398828124999 318.276693359375 119.98398828124999Q314.31179492187493 119.98398828124999 312.06054101562495 122.0144169921875Q309.80928710937496 124.044845703125 309.80928710937496 127.64488671875Q309.80928710937496 131.23531835937501 311.7197216796875 133.14093652343752Q313.63015624999997 135.0465546875 316.64460546874994 135.0465546875Q319.24627929687495 135.0465546875 321.64155078125 133.8513212890625Q324.03682226562495 132.656087890625 325.6784843749999 130.563212890625L326.73447851562497 133.366349609375Q324.06565624999996 137.10076953125 319.6064521484375 139.145580078125Q315.14724804687495 141.190390625 310.136046875 141.190390625Q303.83847265624996 141.190390625 299.90728320312496 138.0800029296875Q295.97609374999996 134.969615234375 295.97609374999996 129.929609375ZM370.47192968749994 136.764892578125Q373.76476367187496 136.764892578125 375.57439355468745 135.11366503906248Q377.38402343749993 133.4624375 377.38402343749993 130.9375859375Q377.38402343749993 129.372751953125 376.6832041015624 128.0911279296875Q375.98238476562494 126.80950390625 374.00474902343745 125.74868457031249Q372.02711328124997 124.687865234375 368.215865234375 123.823841796875Q360.785556640625 122.31664062499999 356.71039355468747 120.00785058593749Q352.63523046874997 117.699060546875 351.06083691406246 114.660681640625Q349.48644335937496 111.622302734375 349.48644335937496 107.95513671875Q349.48644335937496 101.264005859375 354.22399999999993 97.30403515625Q358.96155664062496 93.344064453125 367.96625585937494 93.344064453125Q371.19183007812495 93.344064453125 373.23182128906245 93.881662109375Q375.27181249999995 94.419259765625 376.58221191406244 94.96645800781249Q377.892611328125 95.51365625 378.91020898437495 95.51365625Q379.97580078125 95.51365625 380.51819433593744 94.96645800781249Q381.06058789062496 94.419259765625 381.59337792968745 93.87206152343751Q382.12616796874994 93.32486328125 383.15335156249995 93.32486328125Q383.89253515624995 93.32486328125 384.47812109374996 93.8144521484375Q385.06370703125 94.30404101562499 385.457298828125 95.60960937499999L388.64454101562495 105.14247265624999Q389.201328125 106.85122460937501 388.98533398437496 107.936Q388.76933984374995 109.020775390625 387.63656445312495 109.4623671875Q386.52299023437496 109.8847578125 385.7022089843749 109.47196484375Q384.88142773437494 109.059171875 384.123048828125 107.916798828125Q382.001451171875 104.201568359375 379.53424707031246 101.98396191406249Q377.06704296874994 99.76635546874999 374.35983593749995 98.77755957031249Q371.65262890624996 97.78876367187499 368.74382421875 97.78876367187499Q364.62536914062497 97.78876367187499 362.57574218749994 99.45919238281249Q360.52611523437497 101.12962109374999 360.52611523437497 103.932869140625Q360.52611523437497 105.603294921875 361.385328125 106.9473212890625Q362.244541015625 108.29134765625 364.61576269531247 109.41937109375Q366.98698437499996 110.54739453125 371.4318125 111.57461328125Q377.71016796874994 112.918619140625 381.386943359375 115.0450068359375Q385.06371874999996 117.17139453125 386.666908203125 120.18577050781249Q388.27009765624996 123.200146484375 388.27009765624996 127.2513125Q388.27009765624996 131.379271484375 386.12932519531245 134.53764453125Q383.98855273437493 137.696017578125 380.1725937499999 139.45280468750002Q376.35663476562496 141.209591796875 371.307078125 141.209591796875Q368.15830273437496 141.209591796875 366.26231152343746 140.5999912109375Q364.36632031249997 139.990390625 363.12792382812495 139.390390625Q361.88952734374993 138.790390625 360.71833203125 138.790390625Q359.643142578125 138.790390625 358.96155664062496 139.390390625Q358.27997070312495 139.990390625 357.66558593749994 140.5999912109375Q357.05120117187494 141.209591796875 356.12961523437497 141.209591796875Q355.40003515624994 141.209591796875 354.8912480468749 140.6816064453125Q354.38246093749996 140.15362109375 354.14246679687494 138.89605859375L352.27044335937495 129.785603515625Q351.89604687499997 127.836833984375 352.13603808593746 126.87204980468749Q352.37602929687495 125.907265625 353.374408203125 125.504076171875Q354.45918359374997 125.072087890625 355.284763671875 125.5952802734375Q356.11034374999997 126.11847265624999 356.98392382812494 127.49125390625Q359.91190039062496 132.47366796875 363.38710449218746 134.61928027343748Q366.86230859374996 136.764892578125 370.47192968749994 136.764892578125ZM399.118490234375 99.21915429687499 396.929650390625 98.575953125Q395.758443359375 98.201556640625 395.27844628906246 97.683166015625Q394.79844921874997 97.164775390625 394.79844921874997 96.454390625Q394.79844921874997 95.48481640624999 395.46563281249996 94.97123046875Q396.13281640624996 94.45764453125 397.23679296874997 94.45764453125H400.145609375Q401.307224609375 94.45764453125 402.099224609375 94.0256474609375Q402.891224609375 93.593650390625 403.716798828125 92.44165625L408.852634765625 85.155294921875Q409.86059960937496 83.878513671875 410.7965732421875 83.28332421875Q411.73254687499997 82.688134765625 412.673328125 82.688134765625Q413.70050585937497 82.688134765625 414.2716923828125 83.3409189453125Q414.84287890625 83.993703125 414.84287890625 85.203271484375V126.233826171875Q414.84287890625 129.60341796875 416.1580859375 131.369814453125Q417.47329296875 133.1362109375 419.8445 133.1362109375Q421.63009765625 133.1362109375 422.61409765625 132.435423828125Q423.59809765625 131.73463671875 424.1692958984375 130.8178525390625Q424.740494140625 129.901068359375 425.297287109375 129.20028125Q425.854080078125 128.499494140625 426.737263671875 128.499494140625Q427.466849609375 128.499494140625 427.8796396484375 128.9890830078125Q428.2924296875 129.478671875 428.2924296875 130.61144140625Q428.2924296875 133.347359375 426.51646484375 135.7137001953125Q424.7405 138.080041015625 421.61096093749995 139.5392099609375Q418.48142187499997 140.99837890625 414.46869921875 140.99837890625Q408.315201171875 140.99837890625 404.8016474609375 137.90241992187498Q401.28809375 134.8064609375 401.28809375 128.537744140625V102.12794140625Q401.28809375 100.870349609375 400.7936943359375 100.24634960937499Q400.299294921875 99.622349609375 399.118490234375 99.21915429687499ZM409.466978515625 99.295923828125V94.45764453125H425.39328125Q426.55486132812496 94.45764453125 427.20284667968747 94.9232333984375Q427.85083203125 95.38882226562501 427.85083203125 96.281603515625Q427.85083203125 97.567970703125 426.57406249999997 98.431947265625Q425.29729296874996 99.295923828125 422.465369140625 99.295923828125ZM478.59659375 111.526443359375Q478.59659375 114.13759765625 477.1086142578125 115.543970703125Q475.62063476562497 116.95034375 472.788669921875 116.95034375H442.826978515625V113.206419921875H462.497796875Q464.98418749999996 113.206419921875 464.98418749999996 110.96003515625Q464.98418749999996 104.68162109375 462.67053124999995 101.42718066406249Q460.356875 98.172740234375 456.47837890625 98.172740234375Q453.47349804687497 98.172740234375 451.16943945312494 99.97757421875Q448.86538085937497 101.782408203125 447.55494921875 105.17605859375Q446.244517578125 108.569708984375 446.244517578125 113.312158203125Q446.244517578125 122.585791015625 450.6125439453125 127.22742675781251Q454.9805703125 131.8690625 462.19979492187497 131.8690625Q466.423859375 131.8690625 469.6206962890625 130.208205078125Q472.817533203125 128.54734765625 474.62229101562497 125.475294921875Q475.495859375 124.5153125 476.01424707031254 124.1697177734375Q476.532634765625 123.824123046875 477.08942773437496 123.824123046875Q477.857416015625 123.824123046875 478.2078095703125 124.5249072265625Q478.558203125 125.22569140625001 478.53900195312497 126.214466796875Q478.34699023437497 130.256052734375 475.6638037109375 133.6784345703125Q472.9806171875 137.10081640625 468.39665234375 139.145603515625Q463.8126875 141.190390625 457.87034374999996 141.190390625Q450.91036718749996 141.190390625 445.51519531249994 138.3343935546875Q440.1200234375 135.478396484375 437.05764453125 130.3183994140625Q433.995265625 125.15840234375 433.995265625 118.2368046875Q433.995265625 110.931236328125 436.904052734375 105.32484863281249Q439.81283984375 99.7184609375 445.2608076171875 96.521662109375Q450.70877539062496 93.32486328125 458.273521484375 93.32486328125Q464.695859375 93.32486328125 469.246232421875 95.6576591796875Q473.79660546875 97.990455078125 476.19659960937497 102.089650390625Q478.59659375 106.188845703125 478.59659375 111.526443359375ZM531.94391796875 93.344064453125Q539.3742734375 93.344064453125 545.0094453125 96.3824609375Q550.6446171875 99.420857421875 553.798203125 104.835248046875Q556.9517890625 110.249638671875 556.9517890625 117.372822265625Q556.9517890625 124.150419921875 553.7070078125 129.5456123046875Q550.4622265625 134.9408046875 544.735859375 138.06559765625Q539.0094921875 141.190390625 531.463935546875 141.190390625Q524.033580078125 141.190390625 518.4080087890625 138.1231953125Q512.7824375 135.056 509.6192509765625 129.6320087890625Q506.456064453125 124.208017578125 506.456064453125 117.1616328125Q506.456064453125 110.2784375 509.700845703125 104.9072451171875Q512.945626953125 99.536052734375 518.671994140625 96.44005859375Q524.398361328125 93.344064453125 531.94391796875 93.344064453125ZM535.37111328125 136.073703125Q538.65440234375 135.545697265625 540.651265625 133.0400732421875Q542.64812890625 130.53444921875 543.1761669921875 126.13762695312501Q543.704205078125 121.7408046875 542.552216796875 115.5488046875Q541.438625 109.40479296875 539.321791015625 105.411177734375Q537.20495703125 101.4175625 534.3152919921874 99.651154296875Q531.425626953125 97.88474609375 528.036740234375 98.460751953125Q524.753451171875 98.9887578125 522.756587890625 101.4943818359375Q520.759724609375 104.000005859375 520.2460859375 108.38242871093749Q519.732447265625 112.7648515625 520.85563671875 118.985650390625Q521.969228515625 125.10086328125 524.1004619140625 129.1088779296875Q526.2316953125 133.116892578125 529.1069609375 134.8689013671875Q531.9822265625 136.62091015625 535.37111328125 136.073703125ZM585.338861328125 132.13773828125Q585.338861328125 133.539318359375 585.8908642578124 134.336111328125Q586.4428671874999 135.132904296875 587.6620624999999 135.257703125L592.5484589843749 135.824099609375Q593.7004414062499 135.929697265625 594.2140361328125 136.51528320312502Q594.7276308593749 137.100869140625 594.7276308593749 137.936052734375Q594.7276308593749 140.0 592.106884765625 140.0H567.6656152343749Q566.4848398437499 140.0 565.7984550781249 139.467212890625Q565.1120703124999 138.93442578125 565.1120703124999 138.02244921875Q565.1120703124999 137.148869140625 565.6304638671875 136.61608203125002Q566.1488574218749 136.083294921875 567.2528398437499 135.785703125L569.230484375 135.344099609375Q570.5936738281249 134.96010546875 571.1888749999998 134.23051367187497Q571.7840761718749 133.500921875 571.7840761718749 132.214537109375V103.85587109375Q571.7840761718749 102.886267578125 571.3040761718748 102.23346875Q570.8240761718749 101.580669921875 569.4704785156249 101.091078125L567.1376445312499 100.332681640625Q565.5056562499999 99.699095703125 564.9248632812498 99.10870800781251Q564.3440703124999 98.51832031250001 564.3440703124999 97.77913671875Q564.3440703124999 96.953556640625 564.9536562499999 96.439970703125Q565.5632421874999 95.926384765625 566.8400117187499 95.926384765625H574.7984023437499L571.841673828125 97.59679296875001V96.02238476562499Q571.841673828125 94.65916015625 571.0736796874999 93.3919443359375Q570.3056855468749 92.12472851562501 569.2784931640624 90.7039208984375Q568.2513007812499 89.28311328125 567.483306640625 87.4447138671875Q566.7153124999999 85.60631445312501 566.7153124999999 83.10072265625Q566.7153124999999 77.244763671875 571.0352568359374 73.63038769531249Q575.3552011718749 70.01601171875 583.0062851562499 70.01601171875Q587.9118124999999 70.01601171875 591.3101650390624 71.575994140625Q594.7085175781249 73.1359765625 596.4700947265624 75.703947265625Q598.2316718749998 78.27191796874999 598.2316718749998 81.28628515624999Q598.2316718749998 84.33903125 596.6093105468749 85.942203125Q594.9869492187499 87.545375 592.3950078124999 87.545375Q589.5534804687499 87.545375 587.8639238281248 85.812611328125Q586.1743671874999 84.07984765625 586.1743671874999 81.161509765625V78.31997656249999Q586.1743671874999 76.025556640625 584.9023613281249 74.8495419921875Q583.6303554687499 73.67352734375 581.4319296874999 73.67352734375Q578.7918945312499 73.69272851562499 577.4142734374999 75.31035253906249Q576.0366523437499 76.92797656249999 576.0366523437499 79.894419921875Q576.0366523437499 82.08320703125 576.8670371093749 83.84959765625Q577.6974218749999 85.61598828125 578.9405996093749 87.0943818359375Q580.1837773437499 88.572775390625 581.4269550781248 89.9455712890625Q582.6701328124999 91.3183671875 583.5005175781249 92.7487666015625Q584.3309023437499 94.179166015625 584.3309023437499 95.8303671875V98.067142578125L582.7373339843749 95.926384765625H594.0749374999999Q595.2365175781249 95.926384765625 595.8845029296874 96.3919736328125Q596.5324882812499 96.8575625 596.5324882812499 97.75034375Q596.5324882812499 99.0367109375 595.2557187499999 99.9006875Q593.9789492187499 100.7646640625 591.1470253906249 100.7646640625H585.338861328125ZM684.219078125 122.345697265625Q684.219078125 125.715271484375 682.3710869140625 129.14245214843748Q680.523095703125 132.5696328125 677.0287109375 135.4448193359375Q673.534326171875 138.320005859375 668.5519443359375 140.0623994140625Q663.5695625 141.80479296875 657.25278125 141.80479296875Q646.84640234375 141.80479296875 639.286419921875 137.31679296875Q631.7264375 132.82879296875 627.6272480468749 124.9327958984375Q623.52805859375 117.036798828125 623.52805859375 106.793603515625Q623.52805859375 99.065603515625 625.9568515625 92.56640527343751Q628.38564453125 86.06720703125 632.7776328125001 81.24800878906251Q637.16962109375 76.428810546875 643.078408203125 73.7696123046875Q648.9871953125 71.1104140625 655.918384765625 71.1104140625Q660.74720703125 71.1104140625 663.7472216796875 72.051224609375Q666.747236328125 72.99203515625 668.48483984375 73.94724511718749Q670.222443359375 74.902455078125 671.2304316406249 74.902455078125Q672.468822265625 74.902455078125 673.088005859375 74.07204980468751Q673.707189453125 73.24164453125 674.355171875 72.42563867187499Q675.003154296875 71.6096328125 676.251142578125 71.6096328125Q677.12472265625 71.6096328125 677.705509765625 72.1568193359375Q678.286296875 72.704005859375 678.679888671875 74.028775390625L683.739095703125 90.54074609375Q684.094291015625 91.68312499999999 683.5231044921875 92.5615068359375Q682.95191796875 93.439888671875 681.8095390625 93.67027929687501Q680.657568359375 93.900669921875 679.7263935546875 93.4446787109375Q678.79521875 92.9886875 678.26723046875 91.80791796874999Q675.66562109375 86.08632031249999 672.5360087890625 82.7119091796875Q669.406396484375 79.337498046875 665.753568359375 77.873486328125Q662.1007402343749 76.409474609375 657.867083984375 76.409474609375Q653.595037109375 76.409474609375 650.0381884765625 78.33908984375Q646.48133984375 80.26870507812501 643.8988994140625 83.8687314453125Q641.316458984375 87.4687578125 639.905234375 92.5039912109375Q638.494009765625 97.539224609375 638.494009765625 103.76966210937499Q638.494009765625 113.398490234375 641.4892431640625 120.07532421875Q644.4844765624999 126.75215820312499 649.6829287109374 130.1937822265625Q654.881380859375 133.63540625 661.5342382812499 133.63540625Q667.90872265625 133.63540625 672.6319560546875 130.625779296875Q677.355189453125 127.61615234375 679.99518359375 122.124921875Q680.58076953125 120.992146484375 681.252751953125 120.60815234374999Q681.924734375 120.224158203125 682.750314453125 120.36815234375Q683.508693359375 120.48334765625 683.8638857421874 120.98733300781251Q684.219078125 121.491318359375 684.219078125 122.345697265625ZM710.186908203125 71.7631953125V132.16653710937499Q710.186908203125 133.6833125 710.60931640625 134.37450781249998Q711.0317246093749 135.065703125 711.9053339843749 135.3728984375L713.6333808593749 135.881697265625Q715.178978515625 136.524880859375 715.178978515625 137.84965625Q715.178978515625 140.0 712.4430371093749 140.0H693.9248046874999Q692.5424374999999 140.0 691.8992509765624 139.45281347656248Q691.256064453125 138.905626953125 691.256064453125 137.9648515625Q691.256064453125 137.235265625 691.6880615234375 136.71687792968748Q692.12005859375 136.198490234375 693.0512480468749 135.872099609375L694.9136972656249 135.3728984375Q695.7873066406249 135.07530078125 696.2097148437499 134.3889072265625Q696.632123046875 133.702513671875 696.632123046875 132.18573828125V79.923037109375Q696.632123046875 78.6750546875 696.2529248046875 78.1326611328125Q695.8737265625 77.59026757812501 695.038525390625 77.4462734375L692.523236328125 77.244681640625Q691.6304433593749 77.04308984375 691.2416474609374 76.6015009765625Q690.8528515625 76.159912109375 690.8528515625 75.468728515625Q690.8528515625 74.662349609375 691.3328427734375 74.16316015625Q691.812833984375 73.663970703125 693.1184082031249 73.183982421875L701.9310957031249 69.939236328125Q703.7646582031249 69.248052734375 704.9118359375 68.94086035156249Q706.0590136718749 68.63366796875 707.05738671875 68.63366796875Q708.6029492187499 68.63366796875 709.3949287109374 69.492845703125Q710.186908203125 70.3520234375 710.186908203125 71.7631953125ZM708.6893222656249 107.41754492187499 706.462162109375 105.113591796875 708.3437890624999 103.44317187499999Q714.4013457031249 97.980822265625 718.7405175781249 95.6528427734375Q723.079689453125 93.32486328125 726.9868789062499 93.32486328125Q732.9580625 93.32486328125 736.2556484375 97.3184462890625Q739.553234375 101.312029296875 740.2348378906249 107.91681640625L742.894068359375 132.051330078125Q743.0668671875 133.625708984375 743.4412783203124 134.36010546875Q743.815689453125 135.094501953125 744.727701171875 135.392099609375L746.4173398437499 135.872099609375Q747.348529296875 136.198490234375 747.7805263671875 136.71687792968748Q748.2125234375 137.235265625 748.2125234375 137.9648515625Q748.2125234375 138.905626953125 747.5789374999999 139.45281347656248Q746.9453515624999 140.0 745.5437832031249 140.0H726.8431542968749Q724.107212890625 140.0 724.107212890625 137.84965625Q724.107212890625 136.524880859375 725.633609375 135.881697265625L727.4384609374999 135.3728984375Q728.369673828125 135.065703125 728.8688808593749 134.33610546875002Q729.3680878906249 133.6065078125 729.1952890624999 132.051330078125L726.7184492187499 109.9135625Q726.2384374999999 105.70869335937499 724.5728076171874 103.596658203125Q722.907177734375 101.484623046875 719.652728515625 101.484623046875Q717.627095703125 101.484623046875 715.375853515625 102.555048828125Q713.124611328125 103.625474609375 710.6381386718749 105.737533203125ZM771.818908203125 96.704005859375V132.16653710937499Q771.818908203125 133.6833125 772.24131640625 134.38890722656248Q772.663724609375 135.094501953125 773.537333984375 135.3728984375L775.322978515625 135.8528984375Q776.273369140625 136.1792890625 776.714966796875 136.6976767578125Q777.156564453125 137.216064453125 777.156564453125 137.9648515625Q777.156564453125 138.905626953125 776.50377734375 139.45281347656248Q775.850990234375 140.0 774.449421875 140.0H755.5568046875Q754.1744375 140.0 753.5312509765624 139.45281347656248Q752.888064453125 138.905626953125 752.888064453125 137.9648515625Q752.888064453125 137.235265625 753.3200615234375 136.71687792968748Q753.75205859375 136.198490234375 754.683248046875 135.872099609375L756.545697265625 135.3728984375Q757.419306640625 135.07530078125 757.84171484375 134.3889072265625Q758.264123046875 133.702513671875 758.264123046875 132.18573828125V104.86384765625Q758.264123046875 103.61586523437501 757.8849248046876 103.0734716796875Q757.5057265625001 102.531078125 756.670525390625 102.387083984375L754.155236328125 102.18549218749999Q753.262443359375 101.983900390625 752.8736474609375 101.54231152343749Q752.4848515625 101.10072265625 752.4848515625 100.4095390625Q752.4848515625 99.60316015625 752.9648427734376 99.103970703125Q753.444833984375 98.60478125 754.750408203125 98.12479296875L763.563095703125 94.880046875Q765.4830546875 94.16006445312499 766.6158330078125 93.867271484375Q767.748611328125 93.574478515625 768.57419140625 93.574478515625Q770.206150390625 93.574478515625 771.0125292968751 94.43365625Q771.818908203125 95.292833984375 771.818908203125 96.704005859375ZM763.966314453125 86.201486328125Q760.088005859375 86.201486328125 757.75525390625 84.22391796874999Q755.422501953125 82.24634960937499 755.422501953125 79.00161523437501Q755.422501953125 75.766478515625 757.75525390625 73.82730957031251Q760.088005859375 71.888140625 763.966314453125 71.888140625Q767.86382421875 71.888140625 770.2061767578125 73.83691015625Q772.548529296875 75.7856796875 772.548529296875 79.00161523437501Q772.548529296875 82.24634960937499 770.2061767578125 84.22391796874999Q767.86382421875 86.201486328125 763.966314453125 86.201486328125ZM802.4429082031251 96.704005859375V132.16653710937499Q802.4429082031251 133.6833125 802.86531640625 134.37450781249998Q803.287724609375 135.065703125 804.161333984375 135.3728984375L805.889380859375 135.881697265625Q807.4349785156251 136.524880859375 807.4349785156251 137.84965625Q807.4349785156251 140.0 804.699037109375 140.0H786.1808046875Q784.7984375 140.0 784.1552509765625 139.45281347656248Q783.512064453125 138.905626953125 783.512064453125 137.9648515625Q783.512064453125 137.235265625 783.9440615234375 136.71687792968748Q784.37605859375 136.198490234375 785.307248046875 135.872099609375L787.169697265625 135.3728984375Q788.043306640625 135.07530078125 788.46571484375 134.3889072265625Q788.8881230468751 133.702513671875 788.8881230468751 132.18573828125V104.86384765625Q788.8881230468751 103.61586523437501 788.5089248046876 103.0734716796875Q788.1297265625001 102.531078125 787.294525390625 102.387083984375L784.7792363281251 102.18549218749999Q783.886443359375 101.983900390625 783.4976474609375 101.54231152343749Q783.1088515625 101.10072265625 783.1088515625 100.4095390625Q783.1088515625 99.60316015625 783.5888427734376 99.103970703125Q784.068833984375 98.60478125 785.374408203125 98.12479296875L794.187095703125 94.880046875Q796.020658203125 94.18886328125001 797.1678359375001 93.8816708984375Q798.315013671875 93.574478515625 799.31338671875 93.574478515625Q800.85894921875 93.574478515625 801.6509287109375 94.43365625Q802.4429082031251 95.292833984375 802.4429082031251 96.704005859375ZM800.945322265625 107.41754492187499 798.718162109375 105.113591796875 800.5997890625 103.44317187499999Q806.657345703125 97.980822265625 810.996517578125 95.6528427734375Q815.335689453125 93.32486328125 819.24287890625 93.32486328125Q825.1948613281251 93.32486328125 828.5020478515626 97.3184462890625Q831.8092343750001 101.312029296875 832.490837890625 107.91681640625L835.150068359375 132.051330078125Q835.3228671875 133.625708984375 835.6972783203125 134.36010546875Q836.071689453125 135.094501953125 836.983701171875 135.392099609375L838.67333984375 135.872099609375Q839.6045292968751 136.198490234375 840.0365263671875 136.71687792968748Q840.4685234375 137.235265625 840.4685234375 137.9648515625Q840.4685234375 138.905626953125 839.8349375 139.45281347656248Q839.2013515625 140.0 837.799783203125 140.0H819.099154296875Q816.363212890625 140.0 816.363212890625 137.84965625Q816.363212890625 136.524880859375 817.8896093750001 135.881697265625L819.6944609375 135.3728984375Q820.6256738281251 135.065703125 821.124880859375 134.33610546875002Q821.624087890625 133.6065078125 821.4512890625 132.051330078125L818.97444921875 109.9135625Q818.4944375 105.70869335937499 816.8288076171875 103.596658203125Q815.163177734375 101.484623046875 811.9087285156251 101.484623046875Q809.883095703125 101.484623046875 807.631853515625 102.555048828125Q805.380611328125 103.625474609375 802.894138671875 105.737533203125ZM874.3664667968751 133.84642578125V132.838431640625L873.444904296875 132.61762109375V104.02896874999999Q873.444904296875 100.649673828125 871.7216591796875 98.8064287109375Q869.9984140625 96.96318359374999 866.8783261718751 96.96318359374999Q864.0366289062501 96.96318359374999 862.5053925781251 98.16802050781249Q860.9741562500001 99.372857421875 860.9741562500001 101.11050195312501V105.36324218749999Q860.9741562500001 108.262373046875 859.0398066406251 109.8271337890625Q857.1054570312501 111.39189453125 853.6015566406251 111.39189453125Q850.5776386718751 111.39189453125 849.036875 109.9663203125Q847.496111328125 108.54074609375 847.496111328125 106.07359765625Q847.496111328125 103.040005859375 850.0016884765625 100.12162109375001Q852.5072656250001 97.203236328125 857.3792099609376 95.29284863281251Q862.2511542968751 93.3824609375 869.3838535156251 93.3824609375Q878.2349726562501 93.3824609375 882.545333984375 96.968052734375Q886.8556953125001 100.55364453125 886.8556953125001 106.64002343749999V131.600146484375Q886.8556953125001 132.934572265625 887.407701171875 133.611376953125Q887.9597070312501 134.288181640625 888.9773105468751 134.288181640625Q890.0429257812501 134.288181640625 890.5565263671876 133.779376953125Q891.070126953125 133.270572265625 891.463724609375 132.78096875Q891.74212109375 132.464169921875 892.0349169921876 132.2337705078125Q892.3277128906251 132.00337109375 892.7501093750001 132.00337109375Q893.3548964843751 132.00337109375 893.6380917968751 132.44976171874998Q893.921287109375 132.89615234375 893.921287109375 133.616140625Q893.921287109375 135.248111328125 892.7789111328126 137.00007617187498Q891.6365351562501 138.752041015625 889.3949843750001 139.9712158203125Q887.15343359375 141.190390625 883.8319062500001 141.190390625Q879.5215683593751 141.190390625 876.9440175781251 139.2320087890625Q874.3664667968751 137.273626953125 874.3664667968751 133.84642578125ZM845.48009375 129.929609375Q845.48009375 123.92964453125 850.8656591796876 120.22885156250001Q856.2512246093751 116.52805859375 865.8703554687501 116.52805859375Q868.9903730468751 116.52805859375 871.5151982421876 117.0560673828125Q874.0400234375 117.584076171875 875.88325390625 118.457685546875L874.8272890625001 121.6160234375Q873.1664492187501 120.867212890625 871.4720000000001 120.4256005859375Q869.77755078125 119.98398828124999 867.780693359375 119.98398828124999Q863.8157949218751 119.98398828124999 861.5645410156251 122.0144169921875Q859.3132871093751 124.044845703125 859.3132871093751 127.64488671875Q859.3132871093751 131.23531835937501 861.2237216796875 133.14093652343752Q863.13415625 135.0465546875 866.1486054687501 135.0465546875Q868.7502792968751 135.0465546875 871.1455507812501 133.8513212890625Q873.5408222656251 132.656087890625 875.1824843750001 130.563212890625L876.238478515625 133.366349609375Q873.5696562500001 137.10076953125 869.1104521484376 139.145580078125Q864.6512480468751 141.190390625 859.640046875 141.190390625Q853.34247265625 141.190390625 849.4112832031251 138.0800029296875Q845.48009375 134.969615234375 845.48009375 129.929609375Z" fill="#F6E7C8"</g></svg>`;
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
.mod .msoon{justify-self:end;display:inline-flex;align-items:center;gap:8px;font:700 9px/1 'Space Grotesk';letter-spacing:.22em;text-transform:uppercase;color:rgba(244,239,230,.52);border:1px solid rgba(244,239,230,.18);padding:9px 12px;white-space:nowrap}
.mod .msoon:before{content:"";width:5px;height:5px;background:rgba(244,239,230,.45);transform:rotate(45deg)}
.mod .mc-off{color:rgba(244,239,230,.56);max-width:52ch}

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

/* phones: Dot's mobile audit. Labels below 11px and targets under 44px.
   Selectors re-resolved against the live DOM: "You're looking at" is
   p.here > span.lb (their rule outranks a bare .here .lb) and the kitchen
   chip is span.tag inside .stn .im. */
@media(max-width:640px){
  /* their own rule is .hero .here .lb{10px}, so this must match that specificity */
  .locpick a,.hero .here .lb,.loc .cur{font-size:11px;letter-spacing:.10em}
  .stn .im .tag{font-size:10px}
  .pv{font-size:10px;letter-spacing:.08em}
  /* a.ph sits in .visit on this brand and in .loc on the other, so match the class */
  a.ph,a.go,.sw a{display:flex;align-items:center;min-height:44px}
  footer a{display:flex;align-items:center;min-height:44px}
  .drawer .logo{display:inline-flex;align-items:center;min-height:44px}
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
  const nav = [['#stations', 'The hall'], ['#locations', 'Locations'], ['#hours', 'Hours'], ['#menu', 'Menu'], ...(v.showMore ? [['#more', 'Order & more']] : [])];
  const ord = v.modList[0];
  const ordBtn = ord.on && ord.url ? `<a class="sq ordcta" href="${esc(ord.url)}" rel="noopener" target="_blank">Order online${arrow}</a>` : '';
  const sw = locs.length > 1 ? `<div class="sw" data-sw>
<button type="button" data-sw-btn aria-expanded="false" aria-controls="locmenu"><span>${esc(loc ? loc.name : 'Locations')}</span>${chev}</button>
<div class="menu" id="locmenu" role="group" aria-label="Choose a location">${locs.map(l => `<a href="${esc(q({ loc: l.slug }))}" ${l === loc ? 'aria-current="page"' : ''}><span>${esc(l.name)}</span>${l === loc ? '<b>You are here</b>' : ''}</a>`).join('')}</div></div>` : '';
  const drawerSw = locs.length > 1 ? `<div class="sw"><span class="lab">Location</span>${locs.map(l => `<a href="${esc(q({ loc: l.slug }))}" ${l === loc ? 'aria-current="page"' : ''}><span>${esc(l.name)}</span>${l === loc ? '<b>You are here</b>' : ''}</a>`).join('')}</div>` : '';
  return `<header class="hdr">
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
  const { modList, delAll, moreLine, showMore } = v;
  if (!showMore) return '';
  const on = modList.filter(m => m.on);
  return `<section class="sec wrapx mods-sec" id="more">
<div class="hd"><div class="t"><span class="lbl">Online</span><h2 class="dsp">Order &amp; more</h2></div>${moreLine ? `<p class="side">${esc(moreLine)}</p>` : ''}</div>
${on.length ? `<ul class="mods">${on.map(m => modRow(m, 'mod')).join('')}</ul>` : ''}
${delAll.length ? `<div class="dlv"><span class="mn">06</span><div><h3>Delivery apps</h3><p>Order from us through a delivery app. Links open the app or its website.</p></div><div class="dlinks">${delAll.map(d => `<a href="${esc(d.u)}" rel="noopener" target="_blank">${esc(d.n)}</a>`).join('')}</div></div>` : ''}
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
  const nav = [['#stations', 'The hall'], ['#locations', 'Locations'], ['#hours', 'Hours'], ['#menu', 'Menu'], ...(v.showMore ? [['#more', 'Order & more']] : []), ['#families', 'Families']];
  return `<footer><div class="wrapx">
<div class="fgrid">
<div class="fbrand"><a class="logo" href="${esc(v.q({}))}" aria-label="${esc(v.name)} home">${CFG.logos[v.th.logo]}</a><p>${esc(CFG.footLine)}</p></div>
<div class="fcol"><h4>Explore</h4><ul>${nav.map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul></div>
<div class="fcol"><h4>Find us</h4><ul>${locs.map(l => `<li><span class="nm">${esc(l.name)}</span><br>${esc(l.address || '')}${l.phone ? `<br><a href="tel:+1${String(l.phone).replace(/\D/g, '')}">${esc(l.phone)}</a>` : ''}</li>`).join('')}</ul></div>
${(modList.some(m => m.on && m.url) || socLinks.length) ? `<div class="fcol"><h4>Online</h4><ul>${modList.filter(m => m.on && m.url).map(m => `<li><a href="${esc(m.url)}" rel="noopener"${m.ext ? ' target="_blank"' : ''}>${esc(m.title)}</a></li>`).join('') || '<li class="sm">Online ordering, reservations and more arrive as they go live.</li>'}${socLinks.map(s => `<li><a href="${esc(s.u)}" rel="noopener" target="_blank">${esc(s.n)}</a></li>`).join('')}</ul></div>` : ''}
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
.mod .jobs li{border-radius:4px!important}
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
.strip{position:fixed;left:0;top:var(--pvh);bottom:0;width:var(--strip);z-index:50;display:flex;flex-direction:column;align-items:center;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;overscroll-behavior:contain;
padding:var(--s4) 0 var(--s4);gap:var(--s3);border-right:1px solid rgba(201,162,75,.55);
background:
radial-gradient(circle at 20% 30%,rgba(243,233,210,.055) 0 1px,transparent 2px) 0 0/9px 9px,
radial-gradient(circle at 72% 64%,rgba(201,162,75,.09) 0 1px,transparent 2px) 0 0/13px 13px,
linear-gradient(180deg,#131A2B,#0D1220 55%,#131A2B)}
.strip .railbrand{display:block;flex:none;line-height:0}
.strip .railbrand svg{display:block;height:var(--railBrandH,300px);width:auto;transition:opacity .25s}
.strip .railbrand:hover svg{opacity:.85}
.strip .railbrand:focus-visible svg{outline:1px solid var(--gold);outline-offset:4px}
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
.strip .vt{font-size:20px;letter-spacing:.28em}.chapter,.chapter:nth-of-type(even){grid-template-columns:minmax(0,6fr) minmax(0,6fr);gap:var(--s4)}
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
.mod .mgo,.mod .msoon,.dlinks{grid-column:2;justify-self:start;margin-top:var(--s2)}
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

/* phones: Dot's mobile audit. The call seal's phone was the smallest type on
   the page at 7.5px. */
@media(max-width:640px){
  .seals .seal-btn small{font-size:9.5px;letter-spacing:.10em}
  .navyband span{font-size:10.5px;letter-spacing:.12em}
  .kick{font-size:11px;letter-spacing:.18em}
  .pv{font-size:9.5px;letter-spacing:.08em}
  .hours-grid .ul,.fcol a{display:flex;align-items:center;min-height:44px}
  a[href*="google.com/maps"]{display:inline-flex;align-items:center;min-height:44px}
  .drawer .logo{display:inline-flex;align-items:center;min-height:44px}
}
`;

const RN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const sealChev = '<svg viewBox="0 0 9 6" aria-hidden="true" style="width:9px;height:6px;fill:none;stroke:currentColor;stroke-width:1.5"><path d="M1 1l3.5 3.5L8 1"/></svg>';

function tocHeader(v) {
  const nav = [['#chapters', 'The table'], ['#hours', 'Hours'], ['#family', 'Family'], ['#menu', 'Menu'], ...(v.showMore ? [['#more', 'Order & more']] : [])];
  const ord = v.modList[0];
  const ordBtn = ord.on && ord.url ? `<a class="ordcta" href="${esc(ord.url)}" rel="noopener" target="_blank">Order online</a>` : '';
  return `<aside class="strip" aria-label="${esc(v.name)}">
${CFG.slug === 'tasteofchina' ? `<a class="railbrand" href="/" aria-label="${esc(v.name)} home">${RAIL_SVG_TOC}</a>` : `<a class="seal" href="${esc(v.q({}))}" aria-label="${esc(v.name)} home">${esc(CFG.sealText)}</a><div class="vt">${esc(v.name)}</div>`}
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
  const { modList, delAll, moreLine, showMore } = v;
  if (!showMore) return '';
  const on = modList.filter(m => m.on);
  return `<section class="blk in" id="more">
<div class="ttl"><div class="ch"><span class="rn cap">Online</span><span class="ln" aria-hidden="true"></span></div><h2>Order &amp; more</h2>${moreLine ? `<p class="sub">${esc(moreLine)}</p>` : ''}</div>
${on.length ? `<ul class="mods">${on.map((m, i) => modRow({ ...m, n: RN[i] || m.n }, 'mod')).join('')}</ul>` : ''}
${delAll.length ? `<div class="dlv"><span class="mn">VI</span><div><h3>Delivery apps</h3><p>Order through a delivery app. Links open the app or its website.</p></div><div class="dlinks">${delAll.map(d => `<a href="${esc(d.u)}" rel="noopener" target="_blank">${esc(d.n)}</a>`).join('')}</div></div>` : ''}
</section>`;
}

function tocFooter(v) {
  const { socLinks, modList, tel, phone } = v;
  const nav = [['#chapters', 'The table'], ['#hours', 'Hours'], ['#family', 'Family'], ['#menu', 'Menu'], ...(v.showMore ? [['#more', 'Order & more']] : [])];
  return `<footer><div class="fgrid">
<div class="fbrand"><a class="logo" href="${esc(v.q({}))}" aria-label="${esc(v.name)} home">${CFG.logos[v.th.logo]}</a><p>${esc(CFG.footLine)}</p></div>
<div class="fcol"><h4>Explore</h4><ul>${nav.map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}</ul></div>
<div class="fcol"><h4>Find us</h4><ul>${v.addr ? `<li><span class="nm">${esc(v.name)}</span>${esc(v.addr)}</li>` : ''}${tel ? `<li><a href="tel:${tel}">${esc(phone)}</a></li>` : ''}</ul></div>
${(modList.some(m => m.on && m.url) || socLinks.length) ? `<div class="fcol"><h4>Online</h4><ul>${modList.filter(m => m.on && m.url).map(m => `<li><a href="${esc(m.url)}" rel="noopener"${m.ext ? ' target="_blank"' : ''}>${esc(m.title)}</a></li>`).join('') || '<li>Online ordering and reservations arrive as they go live.</li>'}${socLinks.map(s => `<li><a href="${esc(s.u)}" rel="noopener" target="_blank">${esc(s.n)}</a></li>`).join('')}</ul></div>` : ''}
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
    // ---- form intake: reservations and catering post here, this worker relays to Mother Sauce ----
    if (url.pathname === '/api/reserve' || url.pathname === '/api/catering') {
      const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
      if (req.method !== 'POST') return J({ ok: false, error: 'Method not allowed' }, 405);
      const raw = await req.text(); if (raw.length > 12000) return J({ ok: false, error: 'Too large' }, 413);
      let b = {}; try { b = JSON.parse(raw); } catch (e) { try { b = Object.fromEntries(new URLSearchParams(raw)); } catch (e2) { return J({ ok: false, error: 'Bad request' }, 400); } }
      if (b.website) return J({ ok: true });
      const S = (v, n) => String(v ?? '').trim().slice(0, n);
      const name = S(b.name, 120), phone = S(b.phone, 40), email = S(b.email, 200).toLowerCase(), loc = S(b.location, 60);
      if (!name || phone.replace(/\D/g, '').length < 10) return J({ ok: false, error: 'Please add your name and a phone number we can call or text.' }, 400);
      const fast = Number(b.elapsed) > 0 && Number(b.elapsed) < 2500; // too fast = saved and flagged, not dropped
      const ip = req.headers.get('cf-connecting-ip') || '', ua = S(req.headers.get('user-agent'), 300);
      if (url.pathname === '/api/catering') {
        if (!env.PORTAL) return J({ ok: false, error: 'This form is not connected yet. Please call us.' }, 503);
        let p; try { p = await env.PORTAL.fetch('https://ln-portal/internal/catering', { method: 'POST', body: JSON.stringify({ client: CFG.slug, name, phone, email, event_date: S(b.event_date, 10), guests: S(b.guests, 5), notes: S(b.notes, 2000), location: loc, ip, spam: fast }) }); } catch (e) { return J({ ok: false, error: 'Please try again, or call us.' }, 502); }
        const j = await p.json().catch(() => ({ error: 'unavailable' })); delete j.notice;
        return J(j, p.status);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !/^\d{2}:\d{2}$/.test(b.time || '')) return J({ ok: false, error: 'Please pick a date and time.' }, 400);
      if (!env.DB) return J({ ok: false, error: 'This form is not connected yet. Please call us.' }, 503);
      const party = S(b.party, 4), notes = S(b.notes, 1000);
      if (!party) return J({ ok: false, error: 'Please choose your party size.' }, 400);
      try {
        // cove_reservations is shared by cove, meiji and feast; brand separates them, and every
        // list query filters on brand, so a feast booking never shows in Cove's or Meiji's list.
        const r = await env.DB.prepare("INSERT INTO cove_reservations (brand,status,name,phone,email,res_date,res_time,party_size,notes,ip,user_agent,location,spam) VALUES (?,'new',?,?,?,?,?,?,?,?,?,?,?) RETURNING id")
          .bind(CFG.slug, name, phone, email, b.date, b.time, party, notes, ip, ua, loc, fast ? 1 : 0).first();
        const id = r && r.id;
        if (id && email && !fast && env.PORTAL) { try { await env.PORTAL.fetch('https://ln-portal/internal/reservation-booked', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client: CFG.slug, id }) }); } catch (e) {} }
        return J({ ok: true, id });
      } catch (e) { return J({ ok: false, error: 'Please try again, or call us.' }, 502); }
    }
    if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('Not found', { status: 404, headers: { 'x-robots-tag': 'noindex' } });
    const s = CFG.slug;
    const [contact, hours, menu, social, jobs, mods, site] = await Promise.all([
      ms('/api/contact/' + s, ctx), ms('/api/hours/' + s, ctx), ms('/api/menu/' + s, ctx), ms('/api/social/' + s, ctx), ms('/api/jobs/' + s, ctx), ms('/api/public/modules/' + s, ctx), ms('/api/site/' + s, ctx)]);
    const { html, live } = page(url, { contact, hours, menu, social, jobs, mods, site });
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-robots-tag': 'noindex, nofollow',
      'x-ms-live': Object.entries(live).map(([k, v]) => k + ':' + (v ? 1 : 0)).join(';') + ';modules:' + (mods ? 1 : 0) } });
  }
};
