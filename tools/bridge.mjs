// Inject the shared LN bridge module into site workers at deploy time.
// The workers are uploaded as one module each (tools/deploylib.mjs, no bundler), so the block is
// copied between markers. Run:
//   node tools/bridge.mjs --check   fail when a site block differs from shared/ln-bridge/hours.js
//   node tools/bridge.mjs --sync    write the shared source into every marked site worker
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
const SOURCE_PATH = path.join(ROOT, 'shared', 'ln-bridge', 'hours.js');
export const START = '/* LN-BRIDGE:START — generated from shared/ln-bridge/hours.js, do not edit in place */';
export const END = '/* LN-BRIDGE:END */';
const BLOCK_RE = /\/\* LN-BRIDGE:START[\s\S]*?LN-BRIDGE:END\s*\*\//;

export function bridgeSource() {
  return fs.readFileSync(SOURCE_PATH, 'utf8').trim();
}

export function bridgeBlock() {
  return START + '\n' + bridgeSource() + '\n' + END;
}

export function injectWorker(src) {
  if (!src.includes('LN-BRIDGE:START')) return src;
  if (!BLOCK_RE.test(src)) throw new Error('LN-BRIDGE:START without LN-BRIDGE:END');
  return src.replace(BLOCK_RE, bridgeBlock());
}

function sites() {
  const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'sites.config.json'), 'utf8'));
  const seen = new Set();
  const out = [];
  for (const [key, s] of Object.entries(cfg)) {
    if (key[0] === '_' || !s?.worker_src || seen.has(s.worker_src)) continue;
    seen.add(s.worker_src);
    out.push({ key, file: path.join(ROOT, s.worker_src) });
  }
  const tpl = path.join(ROOT, 'sites', '_template', 'worker.js');
  if (fs.existsSync(tpl)) out.push({ key: '_template', file: tpl });
  return out;
}

function check() {
  const want = bridgeSource();
  const bad = [];
  let converted = 0;
  for (const s of sites()) {
    if (!fs.existsSync(s.file)) continue;
    const src = fs.readFileSync(s.file, 'utf8');
    if (!src.includes('LN-BRIDGE:START')) continue;
    converted++;
    if (!BLOCK_RE.test(src)) { bad.push(s.key + ': START marker without END marker'); continue; }
    const block = src.match(BLOCK_RE)[0];
    const body = block.replace(/^\/\* LN-BRIDGE:START[\s\S]*?\*\/\s*/, '').replace(/\s*\/\* LN-BRIDGE:END\s*\*\/\s*$/, '').trim();
    if (body !== want) bad.push(s.key + ': block differs from shared/ln-bridge/hours.js (run node tools/bridge.mjs --sync)');
  }
  if (bad.length) {
    console.error('bridge check failed:\n - ' + bad.join('\n - '));
    process.exit(1);
  }
  console.log('bridge check ok: ' + converted + ' converted site(s) match shared/ln-bridge/hours.js');
}

function sync() {
  const block = bridgeBlock();
  let n = 0;
  for (const s of sites()) {
    if (!fs.existsSync(s.file)) continue;
    const src = fs.readFileSync(s.file, 'utf8');
    if (!src.includes('LN-BRIDGE:START')) continue;
    const next = injectWorker(src);
    if (next !== src) { fs.writeFileSync(s.file, next); n++; }
  }
  console.log('bridge sync: updated ' + n + ' site worker(s)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--sync')) sync();
  else if (process.argv.includes('--check')) check();
  else { console.error('usage: node tools/bridge.mjs --check | --sync'); process.exit(2); }
}
