// node tools/mkdeploy2.mjs <dir> <site-or-worker> [worker-src.js]
// Run from the repo root. Writes dep/s1-<worker>.js, dep/s2tpl-<worker>.js, dep/rollback-<worker>.js.
// Asset config, bindings, and crons come only from tools/sites.config.json. Refuses to build if
// run_worker_first or the ASSETS/PORTAL bindings are missing. Does not upload anything.
// Allowlist of public extensions only; _headers is sent as config, not as a public file.
import fs from 'fs';
import path from 'path';
import { blake3 } from '@noble/hashes/blake3.js';
import { pathToFileURL } from 'url';
import { ROOT, absPath, site, precheck, assetsConfig, s2Script, rollbackScript } from './deploylib.mjs';

export const MIME = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', xml: 'application/xml; charset=utf-8', txt: 'text/plain; charset=utf-8',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
  svg: 'image/svg+xml', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', pdf: 'application/pdf',
  mp4: 'video/mp4', webm: 'video/webm', webmanifest: 'application/manifest+json',
};

export const allowed = p => {
  const b = path.basename(p);
  if (b.startsWith('.')) return false;
  if (/^(robots\.txt)$/.test(b)) return true;
  const e = path.extname(b).slice(1).toLowerCase();
  return e !== 'txt' && e in MIME;
};

export const hashOf = (b64, ext) => Buffer.from(blake3(Buffer.from(b64 + ext + '|mime1'))).toString('hex').slice(0, 32);

export function buildManifest(dir) {
  const M = {};
  const skipped = [];
  const walk = d => fs.readdirSync(d).forEach(f => {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (!f.startsWith('.')) walk(p); return; }
    const k = '/' + path.relative(dir, p).split(path.sep).join('/');
    if (!allowed(p)) { skipped.push(k); return; }
    const b64 = fs.readFileSync(p).toString('base64');
    M[k] = { hash: hashOf(b64, path.extname(p).slice(1)), size: fs.statSync(p).size };
  });
  walk(dir);
  return { manifest: M, skipped };
}

export function s1Script(workerName, manifest) {
  return `async () => { const s=await cloudflare.request({method:'POST',path:'/accounts/'+accountId+'/workers/scripts/'+${JSON.stringify(workerName)}+'/assets-upload-session',body:{manifest:${JSON.stringify(manifest)}}}); return s.result; }`;
}

export function writeArtifacts({ siteObj, workerSrc, dir }) {
  const assetDir = absPath(dir || siteObj.dir);
  const { manifest, skipped } = buildManifest(assetDir);
  const cfg = assetsConfig(siteObj, assetDir);
  const bad = precheck(siteObj, { assets: { config: cfg } });
  if (bad.length) return { ok: false, bad, skipped };
  const dep = path.join(ROOT, 'dep');
  fs.mkdirSync(dep, { recursive: true });
  const workerName = siteObj.worker;
  const s1 = s1Script(workerName, manifest);
  const s2 = s2Script(siteObj, cfg, { workerSrc: workerSrc || null });
  const rb = rollbackScript(siteObj);
  fs.writeFileSync(path.join(dep, 's1-' + workerName + '.js'), s1);
  fs.writeFileSync(path.join(dep, 's2tpl-' + workerName + '.js'), s2);
  fs.writeFileSync(path.join(dep, 'rollback-' + workerName + '.js'), rb);
  return { ok: true, manifest, skipped, cfg, s1, s2, rb, workerName, count: Object.keys(manifest).length };
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  const token = process.env.CLOUDFLARE_API_TOKEN || '';
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  console.error('cloudflare env: token ' + (token ? 'set' : 'missing') + ', account ' + (accountId ? 'set' : 'missing'));
  const [dirArg, name, workerArg] = process.argv.slice(2);
  if (!dirArg || !name) {
    console.error('usage: node tools/mkdeploy2.mjs <dir> <site-or-worker> [worker-src.js]');
    process.exit(2);
  }
  const S = site(name);
  const dir = path.isAbsolute(dirArg) ? dirArg : absPath(dirArg);
  const workerSrc = workerArg ? fs.readFileSync(path.isAbsolute(workerArg) ? workerArg : absPath(workerArg), 'utf8') : null;
  const built = writeArtifacts({ siteObj: S, workerSrc, dir });
  if (!built.ok) {
    console.error('REFUSING TO BUILD DEPLOY for ' + name + ':\n - ' + built.bad.join('\n - '));
    process.exit(2);
  }
  const shown = { ...built.cfg, _headers: built.cfg._headers ? '(from ' + (S.headers_file || '_headers') + ')' : undefined };
  console.log(built.workerName, built.count, 'skipped', built.skipped, shown);
}
