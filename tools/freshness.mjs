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

// A deploy that just uploaded can still be served an older asset from the edge for a few
// seconds, which used to fail a deploy whose bytes were already correct (runs 45705662187 and
// 45730570679). The check waits and looks again; a genuinely stale asset still fails, after
// every attempt has run out. Override the budget with FRESHNESS_ATTEMPTS / FRESHNESS_DELAY_MS.
const ATTEMPTS = Number(process.env.FRESHNESS_ATTEMPTS || 7);
const DELAY_MS = Number(process.env.FRESHNESS_DELAY_MS || 6000);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function checkFreshness(siteObj, { file, base = siteObj.base, root = process.cwd(), attempts = ATTEMPTS, delayMs = DELAY_MS } = {}) {
  const candidates = file ? [file] : (siteObj.fresh_files || DEFAULT_FILES);
  const found = candidates.map(f => ({ f, p: path.resolve(root, siteObj.dir, f) })).find(x => fs.existsSync(x.p));
  if (!found) return { ok: false, error: 'no freshness candidate exists under ' + siteObj.dir + ' (tried ' + candidates.join(', ') + ')' };
  file = found.f;
  const local = found.p;
  const want = sha(fs.readFileSync(local));
  const origin = String(base).replace(/\/$/, '');
  let url = origin + '/' + file;
  let got = '';
  let tries = 0;
  let lastError = '';
  for (let i = 0; i < Math.max(1, attempts); i++) {
    tries++;
    url = origin + '/' + file + '?freshness=' + Date.now();
    let res;
    try {
      res = await fetch(url, { headers: { 'cache-control': 'no-cache', pragma: 'no-cache' } });
    } catch (e) {
      lastError = 'fetch failed: ' + (e && e.message);
    }
    if (res && res.ok) {
      got = sha(Buffer.from(await res.arrayBuffer()));
      lastError = '';
      if (got === want) return { ok: true, url, file, want, got, tries };
    } else if (res) {
      lastError = 'HTTP ' + res.status;
    }
    if (i < attempts - 1) await sleep(delayMs);
  }
  if (lastError) return { ok: false, url, error: lastError, tries };
  return { ok: false, url, file, want, got, tries, error: '' };
}

// Throws (fails the deploy) only on a real mismatch. A skipped file is not a failure.
export async function assertFresh(siteObj, opts) {
  const r = await checkFreshness(siteObj, opts);
  if (r.ok) { console.log('fresh  ' + siteObj.worker + ' ' + r.file + ' matches live' + (r.tries > 1 ? ' (after ' + r.tries + ' tries)' : '')); return r; }
  if (r.error && !r.url) throw new Error('FRESHNESS CANNOT RUN: ' + r.error + '. Refusing to call this deploy verified.');
  throw new Error('STALE ASSETS: ' + (r.url || '') + ' does not match the repo (' + (r.error || (r.want + ' != ' + r.got)) + ') after ' + (r.tries || 1) + ' attempt(s). The upload reported success but the live asset set is older. Do not trust this deploy.');
}
