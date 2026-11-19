// LN bridge — hours half, v1. The only hours-rendering implementation in this repo.
// Deployed sites get this file injected into worker.js between the LN-BRIDGE markers by
// tools/bridge.mjs; tools/bridge.mjs --check fails when a site block differs from this file.
//
// Payload: GET /api/site/<slug> on Mother Sauce through the PORTAL service binding.
// Until that payload is live, lnBridge falls back to /api/hours/<slug> and adapts it to v1.
//
// Rules: served HTML must be right with JS off; data-live="1" marks bridge values;
// an empty/TBD block is never rendered over hours the payload has; a failed fetch keeps
// the last known good payload, and the caller keeps the existing markup when there is none.

const LNBR_D = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const LNBR_S = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };
const LNBR_SO = { Monday: 'Mo', Tuesday: 'Tu', Wednesday: 'We', Thursday: 'Th', Friday: 'Fr', Saturday: 'Sa', Sunday: 'Su' };
const LNBR_MEMO = new Map(); // slug -> { t, v }
const LNBR_TTL = 60000;

function lnbrEsc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function lnbrTime(v, lower) {
  const p = String(v || '').split(':'), h = +p[0] || 0, m = p[1] || '00';
  const s = (h % 12 || 12) + (m !== '00' ? ':' + m : '');
  return s + (h < 12 ? (lower ? 'am' : ' AM') : (lower ? 'pm' : ' PM'));
}
function lnbrOk(hours) {
  return Array.isArray(hours) && hours.some(x => x && (x.closed || (x.open && x.close)));
}
function lnbrGroups(hours) {
  const by = {};
  (hours || []).forEach(x => { if (x && x.day) by[x.day] = x });
  const key = d => { const x = by[d]; return !x ? '?' : x.closed ? 'closed' : (x.open && x.close ? x.open + '-' + x.close : '?') };
  let start = 0;
  if (key('Sunday') === key('Monday')) {
    start = 6; let n = 0;
    while (n++ < 6 && key(LNBR_D[start - 1]) === key(LNBR_D[start])) start--;
    if (n >= 7) start = 0;
  }
  const out = [];
  for (let j = 0; j < 7; j++) {
    const d = LNBR_D[(start + j) % 7], v = key(d);
    if (out.length && out[out.length - 1].v === v) out[out.length - 1].e = d;
    else out.push({ s: d, e: d, v });
  }
  return out.filter(g => g.v !== '?');
}
function lnbrFmt(hours, lower, sep) {
  return lnbrGroups(hours).map(g => {
    const dd = LNBR_S[g.s] + (g.e !== g.s ? (lower ? ' – ' : '–') + LNBR_S[g.e] : '');
    if (g.v === 'closed') return dd + ' closed';
    const p = g.v.split('-');
    return dd + ' ' + lnbrTime(p[0], lower) + (lower ? ' – ' : '–') + lnbrTime(p[1], lower);
  }).join(sep);
}
function lnbrPick(data, loc) {
  const ls = (data && data.locations) || [];
  if (loc) return ls.find(l => l.slug === loc) || null;
  if (ls.length) return ls.find(l => l.status === 'open') || ls[0];
  return null;
}
function lnbrAttrs(tag) {
  const g = n => {
    const m = tag.match(new RegExp('\\b' + n + '\\s*=\\s*"([^"]*)"', 'i'));
    return m ? m[1] : '';
  };
  return { loc: g('data-loc'), lo: g('data-fmt') === 'lower', br: g('data-sep') === 'br' };
}
function lnbrList(hours, lower) {
  return lnbrGroups(hours).map(g => {
    const dt = LNBR_S[g.s] + (g.e !== g.s ? (lower ? ' – ' : '–') + LNBR_S[g.e] : '');
    if (g.v === 'closed') return '<dt>' + lnbrEsc(dt) + '</dt><dd>Closed</dd>';
    const p = g.v.split('-');
    return '<dt>' + lnbrEsc(dt) + '</dt><dd>' + lnbrEsc(lnbrTime(p[0], lower) + (lower ? ' – ' : '–') + lnbrTime(p[1], lower)) + '</dd>';
  }).join('');
}

// /api/hours/<slug> -> v1 payload, for the window before the payload ships.
export function lnBridgeAdapt(d, slug) {
  const locs = ((d && d.locations) || []).map(l => ({
    slug: l.slug, name: l.name || '', status: l.status || 'open',
    address: l.address || '', phone: l.phone || '', email: l.email || '',
    hours: Array.isArray(l.hours) ? l.hours : [],
    holidays: Array.isArray(l.holidays) ? l.holidays : [],
    specials: Array.isArray(l.specials) ? l.specials : [],
  }));
  if (!locs.length && d && Array.isArray(d.hours) && d.hours.length) {
    locs.push({ slug: '', name: d.client || '', status: 'open', address: '', phone: '', email: '', hours: d.hours, holidays: Array.isArray(d.holidays) ? d.holidays : [], specials: [] });
  }
  return {
    v: 1, slug: String(slug || ''), name: (d && d.client) || '', site_url: '',
    updated: (d && d.updated) || null, tz: (d && d.tz) || 'America/Chicago',
    contact: {}, locations: locs, modules: {}, ordering: { on: false, url: null, locations: [] }, social: {},
  };
}

// One portal call per slug per 60s; last known good is returned when the portal is down.
export async function lnBridge(env, slug) {
  const k = String(slug || '');
  if (!k || !env || !env.PORTAL) return null;
  const hit = LNBR_MEMO.get(k), now = Date.now();
  if (hit && now - hit.t < LNBR_TTL) return hit.v;
  let data = null;
  try {
    const r = await env.PORTAL.fetch('https://ln-portal/api/site/' + encodeURIComponent(k));
    if (r.ok) {
      const j = await r.json();
      if (j && j.v === 1 && Array.isArray(j.locations)) data = j;
    }
  } catch (e) { }
  if (!data) {
    try {
      const r = await env.PORTAL.fetch('https://ln-portal/api/hours/' + encodeURIComponent(k));
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.locations) && j.locations.length) data = lnBridgeAdapt(j, k);
      }
    } catch (e) { }
  }
  if (data) { LNBR_MEMO.set(k, { t: now, v: data }); return data; }
  return hit ? hit.v : null;
}

// Server-side rewrite of the three markers. Returns the HTML unchanged when data is null.
export function lnBridgeRender(html, data) {
  if (!data || !html) return html;
  html = html.replace(/<(dl)([^>]*\bdata-ln-hours-list\b[^>]*)>[\s\S]*?<\/dl>/gi, (m, tag, at) => {
    const a = lnbrAttrs(at), l = lnbrPick(data, a.loc);
    if (!l || !lnbrOk(l.hours)) return m;
    const live = /\bdata-live\s*=/.test(at) ? '' : ' data-live="1"';
    return '<' + tag + at + live + '>' + lnbrList(l.hours, a.lo) + '</' + tag + '>';
  });
  html = html.replace(/<([a-z][\w-]*)([^>]*\bdata-ln-hours(?![\w-])[^>]*)>[\s\S]*?<\/\1>/gi, (m, tag, at) => {
    const a = lnbrAttrs(at), l = lnbrPick(data, a.loc);
    if (!l || !lnbrOk(l.hours)) return m;
    const s = lnbrFmt(l.hours, a.lo, a.br ? '<br>' : ' · ');
    const live = /\bdata-live\s*=/.test(at) ? '' : ' data-live="1"';
    return '<' + tag + at + live + '>' + (a.br ? s : lnbrEsc(s)) + '</' + tag + '>';
  });
  html = html.replace(/(<script[^>]*\bdata-ln-hours-ld\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, open, body, close) => {
    try {
      const a = lnbrAttrs(open.slice(1)), l = lnbrPick(data, a.loc);
      if (!l || !lnbrOk(l.hours)) return m;
      const j = JSON.parse(body), sp = [], oh = [];
      let target = j;
      if (Array.isArray(j['@graph'])) target = j['@graph'].find(x => x && (x.openingHours || x.openingHoursSpecification));
      if (!target) return m;
      lnbrGroups(l.hours).forEach(g => {
        if (g.v === 'closed') return;
        const p = g.v.split('-'), days = [];
        let i = LNBR_D.indexOf(g.s), n = 0;
        while (n++ < 8) { days.push(LNBR_D[i]); if (LNBR_D[i] === g.e) break; i = (i + 1) % 7 }
        sp.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: days.length === 1 ? days[0] : days, opens: p[0], closes: p[1] });
        oh.push(LNBR_SO[g.s] + (g.e !== g.s ? '-' + LNBR_SO[g.e] : '') + ' ' + p[0] + '-' + p[1]);
      });
      target.openingHoursSpecification = sp;
      target.openingHours = oh;
      return open + JSON.stringify(j) + close;
    } catch (e) { return m }
  });
  return html;
}

// Browser refresh, generated from the same formatter. The worker serves this at /ln-hours.js.
export function lnBridgeClient() {
  const helpers = [lnbrEsc, lnbrTime, lnbrOk, lnbrGroups, lnbrFmt, lnbrPick, lnbrList].map(f => String(f)).join('\n');
  return `(function(){
var LNBR_D=${JSON.stringify(LNBR_D)},LNBR_S=${JSON.stringify(LNBR_S)},LNBR_SO=${JSON.stringify(LNBR_SO)};
${helpers}
var E=document.querySelectorAll('[data-ln-hours]'),K=document.querySelectorAll('[data-ln-hours-list]'),L=document.querySelector('script[type="application/ld+json"][data-ln-hours-ld]');
if(!E.length&&!K.length&&!L)return;
function attrs(el){return{loc:el.getAttribute('data-loc')||'',lo:el.getAttribute('data-fmt')==='lower',br:el.getAttribute('data-sep')==='br'}}
fetch('/api/site',{credentials:'omit'}).then(function(r){return r.ok?r.json():null}).then(function(d){if(!d)return;
[].forEach.call(E,function(el){var a=attrs(el),l=lnbrPick(d,a.loc);if(!l||!lnbrOk(l.hours))return;var s=lnbrFmt(l.hours,a.lo,a.br?'\\n':' · ');if(a.br){el.textContent='';s.split('\\n').forEach(function(x,i){if(i)el.appendChild(document.createElement('br'));el.appendChild(document.createTextNode(x))})}else el.textContent=s;el.setAttribute('data-live','1')});
[].forEach.call(K,function(el){var a=attrs(el),l=lnbrPick(d,a.loc);if(!l||!lnbrOk(l.hours))return;el.textContent='';lnbrGroups(l.hours).forEach(function(g){var dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=LNBR_S[g.s]+(g.e!==g.s?(a.lo?' – ':'–')+LNBR_S[g.e]:'');if(g.v==='closed')dd.textContent='Closed';else{var p=g.v.split('-');dd.textContent=lnbrTime(p[0],a.lo)+(a.lo?' – ':'–')+lnbrTime(p[1],a.lo)}el.appendChild(dt);el.appendChild(dd)});el.setAttribute('data-live','1')});
if(L){try{var j=JSON.parse(L.textContent),a=attrs(L),l=lnbrPick(d,a.loc);if(l&&lnbrOk(l.hours)){var t=j;if(Array.isArray(j['@graph']))t=j['@graph'].filter(function(x){return x&&(x.openingHours||x.openingHoursSpecification)})[0];if(t){var sp=[],oh=[];lnbrGroups(l.hours).forEach(function(g){if(g.v==='closed')return;var p=g.v.split('-'),days=[],i=LNBR_D.indexOf(g.s),n=0;while(n++<8){days.push(LNBR_D[i]);if(LNBR_D[i]===g.e)break;i=(i+1)%7}sp.push({'@type':'OpeningHoursSpecification',dayOfWeek:days.length===1?days[0]:days,opens:p[0],closes:p[1]});oh.push(LNBR_SO[g.s]+(g.e!==g.s?'-'+LNBR_SO[g.e]:'')+' '+p[0]+'-'+p[1])});t.openingHoursSpecification=sp;t.openingHours=oh;L.textContent=JSON.stringify(j)}}}catch(e){}}
}).catch(function(){})})();`;
}
