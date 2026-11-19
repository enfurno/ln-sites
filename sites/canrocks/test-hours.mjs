// Fails when the served HTML disagrees with the bridge payload for a fixture.
// Canrock's live payload has no hours yet, so its pages legitimately say TBD; this proves the
// bridge fills them the moment the dashboard publishes hours, without changing any live value.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

globalThis.caches ??= { default: { match: async () => null, put: async () => {} } };

const indexHtml = await fs.readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const fixture = JSON.parse(await fs.readFile(new URL('./test-hours.fixture.json', import.meta.url), 'utf8'));

function env(site, legacy) {
  return {
    ASSETS: {
      fetch: async (req) => {
        const path = new URL(req.url).pathname;
        if (path === '/' || path === '/index.html') return new Response(indexHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
      },
    },
    PORTAL: {
      fetch: async (url) => {
        const u = String(url);
        if (u.includes('/api/site/')) return site ? new Response(JSON.stringify(site), { headers: { 'content-type': 'application/json' } }) : new Response('{"error":"not found"}', { status: 404 });
        if (u.includes('/api/hours/')) return legacy ? new Response(JSON.stringify({ client: "Canrock's", hours: [], locations: [] }), { headers: { 'content-type': 'application/json' } }) : new Response('{"error":"unavailable"}', { status: 503 });
        return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
      },
    },
  };
}

async function page(site, tag, legacy) {
  const moduleUrl = new URL('./worker.js', import.meta.url).href + '?fixture=' + tag;
  const worker = (await import(moduleUrl)).default;
  const res = await worker.fetch(new Request('https://canrocks.loadednacho.com/'), env(site, legacy), { waitUntil() {} });
  assert.equal(res.status, 200, 'served status');
  return res.text();
}
function footers(html) {
  return [...html.matchAll(/<span[^>]*\bdata-ln-hours(?![\w-])[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => m[1]);
}

{
  const html = await page(fixture, 'live');
  const f = footers(html);
  assert.ok(f.length >= 3, 'footer/drawer hours markers present');
  assert.ok(f.every((x) => x === 'Sun–Thu 11 AM–9 PM · Fri–Sat 11 AM–9:30 PM'), 'every hours marker matches the payload');
  assert.ok(html.includes('data-live="1"'), 'bridge values are marked data-live');
}

{
  // The live payload has no hours: the TBD placeholders must stay untouched.
  const empty = { ...fixture, locations: [] };
  const html = await page(empty, 'empty');
  assert.ok(footers(html).every((x) => x.trim() === 'TBD'), 'an empty payload leaves TBD alone');
}

{
  // Before /api/site is live, an empty /api/hours/<slug> is a payload too, not a 503.
  const moduleUrl = new URL('./worker.js', import.meta.url).href + '?fixture=legacy-empty';
  const worker = (await import(moduleUrl)).default;
  const res = await worker.fetch(new Request('https://canrocks.loadednacho.com/api/site'), env(null, true), { waitUntil() {} });
  assert.equal(res.status, 200, 'empty legacy feed still answers /api/site');
  const j = await res.json();
  assert.equal(j.v, 1, 'legacy feed is adapted to v1');
  assert.deepEqual(j.locations, [], 'empty locations survive adaptation');
}

console.log('canrocks hours: bridge fills payload hours and leaves TBD when the payload has none');
