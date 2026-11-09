// Compares every site's repo worker.js with the script actually running on
// Cloudflare, so drift is visible before it turns into a diff against old files.
//
//   CLOUDFLARE_API_TOKEN=... node tools/verify-live.mjs [--verbose]
//
// Exit code 1 when any site differs from live.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || '1dff9fd00b30d94667191b97494a1fbe';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const VERBOSE = process.argv.includes('--verbose');

// Sites the deploy workflow covers are read straight from sites.config.json.
// These three are not in it (they deploy outside the workflow) but still need
// their repo files to mirror what is live.
const EXTRA = [
  { site: 'toc', worker: 'tasteofchina-loadednacho', file: 'sites/toc/worker.js' },
  { site: 'feast', worker: 'feast-loadednacho', file: 'sites/feast/worker.js' },
  { site: 'storage-api', worker: 'storage-api-preview', file: 'sites/storage-api/worker.js' }
];

function normalize(text) {
  // Line endings are the only difference we do not care about; the payload is
  // compared exactly after they are unified.
  return text.replace(/\r\n/g, '\n');
}

function parseMultipart(raw) {
  const boundary = raw.match(/^--([^\r\n]+)/);
  if (!boundary) return raw;
  const start = raw.indexOf('\r\n\r\n');
  let body = start >= 0 ? raw.slice(start + 4) : raw;
  const end = body.lastIndexOf(`\r\n--${boundary[1]}`);
  if (end >= 0) body = body.slice(0, end);
  return body;
}

async function liveScript(worker) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/services/${worker}/environments/production/content`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`${worker}: HTTP ${res.status}`);
  return parseMultipart(await res.text());
}

function lineCount(text) {
  return text.split('\n').length;
}

async function main() {
  if (!TOKEN) {
    console.error('CLOUDFLARE_API_TOKEN is not set.');
    process.exit(2);
  }

  const config = JSON.parse(await readFile(join(ROOT, 'tools/sites.config.json'), 'utf8'));
  const seen = new Set();
  const targets = [];

  for (const [site, entry] of Object.entries(config)) {
    if (site.startsWith('_') || !entry?.worker || !entry?.worker_src) continue;
    if (seen.has(entry.worker_src)) continue;
    seen.add(entry.worker_src);
    targets.push({ site, worker: entry.worker, file: entry.worker_src });
  }
  for (const extra of EXTRA) {
    if (seen.has(extra.file)) continue;
    seen.add(extra.file);
    targets.push(extra);
  }

  let drift = 0;
  const rows = [];

  for (const { site, worker, file } of targets) {
    const path = join(ROOT, file);
    if (!existsSync(path)) {
      rows.push([site, worker, 'MISSING', '-', '-']);
      drift++;
      continue;
    }
    const repo = normalize(await readFile(path, 'utf8'));
    let live;
    try {
      live = normalize(await liveScript(worker));
    } catch (err) {
      rows.push([site, worker, 'ERROR', '-', String(err.message).slice(0, 40)]);
      drift++;
      continue;
    }
    const same = repo === live;
    if (!same) drift++;
    rows.push([
      site,
      worker,
      same ? 'match' : 'DIFFERS',
      `${lineCount(repo)}/${lineCount(live)}`,
      same ? '' : `${repo.length - live.length} chars`
    ]);
  }

  const width = (i) => Math.max(...rows.map((r) => String(r[i]).length), 0);
  const pad = (v, i) => String(v).padEnd(width(i));
  for (const r of rows) {
    console.log([pad(r[0], 0), pad(r[1], 1), pad(r[2], 2), pad(r[3], 3), r[4]].join('  ').trimEnd());
  }

  if (drift) {
    console.log(`\n${drift} of ${rows.length} site(s) differ from live.`);
    if (!VERBOSE) console.log('Re-run with --verbose for the full comparison.');
    process.exit(1);
  }
  console.log(`\nAll ${rows.length} site workers match live.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});