// node tools/up2.mjs <dir> <sess.json>
// Uploads asset buckets from an assets-upload-session and prints the completion jwt.
// Run from the repo root. The account id comes from CLOUDFLARE_ACCOUNT_ID.
// The upload endpoint authorizes with the session jwt. CLOUDFLARE_API_TOKEN must still be
// set so this step only runs as part of an authenticated deploy; it is not sent here.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { MIME, allowed, hashOf } from './mkdeploy2.mjs';
import { absPath } from './deploylib.mjs';

export async function uploadAssets(dir, session) {
  const token = process.env.CLOUDFLARE_API_TOKEN || '';
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set');
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set');
  if (!session?.jwt) throw new Error('asset session is missing jwt');
  const C = {};
  const walk = d => fs.readdirSync(d).forEach(f => {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (!f.startsWith('.')) walk(p); return; }
    if (!allowed(p)) return;
    const e = path.extname(p).slice(1);
    const b64 = fs.readFileSync(p).toString('base64');
    C[hashOf(b64, e)] = [b64, MIME[e.toLowerCase()] || 'application/octet-stream'];
  });
  walk(dir);
  let jwt = session.jwt;
  const buckets = session.buckets || [];
  for (const bucket of buckets) {
    const fd = new FormData();
    for (const h of bucket) {
      const file = C[h];
      if (!file) throw new Error('asset hash ' + h + ' is not in ' + dir);
      fd.append(h, new Blob([file[0]], { type: file[1] }), h);
    }
    const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/workers/assets/upload?base64=true', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + jwt },
      body: fd,
    });
    const j = await r.json();
    console.error(r.status, j.success, JSON.stringify(j.errors || ''));
    if (!r.ok || j.success === false) throw new Error('asset upload failed: ' + JSON.stringify(j.errors || j).slice(0, 500));
    if (j.result?.jwt) jwt = j.result.jwt;
  }
  if (buckets.length && jwt === session.jwt) throw new Error('asset upload did not return a completion jwt');
  return jwt;
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  const [dirArg, sessArg, extra] = process.argv.slice(2);
  if (!dirArg || !sessArg) {
    console.error('usage: node tools/up2.mjs <dir> <sess.json>');
    process.exit(2);
  }
  if (extra) console.error('ignoring account id argument; using CLOUDFLARE_ACCOUNT_ID');
  const dir = path.isAbsolute(dirArg) ? dirArg : absPath(dirArg);
  const session = JSON.parse(fs.readFileSync(sessArg, 'utf8'));
  uploadAssets(dir, session).then(jwt => {
    console.log(jwt);
  }).catch(err => {
    console.error(err && err.message ? err.message : err);
    process.exit(2);
  });
}
