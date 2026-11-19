// JS-off bridge test: fetch each deployed page and assert its served HTML already equals what the
// bridge would render from that site's payload. Run after a deploy:
//   node tools/test-bridge.mjs cove
//   node tools/test-bridge.mjs            # production sites with a biz slug
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { lnBridgeRender } from '../shared/ln-bridge/hours.js';
import { PRODUCTION_SITES } from './deploylib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(fs.readFileSync(path.join(HERE, 'sites.config.json'), 'utf8'));
const args = process.argv.slice(2);
const keys = args.length ? args : PRODUCTION_SITES;

async function get(url) {
  const r = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  return { status: r.status, text: await r.text(), type: r.headers.get('content-type') || '' };
}

// A deploy is eventually consistent: retry a non-200 instead of racing the new version.
async function getOk(url, attempts = 6) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await get(url);
    if (last.status === 200) return last;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, 3000));
  }
  return last;
}

let failed = 0;
for (const key of keys) {
  const s = CFG[key];
  if (!s) { console.error('FAIL ' + key + ': not in sites.config.json'); failed++; continue; }
  if (!s.biz) { console.log('skip ' + key + ': no biz slug in sites.config.json'); continue; }

  const payloadUrl = s.base + '/api/site';
  const pageUrl = s.base + '/?ln_bridge_test=' + Date.now();
  let payload, page;
  try {
    const p = await getOk(payloadUrl);
    if (p.status !== 200) throw new Error('/api/site ' + p.status);
    payload = JSON.parse(p.text);
    page = await getOk(pageUrl);
    if (page.status !== 200) throw new Error('page ' + page.status);
  } catch (e) {
    console.error('FAIL ' + key + ': ' + e.message);
    failed++;
    continue;
  }
  if (!page.text.includes('data-ln-hours')) {
    console.log('skip ' + key + ': no hours markers on the page');
    continue;
  }

  const rendered = lnBridgeRender(page.text, payload);
  if (rendered !== page.text) {
    // Report the first marker that differs, so the failure names the drift.
    const grab = (html, re) => (html.match(re) || [])[0] || '(missing)';
    const footer = /<span[^>]*\bdata-ln-hours(?![\w-])[^>]*>[\s\S]*?<\/span>/i;
    const list = /<dl[^>]*\bdata-ln-hours-list\b[^>]*>[\s\S]*?<\/dl>/i;
    const ld = /<script[^>]*\bdata-ln-hours-ld\b[^>]*>[\s\S]*?<\/script>/i;
    for (const [name, re] of [['footer', footer], ['visit', list], ['json-ld', ld]]) {
      if (grab(page.text, re) !== grab(rendered, re)) {
        console.error('FAIL ' + key + ' ' + name + '\n  served:   ' + grab(page.text, re).slice(0, 240) + '\n  expected: ' + grab(rendered, re).slice(0, 240));
        break;
      }
    }
    failed++;
    continue;
  }
  console.log('ok   ' + key + ': served HTML matches ' + payloadUrl);
}

if (failed) {
  console.error('bridge test failed for ' + failed + ' site(s)');
  process.exit(1);
}
