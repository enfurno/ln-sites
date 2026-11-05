// node smoke.mjs <site|all>  Post-deploy smoke test. Exit 0 = pass. Exit 2 = FAIL -> run dep/rollback-<worker>.js with execute NOW.
import { CFG, site } from './deploylib.mjs';
const keys = process.argv[2] === 'all' ? Object.keys(CFG).filter(k => k[0] !== '_') : [process.argv[2]];
let fail = 0;
const get = async u => { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 'smoke=' + Date.now(), { redirect: 'manual', headers: { 'user-agent': 'LN-smoke/1.0' } }); return r };
for (const k of keys) {
  const s = site(k), out = [], bad = m => { out.push('FAIL ' + m); fail++ }, ok = m => out.push('ok   ' + m);
  const mods = s.biz ? await (await fetch('https://mothersauce.app/api/public/modules/' + s.biz)).json() : {}; // v35: minimal public flags
  if (s.biz) { const r = await fetch('https://mothersauce.app/api/modules/' + s.biz); r.status === 401 ? ok('/api/modules locked (401)') : bad('/api/modules public ' + r.status) }
  for (const p of s.pages_200) { const r = await get(s.base + p); r.status === 200 ? ok(p + ' 200') : bad(p + ' ' + r.status) }
  const h = await get(s.base + '/_headers'); h.status === 404 ? ok('/_headers 404') : bad('/_headers ' + h.status);
  for (const [p, m] of Object.entries(s.module_pages)) { if (mods[m] === true) continue; for (const q of [p, p + '.html']) { const r = await get(s.base + q); r.status === 404 ? ok(q + ' 404 (' + m + ' off)') : bad(q + ' ' + r.status + ' but ' + m + ' is OFF') } }
  if (s.noindex) { const r = await get(s.base + '/'); const x = r.headers.get('x-robots-tag') || ''; /noindex/.test(x) ? ok('noindex header') : bad('noindex header missing') }
  console.log('== ' + k + ' (' + s.worker + ')\n' + out.join('\n'));
  if (out.some(l => l.startsWith('FAIL'))) console.log('>>> ROLLBACK NOW: execute $file:/workspace/cf/dep/rollback-' + s.worker + '.js');
}
process.exit(fail ? 2 : 0);
