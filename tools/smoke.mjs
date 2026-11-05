// node tools/smoke.mjs <site|all> [--rollback]
// Post-deploy smoke test. Exit 0 = pass. Exit 2 = FAIL.
// With --rollback, a failed site is rolled back to the previous version through the API.
// CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required for that rollback.
// Run from the repo root.
import { site, CFG, rollbackScript, executeScript } from './deploylib.mjs';

const rollback = process.argv.includes('--rollback');
const args = process.argv.slice(2).filter(a => a !== '--rollback');
if (!args[0]) {
  console.error('usage: node tools/smoke.mjs <site|all> [--rollback]');
  process.exit(2);
}

const token = process.env.CLOUDFLARE_API_TOKEN || '';
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const keys = args[0] === 'all' ? Object.keys(CFG).filter(k => k[0] !== '_') : [args[0]];
const failed = [];

const get = async u => fetch(u + (u.includes('?') ? '&' : '?') + 'smoke=' + Date.now(), { redirect: 'manual', headers: { 'user-agent': 'LN-smoke/1.0' } });

for (const k of keys) {
  const s = site(k), out = [];
  const bad = m => { out.push('FAIL ' + m); };
  const ok = m => out.push('ok   ' + m);
  const mods = s.biz ? await (await fetch('https://mothersauce.app/api/public/modules/' + s.biz)).json() : {};
  if (s.biz) {
    const r = await fetch('https://mothersauce.app/api/modules/' + s.biz);
    r.status === 401 ? ok('/api/modules locked (401)') : bad('/api/modules public ' + r.status);
  }
  for (const p of s.pages_200) {
    const r = await get(s.base + p);
    r.status === 200 ? ok(p + ' 200') : bad(p + ' ' + r.status);
  }
  const h = await get(s.base + '/_headers');
  h.status === 404 ? ok('/_headers 404') : bad('/_headers ' + h.status);
  for (const [p, m] of Object.entries(s.module_pages)) {
    if (mods[m] === true) continue;
    for (const q of [p, p + '.html']) {
      const r = await get(s.base + q);
      r.status === 404 ? ok(q + ' 404 (' + m + ' off)') : bad(q + ' ' + r.status + ' but ' + m + ' is OFF');
    }
  }
  if (s.noindex) {
    const r = await get(s.base + '/');
    const x = r.headers.get('x-robots-tag') || '';
    /noindex/.test(x) ? ok('noindex header') : bad('noindex header missing');
  }
  console.log('== ' + k + ' (' + s.worker + ')\n' + out.join('\n'));
  if (out.some(l => l.startsWith('FAIL'))) {
    failed.push(k);
    console.log('ROLLBACK: node tools/deploylib.mjs rollback ' + k);
  }
}

if (failed.length && rollback) {
  if (!token || !accountId) {
    console.error('Cannot roll back: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set');
    process.exit(2);
  }
  for (const k of failed) {
    const s = site(k);
    console.log('rolling back ' + k + ' (' + s.worker + ')');
    const rb = await executeScript(rollbackScript(s));
    console.log(JSON.stringify(rb));
    if (!rb?.ok) {
      console.error('rollback failed for ' + k);
      process.exit(2);
    }
  }
}

process.exit(failed.length ? 2 : 0);
