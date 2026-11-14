// ===== LN form guard v1 (DRAFT, Oct 26 2026) — inlined into each site worker by build.mjs =====
// 1) Duplicate filter: same site (brand) + same form (table) + same normalized email OR phone + identical normalized fields
//    + within 2 minutes  ->  answer the normal success, save nothing, alert nothing. Anything different gets through.
// 2) Timing: honeypot ("website" filled) is still dropped. A too-fast submission (< 2.5 s after page load) is SAVED with
//    spam=1: no email alert, no Mother Sauce alert, no Brevo sync, until someone marks it "Not spam" in Mother Sauce.
const FG_WINDOW_SEC = 120, FG_MIN_MS = 2500;
const fgEmail = v => String(v ?? '').trim().toLowerCase();
const fgPhone = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d };
const fgText = v => String(v ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
// 'honeypot' | 'fast' | 'ok'. strictMissing: a missing/zero elapsed counts as fast (Meiji club already treated it that way).
function fgTiming(d, strictMissing) {
  if (d && d.website) return 'honeypot';
  const e = Number(d && d.elapsed);
  if (Number.isFinite(e) && e > 0) return e < FG_MIN_MS ? 'fast' : 'ok';
  return strictMissing ? 'fast' : 'ok';
}
// Same person = same normalized email (both non-empty) OR same normalized phone (both non-empty).
function fgSamePerson(a, b) {
  const ea = fgEmail(a.email), eb = fgEmail(b.email), pa = fgPhone(a.phone), pb = fgPhone(b.phone);
  return !!((ea && ea === eb) || (pa && pa === pb));
}
// Every listed field must match after normalization. Phone/email fields use their own normalizers.
function fgSameFields(a, b, cols) {
  return cols.every(c => c === 'phone' ? fgPhone(a[c]) === fgPhone(b[c]) : c === 'email' ? fgEmail(a[c]) === fgEmail(b[c]) : fgText(a[c]) === fgText(b[c]));
}
// Looks for an identical submission in the last 2 minutes. `row` holds the values exactly as they would be stored.
// A normal (not spam) submission only matches normal rows, so a person whose first try was flagged "fast" still gets through.
// Returns the earlier row's id, or null. Never throws (a failed check must not lose a real request).
async function fgFindDup(env, o) {
  try {
    const cols = o.cols, bw = o.brand == null ? 'brand IS NULL' : 'brand=?', args = o.brand == null ? [] : [o.brand];
    const tw = o.updatedCol ? `max(created_at,COALESCE(${o.updatedCol},''))` : 'created_at';
    const sql = `SELECT id,COALESCE(spam,0) spam,${[...new Set(['email', 'phone', ...cols])].join(',')} FROM ${o.table} WHERE ${bw} AND ${tw}>datetime('now','-${FG_WINDOW_SEC} seconds') ORDER BY id DESC LIMIT 50`;
    const rows = (await env.DB.prepare(sql).bind(...args).all()).results || [];
    const hit = rows.find(r => (o.spam || !r.spam) && fgSamePerson(r, o.row) && fgSameFields(r, o.row, cols));
    return hit ? hit.id : null;
  } catch (e) { console.log('fgFindDup', o.table, String(e)); return null }
}
// ===== end LN form guard =====

const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const EM=/^[^\s@<>"']{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/i;const LOCS=['okc-memorial','midwest-city'];
const LIST_ID=3;const LOC_LABEL={'okc-memorial':'OKC – Memorial','midwest-city':'Midwest City'};
const e164=p=>{const d=(p||'').replace(/\D/g,'');if(d.length===10)return '+1'+d;if(d.length===11&&d[0]==='1')return '+'+d;return ''};
async function brevoUpsert(env,r){if(!env.BREVO_API_KEY){await env.DB.prepare("UPDATE loyalty_members SET brevo_last_error='no key' WHERE brand='meiji' AND email=?").bind(r.email).run();return false}const parts=(r.name||'').trim().split(/\s+/);
 const attributes={FIRSTNAME:parts[0]||'',LASTNAME:parts.slice(1).join(' '),PREFERRED_LOCATION:LOC_LABEL[r.location]||r.location||''};
 if(r.birthday)attributes.BIRTHDAY=r.birthday;const sms=e164(r.phone);if(sms)attributes.SMS=sms;
 const send=a=>fetch('https://api.brevo.com/v3/contacts',{method:'POST',headers:{'api-key':env.BREVO_API_KEY,'content-type':'application/json',accept:'application/json'},body:JSON.stringify({email:r.email,attributes:a,listIds:[LIST_ID],updateEnabled:true})});
 try{let res=await send(attributes);if(!res.ok&&attributes.SMS){delete attributes.SMS;res=await send(attributes)}
  if(res.ok){await env.DB.prepare("UPDATE loyalty_members SET brevo_synced_at=datetime('now'),brevo_last_error=NULL WHERE brand='meiji' AND email=?").bind(r.email).run();return true}
  const t=(await res.text()).slice(0,300);await env.DB.prepare("UPDATE loyalty_members SET brevo_last_error=? WHERE brand='meiji' AND email=?").bind(res.status+' '+t,r.email).run();return false}catch(e){await env.DB.prepare("UPDATE loyalty_members SET brevo_last_error=? WHERE brand='meiji' AND email=?").bind('exception '+String(e).slice(0,200),r.email).run();return false}}
async function retryPending(env,limit=10){const {results}=await env.DB.prepare("SELECT name,email,phone,birthday,location FROM loyalty_members WHERE brand='meiji' AND brevo_synced_at IS NULL AND COALESCE(spam,0)=0 ORDER BY id LIMIT ?").bind(limit).all();for(const r of results)await brevoUpsert(env,r)}
const __site={async scheduled(ev,env,ctx){ctx.waitUntil(retryPending(env,100))},async fetch(req,env,ctx){if(new URL(req.url).pathname==='/api/catering'){if(req.method!=='POST')return new Response(null,{status:405});const __t=await req.text();if(__t.length>8000)return new Response('{}',{status:413});let __b={};try{__b=JSON.parse(__t)}catch(e){}delete __b.spam;{const __tm=fgTiming(__b,false);if(__tm==='honeypot')return new Response('{"ok":true}',{headers:{'content-type':'application/json','cache-control':'no-store'}});if(__tm==='fast')__b.spam=true}__b.client='meiji';__b.ip=req.headers.get('cf-connecting-ip')||'';const __p=await env.PORTAL.fetch('https://ln-portal/internal/catering',{method:'POST',body:JSON.stringify(__b)});const __j=await __p.json().catch(()=>({error:'unavailable'}));delete __j.notice;return new Response(JSON.stringify(__j),{status:__p.status,headers:{'content-type':'application/json','cache-control':'no-store'}})}if(new URL(req.url).pathname==='/api/hit'){if(req.method!=='POST')return new Response(null,{status:405});const __u=new URL(req.url);let d={};try{d=JSON.parse(await req.text())}catch(e){}ctx.waitUntil(env.PORTAL.fetch('https://ln-portal/internal/hit',{method:'POST',body:JSON.stringify({host:__u.hostname,path:String(d.p||'/').slice(0,200),ref:String(d.r||'').slice(0,300),q:String(d.q||'').slice(0,500),t:d.t?1:0,ua:req.headers.get('user-agent')||'',country:(req.cf&&req.cf.country)||'',city:(req.cf&&req.cf.city)||''})}).catch(()=>{}));return new Response(null,{status:204,headers:{'cache-control':'no-store'}})}if(new URL(req.url).pathname==='/api/hours'){const __c=caches.default,__k=new Request('https://'+new URL(req.url).hostname+'/api/hours?v=1');let __r=await __c.match(__k);if(!__r){let __p=null;try{__p=await env.PORTAL.fetch('https://ln-portal/api/hours/meiji')}catch(e){}if(!__p||!__p.ok)return new Response('{"error":"unavailable"}',{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});__r=new Response(await __p.text(),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60','x-content-type-options':'nosniff'}});ctx.waitUntil(__c.put(__k,__r.clone()))}return new Response(await __r.text(),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60','x-content-type-options':'nosniff'}})}const u=new URL(req.url);
 if(u.pathname==='/api/club'){
  if(req.method!=='POST')return J({ok:false,error:'Method not allowed'},405);
  let d;try{d=await req.json()}catch{return J({ok:false,error:'Bad request'},400)}
  const __tm=fgTiming(d,true);if(__tm==='honeypot')return J({ok:true});const __spam=__tm==='fast';// v35: fast = saved + flagged (no Brevo), not dropped
  const email=clean(d.email,200).toLowerCase(),name=clean(d.name,100),loc=clean(d.location,40);
  if(!name)return J({ok:false,error:'Please enter your name.'},400);
  if(!EM.test(email))return J({ok:false,error:'Please enter a valid email.'},400);
  if(!LOCS.includes(loc))return J({ok:false,error:'Please choose a location.'},400);
  if(d.consent!=='yes')return J({ok:false,error:'Please check the consent box.'},400);
  const bd=/^\d{4}-\d{2}-\d{2}$/.test(d.birthday||'')?d.birthday:'';
  if(__spam){// flagged: never overwrites an existing member, never goes to Brevo until marked Not spam in Mother Sauce
   await env.DB.prepare("INSERT OR IGNORE INTO loyalty_members (brand,location,name,email,phone,birthday,consent_at,source,ip,user_agent,spam) VALUES ('meiji',?,?,?,?,?,datetime('now'),'meiji-site-club',?,?,1)").bind(loc,name,email,clean(d.phone,40),bd,req.headers.get('cf-connecting-ip')||'',clean(req.headers.get('user-agent')||'',300)).run();
   return J({ok:true});}
  if(await fgFindDup(env,{table:'loyalty_members',brand:'meiji',updatedCol:'updated_at',row:{name,email,phone:clean(d.phone,40),location:loc,birthday:bd},cols:['name','email','phone','location','birthday']}))return J({ok:true});
  await env.DB.prepare("INSERT INTO loyalty_members (brand,location,name,email,phone,birthday,consent_at,source,ip,user_agent) VALUES ('meiji',?,?,?,?,?,datetime('now'),'meiji-site-club',?,?) ON CONFLICT(brand,email) DO UPDATE SET location=excluded.location,name=excluded.name,phone=COALESCE(NULLIF(excluded.phone,''),phone),birthday=COALESCE(NULLIF(excluded.birthday,''),birthday),consent_at=excluded.consent_at,spam=0,updated_at=datetime('now')")
   .bind(loc,name,email,clean(d.phone,40),bd,req.headers.get('cf-connecting-ip')||'',clean(req.headers.get('user-agent')||'',300)).run();
  ctx.waitUntil(brevoUpsert(env,{name,email,phone:clean(d.phone,40),birthday:bd,location:loc}).then(()=>retryPending(env)));
  return J({ok:true});}
 return env.ASSETS.fetch(req);}};

// LN Client Portal: /menu.json is served live from ln-portal (menu-live.js falls back to /menu.json)
const __lnInner ={...__site,async fetch(r,e,x){const u=new URL(r.url);
if(u.pathname==='/api/menu'){try{const p=await e.PORTAL.fetch('https://ln-portal/api/menu/meiji');if(p.ok){const d=await p.json();
d.categories=d.categories.map(c=>({...c,items:c.items.map(i=>i.soldOut?{...i,name:i.name+' (sold out today)'}:i)}));
return new Response(JSON.stringify(d),{headers:{'content-type':'application/json','cache-control':'no-cache','x-menu-source':'ln-portal'}})}}catch(err){}}
return __site.fetch(r,e,x)}};
;const LN_CFG={"biz": "meiji", "base": "https://meiji.loadednacho.com", "phone": "(405) 931-3668", "locs": ["midwest-city", "okc-memorial"], "pages": {"/careers": "applications", "/reservations": "reservations", "/catering": "catering"}, "api": {"/api/apply": "applications", "/api/reserve": "reservations", "/api/catering": "catering", "/api/club": "loyalty"}, "newApi": ["/api/apply", "/api/reserve"]};
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
  const off = m ? Object.keys(m).filter(k => m[k] === false && k !== 'blog_nav') : [], hideBlogNav = !!m && m.blog !== false && m.blog_nav === false; if (!off.length && !hideBlogNav) return res;
  let rw = new HTMLRewriter(); for (const k of off) rw = rw.on(`[data-ln-mod="${k}"]`, { element(e) { e.remove() } });
  // v55 DRAFT (t573u): blog on but "Show in site menu" off -> drop only the menu links (header/nav/footer); /blog pages + sitemap unchanged
  if (hideBlogNav) for (const sel of ['header [data-ln-mod="blog"]', 'nav [data-ln-mod="blog"]', 'footer [data-ln-mod="blog"]', '.drawer [data-ln-mod="blog"]', '.mnav [data-ln-mod="blog"]']) rw = rw.on(sel, { element(e) { e.remove() } });
  return rw.transform(res);
}
// ---- new form APIs (no email sends anywhere) ----
const __POS = ['Server', 'Cook', 'Host', 'Busser', 'Dishwasher', 'Manager', 'Other'], __DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], __SH = ['Lunch', 'Dinner', 'Weekends', 'Open (any)'];
const __S = (v, n) => String(v ?? '').trim().slice(0, n);
async function lnNewApi(req, env, k) {
  if (req.method !== 'POST') return __LNJ({ ok: false, error: 'Method not allowed' }, 405);
  const t = await req.text(); if (t.length > 12000) return __LNJ({ ok: false, error: 'Too large' }, 413);
  let b; try { b = JSON.parse(t) } catch { return __LNJ({ ok: false, error: 'Bad request' }, 400) }
  const __tm = fgTiming(b, false); if (__tm === 'honeypot') return __LNJ({ ok: true }); const __spam = __tm === 'fast' ? 1 : 0; // v35: fast = saved + flagged, not dropped
  const name = __S(b.name, 120), phone = __S(b.phone, 40), email = __S(b.email, 200), loc = LN_CFG.locs.includes(b.location) ? b.location : LN_CFG.locs[0];
  if (!name || !phone) return __LNJ({ ok: false, error: 'Name and phone are required.' }, 400);
  const ip = req.headers.get('cf-connecting-ip') || '', ua = __S(req.headers.get('user-agent'), 300);
  if (k === 'applications') {
    const pos = __POS.includes(b.position) ? b.position : null; if (!pos || !b.consent) return __LNJ({ ok: false, error: 'Pick a position and check the box.' }, 400);
    const days = (Array.isArray(b.days) ? b.days : []).filter(d => __DAYS.includes(d)), sh = (Array.isArray(b.shifts) ? b.shifts : []).filter(d => __SH.includes(d));
    const __row = { name, phone, email, position: pos, availability: [days.join(', '), sh.join(', ')].filter(Boolean).join(' | '), start_date: __S(b.start, 10), experience: __S(b.experience, 2000), notes: __S(b.notes, 1000), location: loc };
    const __dup = await fgFindDup(env, { table: 'cove_applications', brand: LN_CFG.biz, spam: __spam, row: __row, cols: ['name', 'phone', 'email', 'position', 'availability', 'start_date', 'experience', 'notes', 'location'] }); if (__dup) return __LNJ({ ok: true, id: __dup });
    const r = await env.DB.prepare("INSERT INTO cove_applications (brand,status,name,phone,email,position,availability,start_date,experience,notes,consent,ip,user_agent,location,spam) VALUES (?,'new',?,?,?,?,?,?,?,?,1,?,?,?,?) RETURNING id")
      .bind(LN_CFG.biz, name, phone, email, pos, __row.availability, __row.start_date, __row.experience, __row.notes, ip, ua, loc, __spam).first();
    return __LNJ({ ok: true, id: r && r.id });
  }
  if (k === 'reservations') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !/^\d{2}:\d{2}$/.test(b.time || '')) return __LNJ({ ok: false, error: 'Pick a date and time.' }, 400);
    let __gn = ''; { const __rr = await lnResvEnforce(env, b, loc); if (__rr.err) return __LNJ({ ok: false, error: __rr.err, code: __rr.code }, __rr.code === 'full' ? 409 : 400); if (__rr.note) __gn = __rr.note } // v61 booking rules
    const __row = { name, phone, email, res_date: b.date, res_time: b.time, party_size: __S(b.party, 4), notes: __S([b.occasion, b.notes, __gn].filter(Boolean).join(' | '), 1000), location: loc };
    const __dup = await fgFindDup(env, { table: 'cove_reservations', brand: LN_CFG.biz, spam: __spam, row: __row, cols: ['name', 'phone', 'email', 'res_date', 'res_time', 'party_size', 'notes', 'location'] }); if (__dup) return __LNJ({ ok: true, id: __dup });
    const r = await env.DB.prepare("INSERT INTO cove_reservations (brand,status,name,phone,email,res_date,res_time,party_size,notes,ip,user_agent,location,spam) VALUES (?,'new',?,?,?,?,?,?,?,?,?,?,?) RETURNING id")
      .bind(LN_CFG.biz, name, phone, email, b.date, b.time, __row.party_size, __row.notes, ip, ua, loc, __spam).first();
    if (r && r.id && email && !__spam) { try { await env.PORTAL.fetch('https://ln-portal/internal/reservation-booked', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client: LN_CFG.biz, id: r.id }) }) } catch (e) { console.log('reservation-booked', e && e.message) } }
    return __LNJ({ ok: true, id: r && r.id });
  }
  // catering -> Mainframe (same path Meiji uses). CATERING_EMAIL_ENABLED stays false on ln-portal.
  const p = await env.PORTAL.fetch('https://ln-portal/internal/catering', { method: 'POST', body: JSON.stringify({ client: LN_CFG.biz, name, phone, email, event_date: __S(b.event_date, 10), event_time: __S(b.event_time, 5), guests: __S(b.guests, 5), service: __S(b.service, 20), notes: __S(b.notes, 2000), location: loc, ip, spam: !!__spam }) });
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
  xml = xml.replace(/\s*<url><loc>[^<]*\/contact<\/loc><\/url>/g, ''); // /contact only redirects now
  xml = xml.replace(/\s*<url><loc>([^<]*)<\/loc>(?:<[^>]+>[^<]*<\/[^>]+>)*<\/url>/g, (all, loc) => { let p = '/'; try { p = new URL(loc).pathname } catch { } return lnOff(m, lnPageMod(p)) ? '' : all });
  if (!lnOff(m, 'blog')) { const [, j] = await lnBlogFeed(env); if (j && j.on) xml = xml.replace('</urlset>', (j.posts || []).map(p => `  <url><loc>${LN_CFG.base}/blog/${p.slug}</loc><lastmod>${new Date(p.updated_at || p.publish_at).toISOString().slice(0, 10)}</lastmod></url>\n`).join('') + '</urlset>'); else xml = xml.replace(/\s*<url><loc>[^<]*\/blog<\/loc><\/url>/, '') }
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
const __lnSecInner = {
  ...__lnInner,
  async fetch(req, env, ctx) {
    const u = new URL(req.url), p = u.pathname;
    if (p.startsWith('/api/')) {
      if (p === '/api/resv-slots' && req.method === 'GET') return lnResvSlotsApi(req, env, ctx); // v61 pacing counts
      const k = LN_CFG.api[p]; if (!k) return __lnInner.fetch(req, env, ctx);
      const m = await lnMods(env, ctx); if (lnOff(m, k)) return __LNJ({ ok: false, error: `This isn't available online right now. Please call ${LN_CFG.phone}.` }, 403);
      { const g = await __lnTsGate(req, env); if (g) return g } // Turnstile (t616u)
      return LN_CFG.newApi.includes(p) ? lnNewApi(req, env, k) : __lnInner.fetch(req, env, ctx);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return __lnInner.fetch(req, env, ctx);
    const m = await lnMods(env, ctx);
    if (p === '/sitemap.xml') { const r = await lnSitemap(req, env, m); if (r) return r }
    const k = lnPageMod(p);
    if (lnOff(m, k)) return ln404(req, env);
    if (k === 'blog' && !p.endsWith('.html')) { const r = await lnBlog(req, env, u); return lnStrip(r, m) }
    const r = await __lnInner.fetch(req, env, ctx);
    return (r.headers.get('content-type') || '').includes('text/html') ? __lnTsHtml(lnStrip(r, m), env, m && m.applications_keep_days) : r; // Turnstile widget + careers retention note (t616u)
  }
};

/* LN reservation rules v1 (DRAFT v61, Oct 26 2026). ONE source for browser (/assets/ln-resv.js) and the site Workers (inlined),
   so the form and the server always agree. Rules come from Mother Sauce: /api/forms/<biz>?module=reservations -> config.rules.
   r = {cutoff_min, notice_hours, windows:{on,days:{"0":[["17:00","20:00"]],...}}, pacing:{on,mode:"guests"|"reservations",max,slot},
        call_ahead, gratuity:{on,pct,min}, close:{"0":"20:00",...}, phone}. Everything optional; missing = no limit (old behaviour). */
var LNR=(function(){
function mn(t){var p=String(t||'').split(':');return (+p[0])*60+(+p[1]||0)}
function hhmm(m){return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
function t12(t){var m=mn(t),h=Math.floor(m/60)%24;return ((h%12)||12)+(m%60?':'+String(m%60).padStart(2,'0'):'')+(h<12?' AM':' PM')}
function dow(d){return new Date(d+'T12:00:00Z').getUTCDay()}
function days(a,b){return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5)}
function now(tz,at){try{var p={};new Intl.DateTimeFormat('en-US',{timeZone:tz||'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at||new Date()).forEach(function(x){p[x.type]=x.value});return{date:p.year+'-'+p.month+'-'+p.day,min:(+p.hour%24)*60+(+p.minute)}}catch(e){var n=at||new Date();return{date:n.toISOString().slice(0,10),min:n.getUTCHours()*60+n.getUTCMinutes()}}}
function party(v){var n=parseInt(v,10);return isNaN(n)?0:n}
function on(r){return !!(r&&(r.cutoff_min||r.notice_hours||(r.windows&&r.windows.on)||(r.pacing&&r.pacing.on&&r.pacing.max)||r.call_ahead||(r.gratuity&&r.gratuity.on)))}
function timeOn(r){return !!(r&&(r.cutoff_min||r.notice_hours||(r.windows&&r.windows.on)||(r.pacing&&r.pacing.on&&r.pacing.max)))}
function slotLen(r){var s=r&&r.pacing&&+r.pacing.slot;return s>=5&&s<=240?s:15}
function bucket(r,t){var s=slotLen(r),m=mn(t);return hhmm(Math.floor(m/s)*s)}
/* used = {"HH:MM":{n:reservations,g:guests}} for one date (raw res_time keys). Returns load of t's pacing slot. */
function load(r,used,t){var b=bucket(r,t),s=slotLen(r),o={n:0,g:0};for(var k in (used||{})){if(bucket(r,k)===b){o.n+=used[k].n||0;o.g+=used[k].g||0}}return o}
function callAhead(r,p){return !!(r&&r.call_ahead&&party(p)>=+r.call_ahead)}
function callMsg(r,phone){return 'For parties of '+r.call_ahead+' or more, please call us at '+(phone||r.phone||'the restaurant')+'.'}
function grat(r,p){return r&&r.gratuity&&r.gratuity.on&&+r.gratuity.pct>0&&+r.gratuity.min>0&&party(p)>=+r.gratuity.min?{pct:+r.gratuity.pct,min:+r.gratuity.min}:null}
function gratMsg(g){return 'A '+g.pct+'% gratuity will be added for parties of '+g.min+' or more.'}
/* why a time is not bookable (null = ok). p = party (0/'' = not chosen yet). nw = now(tz). */
function why(r,date,t,p,nw,used){if(!timeOn(r))return null;var m=mn(t),d=dow(date);
 var cl=r.close&&r.close[d];if(r.cutoff_min&&cl){var c=mn(cl);if(c<=m-1&&c<360)c+=1440;if(m>c-(+r.cutoff_min))return 'cutoff'}
 if(r.windows&&r.windows.on){var w=(r.windows.days||{})[d]||[],ok=false;for(var i=0;i<w.length;i++)if(m>=mn(w[i][0])&&m<=mn(w[i][1]))ok=true;if(!ok)return 'window'}
 if(nw){var ahead=days(nw.date,date)*1440+m-nw.min;if(ahead<0)return 'past';if(r.notice_hours&&ahead<(+r.notice_hours)*60)return 'notice'}
 if(r.pacing&&r.pacing.on&&+r.pacing.max>0&&used){var L=load(r,used,t),mx=+r.pacing.max;if(r.pacing.mode==='reservations'?L.n+1>mx:L.g+Math.max(1,party(p))>mx)return 'full'}
 return null}
function msg(code,r,phone){return {cutoff:'That time is too close to closing. Please pick an earlier time.',window:'We don’t take online reservations at that time. Please pick another time.',past:'That time has already passed. Please pick a later time.',notice:'Please book at least '+(r&&r.notice_hours)+' hours ahead.',full:'That time is fully booked. Please pick another time.',call:callMsg(r||{},phone)}[code]||'Please choose another time.'}
/* filter a site's own slot list (already inside business hours) */
function slots(r,date,base,p,nw,used){return base.map(function(t){var y=why(r,date,t,p,nw,used);return{t:t,ok:!y,why:y}})}
return{timeOn:timeOn,mn:mn,hhmm:hhmm,t12:t12,now:now,on:on,party:party,bucket:bucket,load:load,slotLen:slotLen,why:why,msg:msg,slots:slots,callAhead:callAhead,callMsg:callMsg,grat:grat,gratMsg:gratMsg}})();

// ===== LN reservation rules: server side (v61 DRAFT, Oct 26 2026). Same LNR code as /assets/ln-resv.js, so form and server agree. =====
// Rules come from Mother Sauce (/api/forms/<biz>?module=reservations -> config.rules) over the PORTAL binding, cached 30 s.
// Feed unreachable or no rules -> no extra limits (old behaviour). Pacing counts non-declined, non-spam requests for that date (+location).
const __rrMem = new Map();
async function lnResvRules(env, loc) {
  const k = loc || '', hit = __rrMem.get(k); if (hit && Date.now() - hit.t < 30000) return hit.r;
  let r = null;
  try { const p = await Promise.race([env.PORTAL.fetch('https://ln-portal/api/forms/' + LN_CFG.biz + '?module=reservations' + (loc ? '&loc=' + encodeURIComponent(loc) : '')), new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 2500))]); if (p.ok) { const j = await p.json(); r = (j && j.config && j.config.rules) || null } else return null } catch { return null }
  __rrMem.set(k, { t: Date.now(), r }); return r;
}
async function lnResvUsed(env, date, loc) {
  const multi = LN_CFG.locs.length > 1 || LN_CFG.locs[0] !== '*';
  const rows = (await env.DB.prepare("SELECT res_time,party_size FROM cove_reservations WHERE brand=? AND res_date=? AND status<>'declined' AND COALESCE(spam,0)=0" + (multi && loc ? ' AND COALESCE(location,?)=?' : '')).bind(...(multi && loc ? [LN_CFG.biz, date, loc, loc] : [LN_CFG.biz, date])).all()).results || [];
  const u = {}; for (const x of rows) { const t = String(x.res_time || '').slice(0, 5), o = u[t] = u[t] || { n: 0, g: 0 }; o.n++; o.g += Math.max(1, LNR.party(x.party_size)) } return u;
}
// -> {err,code} to reject, or {note,grat} (gratuity note to save with the request), or {} when nothing applies.
async function lnResvEnforce(env, b, loc) {
  const r = await lnResvRules(env, loc); if (!r) return {};
  const phone = r.phone || LN_CFG.phone;
  if (LNR.callAhead(r, b.party)) return { err: LNR.callMsg(r, phone), code: 'call_ahead' };
  if (LNR.timeOn(r)) { const used = r.pacing && r.pacing.on ? await lnResvUsed(env, b.date, loc) : null; const w = LNR.why(r, b.date, b.time, b.party, LNR.now('America/Chicago'), used); if (w) return { err: LNR.msg(w, r, phone), code: w } }
  const g = LNR.grat(r, b.party); return g ? { grat: g, note: 'Auto gratuity: ' + g.pct + '% (party of ' + g.min + ' or more)' } : {};
}
// GET /api/resv-slots?date=YYYY-MM-DD[&loc=] -> {used:{"HH:MM":{n,g}}} (counts only, no guest data). Used by the form to hide full slots.
async function lnResvSlotsApi(req, env, ctx) {
  const u = new URL(req.url), date = u.searchParams.get('date') || '', loc = LN_CFG.locs.includes(u.searchParams.get('loc')) ? u.searchParams.get('loc') : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return __LNJ({ error: 'bad date' }, 400);
  const m = await lnMods(env, ctx); if (lnOff(m, 'reservations')) return __LNJ({ error: 'off' }, 403);
  const r = await lnResvRules(env, loc); if (!r || !r.pacing || !r.pacing.on) return __LNJ({ used: {} });
  return __LNJ({ used: await lnResvUsed(env, date, loc) });
}
// ===== end LN reservation rules =====

// ---- LN security headers (Oct 26, 2026) ----
const __LN_SEC = { 'strict-transport-security': 'max-age=31536000', 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self' https://mothersauce.app https://portal.loadednacho.com", 'referrer-policy': 'strict-origin-when-cross-origin' };
function __lnSec(r) { if (!r || r.webSocket || r.status === 101) return r; let o = r; try { for (const [k, v] of Object.entries(__LN_SEC)) o.headers.set(k, v) } catch { o = new Response(r.body, r); for (const [k, v] of Object.entries(__LN_SEC)) o.headers.set(k, v) } return o }
// ---- LN Turnstile check (Oct 26, 2026, t616u; soft mode t658s2403) ----
// Public form POSTs send a Cloudflare Turnstile token in header x-ln-ts. SOFT: a real submission is NEVER dropped for a missing
// or failed token. Valid token -> logged 'turnstile ok'. Missing/failed/unreachable -> saved as normal, logged 'turnstile unverified'
// with the reason. Honeypot, timing and repeat filters still run after (they are what block obvious bots).
const __TS_PATHS = new Set(['/api/apply', '/api/reserve', '/api/subscribe', '/api/club', '/api/catering']);
async function __lnTsGate(req, env) {
  if (req.method !== 'POST') return null;
  const u = new URL(req.url); if (!__TS_PATHS.has(u.pathname)) return null;
  const unv = why => { console.log('turnstile unverified', JSON.stringify(Object.assign({ path: u.pathname, verified: false }, why))); return null };
  const tok = req.headers.get('x-ln-ts') || '', hosts = String(env.TURNSTILE_HOSTNAMES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!tok || tok.length > 2048) return unv({ r: 'missing-token' });
  if (!env.TURNSTILE_SECRET || !hosts.length) return unv({ r: 'not-configured' });
  let j;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: tok, remoteip: req.headers.get('cf-connecting-ip') || '' }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return unv({ r: 'siteverify-' + r.status });
    j = await r.json();
  } catch (e) { return unv({ r: 'siteverify-error', m: String(e && e.message || e).slice(0, 80) }) }
  if (!j || j.success !== true || (j.action !== 'form' && !(j.metadata && j.metadata.result_with_testing_key)) || !hosts.includes(String(j.hostname || '').toLowerCase())) return unv({ r: 'failed', codes: j && j['error-codes'], action: j && j.action, host: j && j.hostname });
  console.log('turnstile ok', JSON.stringify({ path: u.pathname, verified: true }));
  return null;
}
// Browser side: one hidden widget per protected form (appearance interaction-only), placed right of the submit button; token sent as x-ln-ts. Errors/expiry reset and retry.
// On submit: wait up to 8 s for a token, then submit anyway (the server accepts and flags it).
const __TS_CLIENT = `(function(){var K=document.currentScript&&document.currentScript.getAttribute('data-k');if(!K)return;
var P=/^\\/api\\/(apply|reserve|subscribe|club|catering)$/,W=new Map(),T=new Map(),R=new Map(),D=new Map(),last=null,ready=null;
function forms(){return [].filter.call(document.querySelectorAll('form'),function(f){return !f.hasAttribute('data-demo')&&(f.hasAttribute('data-ln-form')||f.hasAttribute('data-ln-cfg')||/^(club-form|signup|reserveForm|careerForm|catf)$/.test(f.id))})}
var F=forms();if(!F.length)return;
document.addEventListener('submit',function(e){if(F.indexOf(e.target)>=0)last=e.target},true);
document.addEventListener('focusin',function(e){var f=e.target&&e.target.closest&&e.target.closest('form');if(f&&F.indexOf(f)>=0){last=f;place(D.get(f),f.querySelector('button[type=submit],button:not([type]),input[type=submit]'))}},true);
function load(){if(ready)return ready;ready=new Promise(function(res){window.__lnTsOnload=function(){res(true)};var s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__lnTsOnload';s.async=true;s.defer=true;s.onerror=function(){res(null)};document.head.appendChild(s);setTimeout(function(){res(null)},15000)});return ready}
function retry(f){var n=(R.get(f)||0)+1;R.set(f,n);if(n>3)return;setTimeout(function(){var id=W.get(f);try{if(window.turnstile&&id!=null)window.turnstile.reset(id)}catch(e){}},1500*n)}
function render(f){var b=f.querySelector('button[type=submit],button:not([type]),input[type=submit]');var d=document.createElement('div');d.className='ln-ts';d.style.cssText='position:absolute;margin:0;display:flex;align-items:center;pointer-events:none';var row=b&&b.parentNode;if(row&&row.parentNode){var par=row.parentNode;try{if(getComputedStyle(par).position==='static')par.style.position='relative'}catch(e){}par.insertBefore(d,row.nextSibling);D.set(f,d);place(d,b)}else f.appendChild(d);
 try{W.set(f,window.turnstile.render(d,{sitekey:K,action:'form',appearance:'interaction-only','refresh-expired':'auto','retry':'auto','retry-interval':4000,
  callback:function(t){T.set(f,t);R.set(f,0)},'error-callback':function(){T.delete(f);retry(f);return true},'expired-callback':function(){T.delete(f);var id=W.get(f);try{window.turnstile.reset(id)}catch(e){}},'timeout-callback':function(){T.delete(f);var id=W.get(f);try{window.turnstile.reset(id)}catch(e){}}}))}catch(e){}}
load().then(function(ok){if(!ok||!window.turnstile)return;F.forEach(render)});
window.addEventListener('resize',function(){F.forEach(function(f){place(D.get(f),f.querySelector('button[type=submit],button:not([type]),input[type=submit]'))})});
try{var __st=document.createElement('style');__st.textContent='.ln-ts iframe{pointer-events:auto}';document.head.appendChild(__st)}catch(e){}
function cur(f){var t=T.get(f)||'';if(!t){var id=W.get(f);try{if(window.turnstile&&id!=null)t=window.turnstile.getResponse(id)||''}catch(e){}}return t}
function place(d,b){try{if(!d||!b)return;var par=d.parentNode;if(!par)return;var p=par.getBoundingClientRect(),r=b.getBoundingClientRect(),w=Math.min(300,Math.max(0,p.width-16)),x=r.right-p.left+12,y=r.top-p.top+r.height/2;if(p.width<520||x+w>p.width){x=Math.max(0,p.width-w);y=r.bottom-p.top+8;d.style.transform='none'}else{d.style.transform='translateY(-50%)'}d.style.left=Math.round(x)+'px';d.style.top=Math.round(y)+'px'}catch(e){}}
function token(f){if(!f)return Promise.resolve('');return load().then(function(ok){if(!ok||!W.has(f))return '';var t0=Date.now();return new Promise(function(res){(function poll(){var t=cur(f);if(t||Date.now()-t0>8000)return res(t);setTimeout(poll,250)})()})})}
var of=window.fetch;window.fetch=function(input,init){try{var url=new URL(typeof input==='string'?input:input.url,location.href),m=((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
 if(m==='POST'&&url.origin===location.origin&&P.test(url.pathname)){var f=last&&F.indexOf(last)>=0?last:(F.length===1?F[0]:null);if(!f)for(var i=0;i<F.length;i++)if(W.has(F[i])){f=F[i];break}
  return token(f).then(function(t){var h=new Headers((init&&init.headers)||{});if(t)h.set('x-ln-ts',t);var o=Object.assign({},init||{},{headers:h});return of.call(window,input,o)}).finally(function(){T.delete(f);var id=W.get(f);try{if(window.turnstile&&id!=null)window.turnstile.reset(id)}catch(e){}})}}catch(e){}
 return of.apply(window,arguments)};})();`;
// Injects the client script (and the careers retention note) into HTML pages that have forms.
function __lnTsHtml(r, env, keepDays) {
  const ct = r.headers.get('content-type') || ''; if (!ct.includes('text/html') || !env.TURNSTILE_SITEKEY) return r;
  const k = String(env.TURNSTILE_SITEKEY).replace(/[^A-Za-z0-9_-]/g, '');
  let rw = new HTMLRewriter().on('body', { element(e) { e.append(`<script data-k="${k}">${__TS_CLIENT}</script>`, { html: true }) } });
  if (keepDays) rw = rw.on('form[data-ln-form="apply"], form#careerForm', { element(e) { e.append(`<p class="ln-keep" style="font-size:13px;opacity:.75;margin:10px 0 0">${keepDays === 'never' ? 'We keep applications until the hiring team deletes them.' : `Applications are kept for ${keepDays} days, then deleted.`}</p>`, { html: true }) } });
  return rw.transform(r);
}

// ===== Mother Sauce website chat (default on every ln-sites site) =====
// The bubble, its greeting, its answers and its on/off live in Mother Sauce > AI assistant > Website chat assistant.
// A site carries only this tag: the embed asks Mother Sauce for the business's config and shows the bubble only
// while that switch is on. Slug: LN_CFG.chat, else LN_CFG.biz; LN_CFG.chat = false (or no LN_CFG at all) keeps it off this site.
// Deploy-time overrides: MS_CHAT_SLUG (use another business), MS_CHAT_OFF=1 (no bubble).
const MS_CHAT_DEFAULT = ''; // no LN_CFG (an agency or tool site) means no bubble
function msChatSlug(env) {
  const norm = v => String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (env && String(env.MS_CHAT_OFF || '') === '1') return '';
  if (env && env.MS_CHAT_SLUG) return norm(env.MS_CHAT_SLUG);
  const raw = typeof LN_CFG !== 'undefined' ? (LN_CFG.chat === false ? '' : (LN_CFG.chat || LN_CFG.biz || '')) : MS_CHAT_DEFAULT;
  return norm(raw);
}
function msChatInject(req, res, env) {
  try {
    if (!req || req.method !== 'GET' || !res || res.status !== 200) return res;
    if (!/text\/html/i.test(res.headers.get('content-type') || '')) return res;
    const slug = msChatSlug(env);
    if (!slug) return res;
    const ts = env && env.TURNSTILE_SITEKEY ? String(env.TURNSTILE_SITEKEY).replace(/[^A-Za-z0-9_-]/g, '') : '';
    const tag = '<script src="https://mothersauce.app/embed/chat.js" data-ms-chat="' + slug + '"' + (ts ? ' data-ts-key="' + ts + '"' : '') + ' defer></script>';
    const out = new HTMLRewriter().on('body', { element(e) { e.append(tag, { html: true }) } }).transform(res);
    const h = new Response(out.body, out); h.headers.delete('content-length'); return h;
  } catch (e) { console.log('msChatInject', String(e)); return res; }
}
// ===== end Mother Sauce website chat =====

export default { ...__lnSecInner, async fetch(req, env, ctx) { return msChatInject(req, __lnSec(await __lnSecInner.fetch(req, env, ctx)), env) } };
