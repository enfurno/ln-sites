// Keep the shared offers renderer identical in every site that uses it.
//   node tools/offers.mjs --check   # fail when a site copy differs from the source
//   node tools/offers.mjs --sync    # write the source into each site copy
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'shared/ln-bridge/offers.js');
const TARGETS = [
  'sites/cove/public/assets/offers.js',
  'sites/meiji/public/assets/offers.js',
];
const mode = process.argv[2] || '--check';
const source = fs.readFileSync(SRC, 'utf8');

if (mode === '--sync') {
  for (const rel of TARGETS) fs.writeFileSync(path.join(ROOT, rel), source);
  console.log('offers sync ok: ' + TARGETS.length + ' site copy/copies');
  process.exit(0);
}
if (mode !== '--check') {
  console.error('usage: node tools/offers.mjs --check | --sync');
  process.exit(2);
}

let failed = 0;
for (const rel of TARGETS) {
  const file = path.join(ROOT, rel);
  const copy = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (copy !== source) {
    console.error('FAIL ' + rel + ' differs from shared/ln-bridge/offers.js (run node tools/offers.mjs --sync)');
    failed++;
  }
}
if (failed) process.exit(1);
console.log('offers check ok: ' + TARGETS.length + ' site copy/copies match shared/ln-bridge/offers.js');
