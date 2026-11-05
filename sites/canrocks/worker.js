const __lnInner ={async fetch(r,e,__x){if(new URL(r.url).pathname==='/api/hit'){if(r.method!=='POST')return new Response(null,{status:405});const __u=new URL(r.url);let d={};try{d=JSON.parse(await r.text())}catch(e){}__x.waitUntil(e.PORTAL.fetch('https://ln-portal/internal/hit',{method:'POST',body:JSON.stringify({host:__u.hostname,path:String(d.p||'/').slice(0,200),ref:String(d.r||'').slice(0,300),q:String(d.q||'').slice(0,500),t:d.t?1:0,ua:r.headers.get('user-agent')||'',country:(r.cf&&r.cf.country)||'',city:(r.cf&&r.cf.city)||''})}).catch(()=>{}));return new Response(null,{status:204,headers:{'cache-control':'no-store'}})}if(new URL(r.url).pathname==='/api/hours'){const __c=caches.default,__k=new Request('https://'+new URL(r.url).hostname+'/api/hours?v=1');let __r=await __c.match(__k);if(!__r){let __p=null;try{__p=await e.PORTAL.fetch('https://ln-portal/api/hours/canrocks')}catch(e){}if(!__p||!__p.ok)return new Response('{"error":"unavailable"}',{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});__r=new Response(await __p.text(),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60','x-content-type-options':'nosniff'}});__x.waitUntil(__c.put(__k,__r.clone()))}return new Response(await __r.text(),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60','x-content-type-options':'nosniff'}})}return e.ASSETS.fetch(r)}}
;const LN_CFG={"biz": "canrocks", "base": "https://canrocks.loadednacho.com", "phone": "us", "locs": ["norman"], "pages": {"/careers": "applications", "/reservations": "reservations", "/catering": "catering"}, "api": {"/api/apply": "applications", "/api/reserve": "reservations", "/api/catering": "catering"}, "newApi": ["/api/apply", "/api/reserve", "/api/catering"]};
// ===== LN module gate v1 =====
// Append this to a site Worker whose own handler is renamed: `export default` -> `const __lnInner =`.
// Needs bindings: ASSETS, PORTAL (service -> ln-portal). DB (LEADS) is needed only if LN_NEW_API is used.
// Config: const LN_CFG = { biz, base, phone, locs:[slug,...], pages:{'/careers':'applications',...}, api:{'/api/apply':'applications',...}, newApi:['/api/apply',...] };
// Rules: a module is OFF only when the feed explicitly says false. If the feed is unreachable, everything shows (fallback).
const __LNJ = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
let __lnMem = null;
async function lnMods(env, ctx) {
  if (__lnMem && Date.now() - __lnMem.t < 30000) return __lnMem.m;
  const key = new Request('https://ln-gate.cache/modules/' + LN_CFG.biz), c = caches.default;
  try { const hit = await c.match(key); if (hit) { const m = await hit.json(); __lnMem = { t: Date.now(), m }; return m } } catch { }
  try {
    const r = await Promise.race([env.PORTAL.fetch('https://ln-portal/api/modules/' + LN_CFG.biz), new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 2500))]);
    if (!r.ok) return null; const m = await r.json(); __lnMem = { t: Date.now(), m };
    ctx.waitUntil(c.put(key, new Response(JSON.stringify(m), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' } })).catch(() => { }));
    return m;
  } catch { return null }
}
const lnOff = (m, k) => !!(m && k && m[k] === false);
const lnNorm = p => { p = p.replace(/\/+$/, '') || '/'; return p.endsWith('.html') ? (p.slice(0, -5).replace(/\/index$/, '') || '/') : p };
function lnPageMod(p) { const n = lnNorm(p); if (n === '/blog' || n.startsWith('/blog/')) return 'blog'; return LN_CFG.pages[n] || null }
async function ln404(req, env) {
  let body = 'Not found', h = { 'content-type': 'text/plain' };
  try { const r = await env.ASSETS.fetch(new Request(new URL('/404.html', req.url))); if (r.ok || r.status === 404) { body = await r.text(); h = { 'content-type': 'text/html; charset=utf-8' } } } catch { }
  return new Response(body, { status: 404, headers: { ...h, 'x-robots-tag': 'noindex', 'cache-control': 'no-store' } });
}
function lnStrip(res, m) {
  const off = m ? Object.keys(m).filter(k => m[k] === false) : []; if (!off.length) return res;
  let rw = new HTMLRewriter(); for (const k of off) rw = rw.on(`[data-ln-mod="${k}"]`, { element(e) { e.remove() } });
  return rw.transform(res);
}
// ---- new form APIs (no email sends anywhere) ----
const __POS = ['Server', 'Cook', 'Host', 'Busser', 'Dishwasher', 'Manager', 'Other'], __DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], __SH = ['Lunch', 'Dinner', 'Weekends', 'Open (any)'];
const __S = (v, n) => String(v ?? '').trim().slice(0, n);
async function lnNewApi(req, env, k) {
  if (req.method !== 'POST') return __LNJ({ ok: false, error: 'Method not allowed' }, 405);
  const t = await req.text(); if (t.length > 12000) return __LNJ({ ok: false, error: 'Too large' }, 413);
  let b; try { b = JSON.parse(t) } catch { return __LNJ({ ok: false, error: 'Bad request' }, 400) }
  if (b.website) return __LNJ({ ok: true });
  const name = __S(b.name, 120), phone = __S(b.phone, 40), email = __S(b.email, 200), loc = LN_CFG.locs.includes(b.location) ? b.location : LN_CFG.locs[0];
  if (!name || !phone) return __LNJ({ ok: false, error: 'Name and phone are required.' }, 400);
  const ip = req.headers.get('cf-connecting-ip') || '', ua = __S(req.headers.get('user-agent'), 300);
  if (k === 'applications') {
    const pos = __POS.includes(b.position) ? b.position : null; if (!pos || !b.consent) return __LNJ({ ok: false, error: 'Pick a position and check the box.' }, 400);
    const days = (Array.isArray(b.days) ? b.days : []).filter(d => __DAYS.includes(d)), sh = (Array.isArray(b.shifts) ? b.shifts : []).filter(d => __SH.includes(d));
    const r = await env.DB.prepare("INSERT INTO cove_applications (brand,status,name,phone,email,position,availability,start_date,experience,notes,consent,ip,user_agent,location) VALUES (?,'new',?,?,?,?,?,?,?,?,1,?,?,?) RETURNING id")
      .bind(LN_CFG.biz, name, phone, email, pos, [days.join(', '), sh.join(', ')].filter(Boolean).join(' | '), __S(b.start, 10), __S(b.experience, 2000), __S(b.notes, 1000), ip, ua, loc).first();
    return __LNJ({ ok: true, id: r && r.id });
  }
  if (k === 'reservations') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !/^\d{2}:\d{2}$/.test(b.time || '')) return __LNJ({ ok: false, error: 'Pick a date and time.' }, 400);
    const r = await env.DB.prepare("INSERT INTO cove_reservations (brand,status,name,phone,email,res_date,res_time,party_size,notes,ip,user_agent,location) VALUES (?,'new',?,?,?,?,?,?,?,?,?,?) RETURNING id")
      .bind(LN_CFG.biz, name, phone, email, b.date, b.time, __S(b.party, 4), __S([b.occasion, b.notes].filter(Boolean).join(' | '), 1000), ip, ua, loc).first();
    if (r && r.id && email && !__spam) { try { await env.PORTAL.fetch('https://ln-portal/internal/reservation-booked', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client: LN_CFG.biz, id: r.id }) }) } catch (e) { console.log('reservation-booked', e && e.message) } }
    return __LNJ({ ok: true, id: r && r.id });
  }
  // catering -> Mainframe (same path Meiji uses). CATERING_EMAIL_ENABLED stays false on ln-portal.
  const p = await env.PORTAL.fetch('https://ln-portal/internal/catering', { method: 'POST', body: JSON.stringify({ client: LN_CFG.biz, name, phone, email, event_date: __S(b.event_date, 10), event_time: __S(b.event_time, 5), guests: __S(b.guests, 5), service: __S(b.service, 20), notes: __S(b.notes, 2000), location: loc, ip }) });
  const j = await p.json().catch(() => ({ error: 'unavailable' })); delete j.notice; return __LNJ(j, p.status);
}
// ---- blog + sitemap ----
const __bE = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function lnBlogFeed(env, q = '') { try { const r = await env.PORTAL.fetch('https://ln-portal/api/blog/' + LN_CFG.biz + q); return [r.status, await r.json()] } catch { return [0, null] } }
async function lnBlog(req, env, u) {
  const n = lnNorm(u.pathname);
  if (n === '/blog') return env.ASSETS.fetch(new Request(new URL('/blog/index.html', u), req));
  const s = n.slice(6); if (!/^[a-z0-9-]+$/.test(s)) return ln404(req, env);
  const [st, j] = await lnBlogFeed(env, '?post=' + s); const p = st === 200 && j && j.post; if (!p) return ln404(req, env);
  const page = await env.ASSETS.fetch(new Request(new URL('/blog/post.html', u), req)), url = LN_CFG.base + '/blog/' + p.slug;
  const set = v => ({ element(e) { e.setAttribute('content', v) } }), iso = new Date(p.publish_at).toISOString();
  return new HTMLRewriter().on('title', { element(e) { e.setInnerContent(p.title + ' | ' + j.client) } })
    .on('meta[name="description"]', set(p.excerpt || '')).on('meta[property="og:title"]', set(p.title)).on('meta[property="og:description"]', set(p.excerpt || '')).on('meta[property="og:type"]', set('article'))
    .on('meta[property="og:url"]', set(url)).on('link[rel="canonical"]', { element(e) { e.setAttribute('href', url) } })
    .on('head', { element(e) { e.append((p.cover ? `<meta property="og:image" content="${__bE(p.cover)}">` : '') + `<meta property="article:published_time" content="${iso}"><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, datePublished: iso, image: p.cover || undefined, url, publisher: { '@type': 'Organization', name: j.client } }).replace(/</g, '\\u003c')}</script>`, { html: true }) } })
    .transform(page);
}
async function lnSitemap(req, env, m) {
  const a = await env.ASSETS.fetch(new Request(new URL('/sitemap.xml', req.url))); if (!a.ok) return null;
  let xml = await a.text();
  xml = xml.replace(/\s*<url><loc>([^<]*)<\/loc>(?:<[^>]+>[^<]*<\/[^>]+>)*<\/url>/g, (all, loc) => { let p = '/'; try { p = new URL(loc).pathname } catch { } return lnOff(m, lnPageMod(p)) ? '' : all });
  if (!lnOff(m, 'blog')) { const [, j] = await lnBlogFeed(env); if (j && j.on) xml = xml.replace('</urlset>', (j.posts || []).map(p => `  <url><loc>${LN_CFG.base}/blog/${p.slug}</loc><lastmod>${new Date(p.updated_at || p.publish_at).toISOString().slice(0, 10)}</lastmod></url>\n`).join('') + '</urlset>'); else xml = xml.replace(/\s*<url><loc>[^<]*\/blog<\/loc><\/url>/, '') }
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
const __lnSecInner = {
  ...__lnInner,
  async fetch(req, env, ctx) {
    const u = new URL(req.url), p = u.pathname;
    if (p.startsWith('/api/')) {
      const k = LN_CFG.api[p]; if (!k) return __lnInner.fetch(req, env, ctx);
      const m = await lnMods(env, ctx); if (lnOff(m, k)) return __LNJ({ ok: false, error: `This isn't available online right now. Please call ${LN_CFG.phone}.` }, 403);
      return LN_CFG.newApi.includes(p) ? lnNewApi(req, env, k) : __lnInner.fetch(req, env, ctx);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return __lnInner.fetch(req, env, ctx);
    const m = await lnMods(env, ctx);
    if (p === '/sitemap.xml') { const r = await lnSitemap(req, env, m); if (r) return r }
    const k = lnPageMod(p);
    if (lnOff(m, k)) return ln404(req, env);
    if (k === 'blog' && !p.endsWith('.html')) { const r = await lnBlog(req, env, u); return lnStrip(r, m) }
    const r = await __lnInner.fetch(req, env, ctx);
    return (r.headers.get('content-type') || '').includes('text/html') ? lnStrip(r, m) : r;
  }
};

// ---- LN security headers (Oct 26, 2026) ----
const __LN_SEC = { 'strict-transport-security': 'max-age=31536000', 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self' https://mothersauce.app https://portal.loadednacho.com", 'referrer-policy': 'strict-origin-when-cross-origin' };
function __lnSec(r) { if (!r || r.webSocket || r.status === 101) return r; let o = r; try { for (const [k, v] of Object.entries(__LN_SEC)) o.headers.set(k, v) } catch { o = new Response(r.body, r); for (const [k, v] of Object.entries(__LN_SEC)) o.headers.set(k, v) } return o }
export default { ...__lnSecInner, async fetch(req, env, ctx) { return __lnSec(await __lnSecInner.fetch(req, env, ctx)) } };
