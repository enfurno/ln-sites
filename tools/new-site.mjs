// Scaffold a new client site from sites/_template.
//   node tools/new-site.mjs <slug>
// Copies the template, wires the slug, and adds the site to tools/sites.config.json.
// It refuses to overwrite an existing site. Business facts are never typed in here; they come
// from Mother Sauce through the bridge.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONFIG = path.join(HERE, 'sites.config.json');
const TEMPLATE = path.join(ROOT, 'sites', '_template');

const slug = (process.argv[2] || '').trim();
if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) {
  console.error('usage: node tools/new-site.mjs <slug>   (lowercase letters, digits, dashes)');
  process.exit(2);
}

const dir = path.join(ROOT, 'sites', slug);
const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
if (fs.existsSync(dir)) {
  console.error('refusing: sites/' + slug + ' already exists');
  process.exit(1);
}
if (cfg[slug]) {
  console.error('refusing: ' + slug + ' is already in tools/sites.config.json');
  process.exit(1);
}

const base = 'https://' + slug + '.loadednacho.com';
fs.cpSync(TEMPLATE, dir, { recursive: true });
const workerPath = path.join(dir, 'worker.js');
const worker = fs.readFileSync(workerPath, 'utf8')
  .replaceAll('__SLUG__', slug)
  .replaceAll('__BASE__', base.replace(/^https:\/\//, ''));
fs.writeFileSync(workerPath, worker);

cfg[slug] = {
  worker: slug + '-preview',
  dir: 'sites/' + slug + '/public',
  worker_src: 'sites/' + slug + '/worker.js',
  base,
  biz: slug,
  assets: { html_handling: 'auto-trailing-slash', not_found_handling: '404-page', run_worker_first: true },
  headers_file: '_headers',
  bindings: [
    { type: 'assets', name: 'ASSETS' },
    { type: 'service', name: 'PORTAL', service: 'ln-portal' },
  ],
  crons: [],
  noindex: true,
  pages_200: ['/'],
  module_pages: {},
};
fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 1) + '\n');

console.log('created sites/' + slug + ' and added "' + slug + '" to tools/sites.config.json');
console.log('base: ' + base + ' (change it to the client domain)');
console.log('remaining steps:');
console.log('  1. Design pass: markup, CSS, images, copy. No business facts typed in.');
console.log('  2. Put the real domain in tools/sites.config.json and the worker LN_SITE.base.');
console.log('  3. Add "' + slug + '" to PRODUCTION_SITES in tools/deploylib.mjs and to the deploy.yml case.');
console.log('  4. Run: node tools/bridge.mjs --check && node tools/deploylib.mjs dry-run');
console.log('  5. Deploy, then: node tools/test-bridge.mjs ' + slug);
