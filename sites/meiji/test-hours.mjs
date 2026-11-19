// Fails when the served HTML disagrees with the bridge payload for a fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

globalThis.caches ??= { default: { match: async () => null, put: async () => {} } };

const indexHtml = await fs.readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const fixture = JSON.parse(await fs.readFile(new URL('./test-hours.fixture.json', import.meta.url), 'utf8'));

function env(site) {
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
        if (u.includes('/api/hours/')) return new Response(JSON.stringify({ locations: fixture.locations }), { headers: { 'content-type': 'application/json' } });
        return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
      },
    },
  };
}

async function page(site, tag) {
  const moduleUrl = new URL('./worker.js', import.meta.url).href + '?fixture=' + tag;
  const worker = (await import(moduleUrl)).default;
  const res = await worker.fetch(new Request('https://meijiok.com/'), env(site), { waitUntil() {} });
  assert.equal(res.status, 200, 'served status');
  return res.text();
}

function hoursByLoc(html) {
  const out = {};
  for (const m of html.matchAll(/<span([^>]*\bdata-ln-hours(?![\w-])[^>]*)>([\s\S]*?)<\/span>/gi)) {
    const loc = m[1].match(/data-loc="([^"]*)"/i);
    if (loc) out[loc[1]] = m[2];
  }
  return out;
}
function ldHours(html) {
  const m = html.match(/<script[^>]*\bdata-ln-hours-ld\b[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(m, 'JSON-LD marker missing');
  const j = JSON.parse(m[1]);
  const node = (j['@graph'] || [j]).find(x => x && (x.openingHours || x.openingHoursSpecification));
  assert.ok(node, 'Restaurant node missing from JSON-LD');
  return node;
}

{
  const html = await page(fixture, 'live');
  const hours = hoursByLoc(html);
  assert.equal(hours['midwest-city'], 'Sun–Thu 11 AM–9 PM<br>Fri–Sat 11 AM–9:30 PM', 'Midwest City hours match the payload');
  assert.equal(hours['okc-memorial'], 'Opening date TBA', 'a location with no hours keeps its copy');
  const node = ldHours(html);
  assert.deepEqual(node.openingHours, ['Su-Th 11:00-21:00', 'Fr-Sa 11:00-21:30'], 'JSON-LD openingHours matches the payload');
  assert.deepEqual(node.openingHoursSpecification.map((s) => s.closes), ['21:00', '21:30'], 'JSON-LD specs match the payload');
  assert.ok(html.includes('data-live="1"'), 'bridge values are marked data-live');
}

{
  const changed = structuredClone(fixture);
  changed.locations[0].hours = [
    { day: 'Monday', closed: true },
    { day: 'Tuesday', open: '10:00', close: '22:00', closed: false },
    { day: 'Wednesday', open: '10:00', close: '22:00', closed: false },
    { day: 'Thursday', open: '10:00', close: '22:00', closed: false },
    { day: 'Friday', open: '10:00', close: '22:00', closed: false },
    { day: 'Saturday', open: '10:00', close: '22:00', closed: false },
    { day: 'Sunday', open: '10:00', close: '22:00', closed: false },
  ];
  const html = await page(changed, 'changed');
  assert.equal(hoursByLoc(html)['midwest-city'], 'Mon closed<br>Tue–Sun 10 AM–10 PM', 'Midwest City hours follow a changed payload');
  assert.deepEqual(ldHours(html).openingHours, ['Tu-Su 10:00-22:00'], 'JSON-LD follows a changed payload');
}

console.log('meiji hours: served HTML matches the bridge payload (v1, changed)');
