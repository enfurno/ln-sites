// node upload.mjs <feast-preview|toc-preview> [--dry-run]
//
// Uploads dist/<brand>.js to the matching PREVIEW worker through the Cloudflare API
// (tools/deploylib.mjs client, never wrangler), carrying the bindings build.mjs wrote
// into dist/<brand>.meta.json and re-enabling the workers.dev subdomain.
//
// The worker name comes from the meta file and must be one of two hard-coded names.
// There is no env var, flag or argument that can retarget this at the production
// workers (feast-loadednacho, tasteofchina-loadednacho): the allowlist below is the
// only place a name is accepted, and the upload refuses anything else before it
// reads a token or touches the network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireCloudflareEnv, executeScript } from '../../tools/deploylib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Only these two, ever. Adding a name here is a deliberate edit to a diff, not a typo
// in a shell.
const ALLOWED = ['feast-preview', 'toc-preview'];

const argv = process.argv.slice(2);
const brand = argv[0];
const dryRun = argv.includes('--dry-run');

function die(msg) {
  console.error('upload: ' + msg);
  process.exit(1);
}

if (!brand) die('usage: node upload.mjs <' + ALLOWED.join('|') + '> [--dry-run]');
if (!ALLOWED.includes(brand)) {
  die('refusing to upload "' + brand + '": allowed workers are ' + ALLOWED.join(', ') +
      '. The production workers are not upload targets from here.');
}

const bundlePath = path.join(HERE, 'dist', brand + '.js');
const metaPath = path.join(HERE, 'dist', brand + '.meta.json');

if (!fs.existsSync(metaPath)) {
  die('missing ' + path.relative(HERE, metaPath) + ' — run `node build.mjs` first (it writes the bundle and its metadata together).');
}
if (!fs.existsSync(bundlePath)) {
  die('missing ' + path.relative(HERE, bundlePath) + ' — run `node build.mjs` first.');
}

let meta;
try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); }
catch (e) { die('metadata is not valid JSON: ' + e.message); }

if (!meta.worker) die('metadata has no worker name; refusing to guess one.');
if (meta.worker !== brand) {
  die('metadata names worker "' + meta.worker + '" but the requested brand is "' + brand + '"; refusing (a swapped dist would upload the wrong page).');
}
if (!ALLOWED.includes(meta.worker)) die('metadata worker "' + meta.worker + '" is not on the allowlist.');
if (!Array.isArray(meta.bindings)) die('metadata has no bindings array; refusing to upload and drop the worker bindings.');
if (!meta.compatibility_date) die('metadata has no compatibility_date.');

const code = fs.readFileSync(bundlePath, 'utf8');
if (!code.includes('export default')) die('the bundle does not look like a worker module (no `export default`).');

const summary = {
  worker: meta.worker,
  bytes: Buffer.byteLength(code),
  bindings: meta.bindings.map(b => b.type + ':' + b.name),
  compatibility_date: meta.compatibility_date,
};

if (dryRun) {
  console.log(JSON.stringify({ ok: true, dryRun: true, ...summary }));
  process.exit(0);
}

try { requireCloudflareEnv(); }
catch (e) { die(e.message + ' — set both in the environment (the workflow passes them from repository secrets).'); }

const script = `async () => {
  const NAME = ${JSON.stringify(meta.worker)};
  const META = ${JSON.stringify({ main_module: 'worker.js', compatibility_date: meta.compatibility_date, bindings: meta.bindings })};
  const CODE = ${JSON.stringify(code)};
  const b = 'F' + Date.now();
  const body = ['--' + b, 'Content-Disposition: form-data; name="metadata"', 'Content-Type: application/json', '', JSON.stringify(META),
    '--' + b, 'Content-Disposition: form-data; name="worker.js"; filename="worker.js"', 'Content-Type: application/javascript+module', '', CODE,
    '--' + b + '--', ''].join('\\r\\n');
  const put = await cloudflare.request({ method: 'PUT', path: '/accounts/' + accountId + '/workers/scripts/' + NAME, body, contentType: 'multipart/form-data; boundary=' + b, rawBody: true });
  const sub = await cloudflare.request({ method: 'POST', path: '/accounts/' + accountId + '/workers/scripts/' + NAME + '/subdomain', body: { enabled: true, previews_enabled: false } });
  return { ok: put.success !== false, id: put.result && put.result.id, subdomain: sub.success !== false, name: NAME };
}`;

let out;
try {
  out = await executeScript(script);
} catch (e) {
  die('upload failed for ' + meta.worker + ': ' + e.message);
}

if (!out || out.ok !== true) {
  die('Cloudflare did not confirm the upload for ' + meta.worker + ': ' + JSON.stringify(out));
}

console.log(JSON.stringify({
  ok: true,
  worker: out.name || meta.worker,
  scriptId: out.id || null,
  bytes: summary.bytes,
  subdomainEnabled: out.subdomain === true,
  bindings: summary.bindings,
}));