// Post-deploy asset freshness: compare a static file the module gate never rewrites.
// The gate strips `data-ln-mod` elements from HTML, so comparing HTML would false-fail;
// a stylesheet is served byte-for-byte from the uploaded asset set.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const FRESH_FILE = 'assets/styles.css';

const sha = b => crypto.createHash('sha256').update(b).digest('hex');

export async function checkFreshness(siteObj, { file = FRESH_FILE, base = siteObj.base, root = process.cwd() } = {}) {
  const local = path.resolve(root, siteObj.dir, file);
  if (!fs.existsSync(local)) return { ok: true, skipped: 'no ' + file };
  const want = sha(fs.readFileSync(local));
  const url = String(base).replace(/\/$/, '') + '/' + file + '?freshness=' + Date.now();
  let res;
  try {
    res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  } catch (e) {
    return { ok: false, url, error: 'fetch failed: ' + (e && e.message) };
  }
  if (!res.ok) return { ok: false, url, error: 'HTTP ' + res.status };
  const got = sha(Buffer.from(await res.arrayBuffer()));
  return { ok: got === want, url, file, want, got };
}

// Throws (fails the deploy) only on a real mismatch. A skipped file is not a failure.
export async function assertFresh(siteObj, opts) {
  const r = await checkFreshness(siteObj, opts);
  if (r.ok) { console.log('fresh  ' + siteObj.worker + ' ' + (r.file || '') + (r.skipped ? ' (skipped: ' + r.skipped + ')' : '') + ' matches live'); return r; }
  throw new Error('STALE ASSETS: ' + (r.url || '') + ' does not match the repo (' + (r.error || (r.want + ' != ' + r.got)) + '). The upload reported success but the live asset set is older. Do not trust this deploy.');
}
