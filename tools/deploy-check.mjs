// node deploy-check.mjs [live-settings.json]  Dry run: config + saved scripts (+ optional live bindings snapshot). No deploys.
import fs from 'fs'; import { CFG, site, precheck } from './deploylib.mjs';
let fail = 0; const say = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++ };
const live = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : null;
for (const k of Object.keys(CFG).filter(k => k[0] !== '_')) {
  const s = site(k); console.log('== ' + k);
  const e = precheck(s); say(!e.length, 'config ' + (e.join('; ') || 'complete'));
  const tp = `dep/s2tpl-${s.worker}.js`;
  if (fs.existsSync(tp)) { const t = fs.readFileSync(tp, 'utf8'), m = t.match(/CFG=(\{.*?\});/s); const cfg = m && JSON.parse(m[1]);
    say(!!cfg, tp + ' is generated from sites.config.json'); if (cfg) { const e2 = precheck(s, { assets: { config: cfg } }); say(!e2.length, tp + ' assets config ' + (e2.join('; ') || 'has run_worker_first + handling')) } }
  else say(false, tp + ' missing (run mkdeploy2)');
  if (live && live[s.worker]) { const lb = live[s.worker].bindings; const miss = s.bindings.filter(b => !lb.includes(b.type + ':' + b.name)); say(!miss.length, 'live bindings ' + (miss.length ? 'missing ' + miss.map(b => b.name) : 'all present'));
    const lc = live[s.worker].crons || []; say((s.crons || []).every(c => lc.includes(c)), 'live crons ' + JSON.stringify(lc)) }
}
process.exit(fail ? 1 : 0);
