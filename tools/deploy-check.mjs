// node tools/deploy-check.mjs [live-settings.json]
// Dry run: config + generated dep/s2tpl scripts (+ optional live bindings). No deploys.
// Run from the repo root. When CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are set and no
// snapshot file is given, live bindings are read with GET only. Missing credentials skip that read.
import fs from 'fs';
import path from 'path';
import { CFG, site, precheck, absPath, cfRequest, configKeys } from './deploylib.mjs';

// Exact binding contract. type:name, and the PORTAL service target. Do not drop these.
const BINDINGS = {
  meiji: ['assets:ASSETS', 'd1:DB', 'service:PORTAL:ln-portal', 'secret_text:BREVO_API_KEY'],
  canrocks: ['assets:ASSETS', 'd1:DB', 'service:PORTAL:ln-portal'],
  cove: ['assets:ASSETS', 'd1:DB', 'service:PORTAL:ln-portal', 'r2_bucket:RESUMES', 'plain_text:RESERVE_EMAIL_ENABLED', 'plain_text:CAREERS_EMAIL_ENABLED', 'plain_text:RESERVE_NOTIFY_TO', 'plain_text:CAREERS_NOTIFY_TO'],
  loadednacho: ['assets:ASSETS', 'd1:DB', 'service:PORTAL:ln-portal'],
  'cove-staging': ['assets:ASSETS', 'd1:DB', 'service:PORTAL:ln-portal', 'r2_bucket:RESUMES', 'plain_text:RESERVE_EMAIL_ENABLED', 'plain_text:CAREERS_EMAIL_ENABLED', 'plain_text:RESERVE_NOTIFY_TO', 'plain_text:CAREERS_NOTIFY_TO'],
};

function bindingId(b) {
  return b.type + ':' + b.name + (b.service ? ':' + b.service : '');
}

function extractCfg(src) {
  const at = src.indexOf('CFG=');
  if (at < 0) return null;
  const start = src.indexOf('{', at);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return JSON.parse(src.slice(start, i + 1));
    }
  }
  return null;
}

const token = process.env.CLOUDFLARE_API_TOKEN || '';
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
let fail = 0;
const say = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };

let live = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : null;

async function maybeLive() {
  if (live || !token || !accountId) {
    if (!live) console.log('live bindings not checked (set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, or pass a snapshot). Deploy still refuses if a live binding is missing.');
    return;
  }
  console.log('reading live bindings (GET only, no deploy)');
  live = {};
  for (const k of configKeys()) {
    const s = site(k);
    const settings = await cfRequest({ method: 'GET', path: '/accounts/' + accountId + '/workers/scripts/' + s.worker + '/settings' });
    const sched = await cfRequest({ method: 'GET', path: '/accounts/' + accountId + '/workers/scripts/' + s.worker + '/schedules' });
    const schedules = Array.isArray(sched.result) ? sched.result : (sched.result?.schedules || []);
    live[s.worker] = {
      bindings: settings.result.bindings.map(b => b.type + ':' + b.name),
      crons: schedules.map(x => x.cron),
    };
  }
}

await maybeLive();

for (const k of Object.keys(CFG).filter(k => k[0] !== '_')) {
  const s = site(k);
  console.log('== ' + k);
  const expected = BINDINGS[k];
  const got = s.bindings.map(bindingId).slice().sort();
  say(!!expected && JSON.stringify(got) === JSON.stringify(expected.slice().sort()), 'bindings ' + got.join(', '));
  const e = precheck(s);
  say(!e.length, 'config ' + (e.join('; ') || 'complete'));
  for (const rel of [s.dir, s.worker_src]) {
    say(!path.isAbsolute(rel) && fs.existsSync(absPath(rel)), rel + ' exists');
  }
  // Every site worker carries the Mother Sauce website chat injection, so the bubble is default on
  // existing and new sites and its on/off stays in Mother Sauce > AI assistant > Website chat assistant.
  const wsrc = fs.existsSync(absPath(s.worker_src)) ? fs.readFileSync(absPath(s.worker_src), 'utf8') : '';
  say(wsrc.includes('msChatInject') && wsrc.includes('mothersauce.app/embed/chat.js'), 'worker carries the Mother Sauce chat injection');
  const relTpl = path.join('dep', 's2tpl-' + s.worker + '.js');
  const tp = absPath(relTpl);
  if (fs.existsSync(tp)) {
    const t = fs.readFileSync(tp, 'utf8');
    const cfg = extractCfg(t);
    say(!!cfg && t.includes('keep_bindings:[\'secret_text\']') && t.includes('run_worker_first'), relTpl + ' keeps bindings and run_worker_first');
    if (cfg) {
      const e2 = precheck(s, { assets: { config: cfg } });
      say(!e2.length, 'assets config ' + (e2.join('; ') || 'has run_worker_first + handling'));
    }
    for (const b of s.bindings) say(t.includes(JSON.stringify({ type: b.type, name: b.name }).slice(1, -1)) || t.includes('"type":"' + b.type + '","name":"' + b.name + '"'), 'template lists ' + b.type + ':' + b.name);
  } else say(false, tp + ' missing (run: node tools/deploylib.mjs dry-run)');
  if (live && live[s.worker]) {
    const lb = live[s.worker].bindings;
    const miss = s.bindings.filter(b => !lb.includes(b.type + ':' + b.name));
    say(!miss.length, 'live bindings ' + (miss.length ? 'missing ' + miss.map(b => b.name).join(', ') : 'all present'));
    const lc = live[s.worker].crons || [];
    say((s.crons || []).every(c => lc.includes(c)), 'live crons ' + JSON.stringify(lc));
  }
}

process.exit(fail ? 1 : 0);
