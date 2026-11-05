// Shared deploy logic. Run from the repo root:
//   node tools/deploylib.mjs dry-run
//   node tools/deploylib.mjs deploy <loadednacho|meiji|cove|canrocks>
//   node tools/deploylib.mjs rollback <site>
//   node tools/deploylib.mjs changed <before-sha> <sha>
// Credentials come only from the environment. This file never shells out to wrangler.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const PRODUCTION_SITES = ['loadednacho', 'meiji', 'cove', 'canrocks'];
// These trees are never deployed, even if a commit touches them.
export const EXCLUDED_PREFIXES = ['sites/feast/', 'sites/toc/', 'sites/feast-toc-src/', 'shared/'];

export const CFG = JSON.parse(fs.readFileSync(path.join(HERE, 'sites.config.json'), 'utf8'));

export function cloudflareEnv() {
  return {
    token: process.env.CLOUDFLARE_API_TOKEN || '',
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
  };
}

export function requireCloudflareEnv() {
  const { token, accountId } = cloudflareEnv();
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set');
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set');
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error('CLOUDFLARE_ACCOUNT_ID is not a 32-character hex account id');
  return { token, accountId };
}

export function absPath(p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

export function assertRepoPath(p, label) {
  if (!p || path.isAbsolute(p) || p.startsWith('/') || p.split(/[/\\]/).includes('..')) {
    throw new Error(label + ' must be a relative path inside the repo, got ' + p);
  }
}

export const siteByWorker = w => Object.entries(CFG).find(([k, v]) => k[0] !== '_' && v.worker === w)?.[0];

export function site(key) {
  const k = CFG[key] ? key : siteByWorker(key);
  if (!k || k[0] === '_') throw new Error('unknown site ' + key + ' (add it to tools/sites.config.json)');
  const s = { key: k, ...CFG[k] };
  assertRepoPath(s.dir, k + '.dir');
  assertRepoPath(s.worker_src, k + '.worker_src');
  return s;
}

export function configKeys() {
  return Object.keys(CFG).filter(k => k[0] !== '_');
}

// Pre-deploy check: refuses if run_worker_first or required bindings are missing from config.
export function precheck(s, meta) {
  const err = [];
  if (s.assets?.run_worker_first !== true) err.push('config: run_worker_first must be true');
  for (const b of ['ASSETS', 'PORTAL']) if (!s.bindings.some(x => x.name === b)) err.push('config: required binding ' + b + ' missing');
  const portal = s.bindings.find(x => x.name === 'PORTAL');
  if (portal && portal.service !== 'ln-portal') err.push('config: PORTAL service must be ln-portal');
  if (meta) {
    if (meta.assets?.config?.run_worker_first !== true) err.push('script: assets.config.run_worker_first is not true');
    for (const k of ['html_handling', 'not_found_handling']) if (meta.assets?.config?.[k] !== s.assets[k]) err.push('script: assets.config.' + k + ' differs from config');
  }
  return err;
}

export function assetsConfig(s, dir) {
  const cfg = { ...s.assets };
  const base = dir || absPath(s.dir);
  const hp = path.join(base, s.headers_file || '_headers');
  if (fs.existsSync(hp)) cfg._headers = fs.readFileSync(hp, 'utf8');
  const rp = path.join(base, '_redirects');
  if (fs.existsSync(rp)) cfg._redirects = fs.readFileSync(rp, 'utf8');
  return cfg;
}

// Cloudflare REST API. Matches the old cloudflare.request({ method, path, body, contentType, rawBody }) shape.
export async function cfRequest({ method, path: apiPath, body, contentType, rawBody }) {
  const { token } = requireCloudflareEnv();
  const url = 'https://api.cloudflare.com/client/v4' + apiPath;
  const headers = { Authorization: 'Bearer ' + token };
  let payload;
  if (body != null) {
    if (rawBody) {
      payload = body;
      headers['Content-Type'] = contentType;
    } else {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
  }
  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  if (apiPath.endsWith('/content/v2') || ct.includes('multipart/form-data')) {
    if (!res.ok) throw new Error('CF ' + method + ' ' + apiPath + ' ' + res.status + ': ' + text.slice(0, 500));
    return text;
  }
  let json;
  try { json = text ? JSON.parse(text) : {}; }
  catch { throw new Error('CF ' + method + ' ' + apiPath + ' ' + res.status + ': response was not JSON'); }
  if (!res.ok || json.success === false) {
    const msg = JSON.stringify(json.errors || json).slice(0, 800);
    throw new Error('CF ' + method + ' ' + apiPath + ' ' + res.status + ': ' + msg);
  }
  return json;
}

// Run a generated deploy script with accountId and cloudflare.request in scope. No wrangler.
export async function executeScript(src) {
  const { accountId } = requireCloudflareEnv();
  const cloudflare = { request: opts => cfRequest(opts) };
  const fn = new Function('accountId', 'cloudflare', 'return (' + src + ');');
  return await fn(accountId, cloudflare)();
}

// The execute() script. Pre-flight against LIVE settings, PUT, post-verify, auto-rollback to the previous version on a failed post-verify.
export function s2Script(s, cfg, { workerSrc, jwt } = {}) {
  const req = s.bindings.map(b => ({ type: b.type, name: b.name }));
  const jwtJs = JSON.stringify(jwt || '__JWT__');
  const workerJs = workerSrc ? JSON.stringify(workerSrc) : 'null';
  return `async () => { const A='/accounts/'+accountId, NAME=${JSON.stringify(s.worker)}, REQ=${JSON.stringify(req)}, CRONS=${JSON.stringify(s.crons || [])}, CFG=${JSON.stringify(cfg)};
if(CFG.run_worker_first!==true) return {ok:false,refused:'run_worker_first missing'};
const st=(await cloudflare.request({method:'GET',path:A+'/workers/scripts/'+NAME+'/settings'})).result;
const live=st.bindings.map(b=>b.type+':'+b.name), miss=REQ.filter(r=>!live.includes(r.type+':'+r.name));
if(miss.length) return {ok:false,refused:'live worker is missing required bindings',missing:miss};
const prev=((await cloudflare.request({method:'GET',path:A+'/workers/scripts/'+NAME+'/deployments'})).result.deployments[0]||{}).versions;
let worker=${workerJs};
if(!worker){const c=await cloudflare.request({method:'GET',path:A+'/workers/scripts/'+NAME+'/content/v2'});const raw=typeof c==='string'?c:c.result;const i=raw.indexOf('\\r\\n\\r\\n');const bnd=raw.slice(0,raw.indexOf('\\r\\n'));worker=raw.slice(i+4,raw.lastIndexOf('\\r\\n'+bnd))}
const bindings=st.bindings.filter(b=>b.type!=='secret_text').map(b=>b.type==='d1'?{type:'d1',name:b.name,id:b.id||b.database_id}:b.type==='assets'?{type:'assets',name:b.name}:b);
const meta={main_module:'worker.js',compatibility_date:st.compatibility_date,keep_bindings:['secret_text'],assets:{jwt:${jwtJs},config:CFG},bindings,observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,head_sampling_rate:1,persist:true,invocation_logs:true}}};
if(Array.isArray(st.compatibility_flags)&&st.compatibility_flags.length) meta.compatibility_flags=st.compatibility_flags;
const b='----F'+Date.now();const body=['--'+b,'Content-Disposition: form-data; name="metadata"','Content-Type: application/json','',JSON.stringify(meta),'--'+b,'Content-Disposition: form-data; name="worker.js"; filename="worker.js"','Content-Type: application/javascript+module','',worker,'--'+b+'--',''].join('\\r\\n');
const up=await cloudflare.request({method:'PUT',path:A+'/workers/scripts/'+NAME,body,contentType:'multipart/form-data; boundary='+b,rawBody:true});
if(CRONS.length) await cloudflare.request({method:'PUT',path:A+'/workers/scripts/'+NAME+'/schedules',body:CRONS.map(cron=>({cron}))});
const st2=(await cloudflare.request({method:'GET',path:A+'/workers/scripts/'+NAME+'/settings'})).result, live2=st2.bindings.map(b=>b.type+':'+b.name), miss2=REQ.filter(r=>!live2.includes(r.type+':'+r.name));
const sc=(await cloudflare.request({method:'GET',path:A+'/workers/scripts/'+NAME+'/schedules'})).result.schedules.map(x=>x.cron), cm=CRONS.filter(c=>!sc.includes(c));
if(miss2.length||cm.length){ if(prev){ await cloudflare.request({method:'POST',path:A+'/workers/scripts/'+NAME+'/deployments',body:{strategy:'percentage',versions:prev}}); return {ok:false,rolledBack:prev,missing:miss2,missingCrons:cm}; } return {ok:false,missing:miss2,missingCrons:cm,rollback:'no previous version'}; }
return {ok:up.success,prev,run_worker_first:CFG.run_worker_first,next:'node tools/smoke.mjs '+${JSON.stringify(s.key)}}; }`;
}

// Rollback: redeploy the version that was live before the newest deployment.
export function rollbackScript(s) {
  return `async () => { const A='/accounts/'+accountId, NAME=${JSON.stringify(s.worker)}; const d=(await cloudflare.request({method:'GET',path:A+'/workers/scripts/'+NAME+'/deployments'})).result.deployments; if(d.length<2) return {ok:false,error:'no previous deployment'}; const r=await cloudflare.request({method:'POST',path:A+'/workers/scripts/'+NAME+'/deployments',body:{strategy:'percentage',versions:d[1].versions}}); return {ok:r.success,rolledBackTo:d[1].versions}; }`;
}

export function sitesFromPaths(paths) {
  const hit = new Set();
  for (const raw of paths) {
    if (!raw) continue;
    const norm = String(raw).replaceAll('\\', '/');
    if (EXCLUDED_PREFIXES.some(p => norm === p.slice(0, -1) || norm.startsWith(p))) continue;
    for (const name of PRODUCTION_SITES) {
      const prefix = 'sites/' + name + '/';
      if (norm === 'sites/' + name || norm.startsWith(prefix)) hit.add(name);
    }
  }
  return PRODUCTION_SITES.filter(n => hit.has(n));
}

export function changedProductionSites(before, sha) {
  if (!before || !sha || /^0+$/.test(before)) return [];
  const out = spawnSync('git', ['diff', '--name-status', '-M', before, sha], { cwd: ROOT, encoding: 'utf8' });
  if (out.status !== 0) throw new Error((out.stderr || 'git diff failed').trim());
  const paths = [];
  for (const line of out.stdout.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    paths.push(...parts.slice(1));
  }
  return sitesFromPaths(paths);
}

function refuseUnlessProduction(key) {
  if (!PRODUCTION_SITES.includes(key)) {
    throw new Error('refusing to deploy ' + key + '. Production sites are ' + PRODUCTION_SITES.join(', ') + '. sites/feast, sites/toc, sites/feast-toc-src, and shared/* are excluded.');
  }
}

async function buildOne(key) {
  const { writeArtifacts } = await import('./mkdeploy2.mjs');
  const s = site(key);
  const workerSrc = fs.readFileSync(absPath(s.worker_src), 'utf8');
  const built = writeArtifacts({ siteObj: s, workerSrc });
  if (!built.ok) {
    throw new Error('REFUSING TO BUILD DEPLOY for ' + key + ':\n - ' + built.bad.join('\n - '));
  }
  return { s, workerSrc, built };
}

async function dryRun() {
  console.log('dry run only; no Cloudflare API calls and no deploy');
  const { token, accountId } = cloudflareEnv();
  console.log('cloudflare env: token ' + (token ? 'set' : 'missing') + ', account ' + (accountId ? 'set' : 'missing'));
  let failed = 0;
  for (const key of configKeys()) {
    try {
      const { built } = await buildOne(key);
      console.log('ok   ' + key + ' (' + built.workerName + ') assets ' + built.count + (built.skipped.length ? ' skipped ' + built.skipped.length : ''));
    } catch (err) {
      failed++;
      console.error('FAIL ' + key + ': ' + err.message);
    }
  }
  if (failed) process.exit(2);
}

async function deploy(key) {
  refuseUnlessProduction(key);
  const { built, workerSrc } = await buildOne(key);
  const s = site(key);
  requireCloudflareEnv();
  console.log('pre-check ok for ' + key + ' (' + s.worker + '); deploying with existing bindings and run_worker_first');
  const session = await executeScript(built.s1);
  if (!session?.jwt) throw new Error('asset upload session did not return a jwt');
  const { uploadAssets } = await import('./up2.mjs');
  const jwt = await uploadAssets(absPath(s.dir), session);
  console.log('assets uploaded (' + (session.buckets?.length || 0) + ' buckets)');
  let result;
  try {
    result = await executeScript(s2Script(s, built.cfg, { workerSrc, jwt }));
  } catch (err) {
    console.error('deploy request failed: ' + err.message);
    console.error('No automatic rollback: a failed PUT does not by itself mean a new version went live. Check deployments before rolling back.');
    process.exit(2);
  }
  console.log(JSON.stringify({ ...result, prev: result?.prev ? '[versions]' : result?.prev }));
  if (!result?.ok) process.exit(2);
  const smoke = spawnSync(process.execPath, [path.join(HERE, 'smoke.mjs'), key, '--rollback'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(smoke.status == null ? 1 : smoke.status);
}

async function rollback(key) {
  refuseUnlessProduction(key);
  requireCloudflareEnv();
  const s = site(key);
  const result = await executeScript(rollbackScript(s));
  console.log(JSON.stringify(result));
  if (!result?.ok) process.exit(2);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  const run = async () => {
    if (cmd === 'dry-run') await dryRun();
    else if (cmd === 'deploy') await deploy(arg);
    else if (cmd === 'rollback') await rollback(arg);
    else if (cmd === 'changed') {
      for (const name of changedProductionSites(arg, process.argv[4])) console.log(name);
    } else {
      console.error('usage: node tools/deploylib.mjs dry-run | deploy <site> | rollback <site> | changed <before> <sha>');
      process.exit(2);
    }
  };
  run().catch(err => {
    console.error(err && err.message ? err.message : err);
    process.exit(2);
  });
}
