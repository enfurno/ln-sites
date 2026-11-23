// Post-deploy asset freshness: compare a static file the module gate never rewrites.
// The gate strips `data-ln-mod` elements from HTML, so comparing HTML would false-fail;
// a stylesheet is served byte-for-byte from the uploaded asset set.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Each site declares what it actually ships under `fresh_files` in tools/sites.config.json.
// The guard reads the first candidate that exists locally; if none does, it fails rather than
// printing a skip, because a check that cannot run must not look like a check that passed.
export const DEFAULT_FILES = ['assets/styles.css', 'assets/style.css'];

const sha = b => crypto.createHash('sha256').update(b).digest('hex');

export async function checkFreshness(siteObj, { file, base = siteObj.base, root = process.cwd() } = {}) {
  const candidates = file ? [file] : (siteObj.fresh_files || DEFAULT_FILES);
  const found = candidates.map(f => ({ f, p: path.resolve(root, siteObj.dir, f) })).find(x => fs.existsSync(x.p));
  if (!found) return { ok: false, error: 'no freshness candidate exists under ' + siteObj.dir + ' (tried ' + candidates.join(', ') + ')' };
  file = found.f;
  const local = found.p;
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
  if (r.ok) { console.log('fresh  ' + siteObj.worker + ' ' + r.file + ' matches live'); return r; }
  if (r.error && !r.url) throw new Error('FRESHNESS CANNOT RUN: ' + r.error + '. Refusing to call this deploy verified.');
  throw new Error('STALE ASSETS: ' + (r.url || '') + ' does not match the repo (' + (r.error || (r.want + ' != ' + r.got)) + '). The upload reported success but the live asset set is older. Do not trust this deploy.');
}
