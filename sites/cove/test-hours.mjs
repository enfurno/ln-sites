// Fails when the served HTML disagrees with /api/hours for a fixture.
// Runs the real worker: ASSETS serves public/index.html, PORTAL answers the hours feed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

globalThis.caches ??= { default: { match: async () => null, put: async () => {} } };

const indexUrl = new URL('./public/index.html', import.meta.url);
const fixtureUrl = new URL('./test-hours.fixture.json', import.meta.url);
const indexHtml = await fs.readFile(indexUrl, 'utf8');
const fixture = JSON.parse(await fs.readFile(fixtureUrl, 'utf8'));

const env = (hours) => ({
  ASSETS: {
    fetch: async (req) => {
      const path = new URL(req.url).pathname;
      if (path === '/' || path === '/index.html') {
        return new Response(indexHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    },
  },
  PORTAL: {
    fetch: async (url) => {
      const u = String(url);
      if (u.includes('/api/hours/')) {
        return new Response(JSON.stringify(hours), { headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    },
  },
});

// Fresh module (and fresh 60s hours memo) per fixture.
async function servedHtml(hours, tag) {
  const moduleUrl = new URL('./worker.js', import.meta.url).href + '?fixture=' + tag;
  const worker = (await import(moduleUrl)).default;
  const res = await worker.fetch(new Request('https://catfishcove.co/'), env(hours), { waitUntil() {} });
  assert.equal(res.status, 200, 'served status');
  return res.text();
}

const pick = (html, re, what) => {
  const m = html.match(re);
  assert.ok(m, `marker missing: ${what}`);
  return m[1];
};

{
  const html = await servedHtml(fixture, 'live');

  const footer = pick(html, /<span[^>]*\bdata-ln-hours(?![\w-])[^>]*>([\s\S]*?)<\/span>/i, 'footer hours');
  assert.equal(footer, 'Sun – Thu 11am – 8pm · Fri – Sat 11am – 9pm', 'footer hours match the feed');
  assert.ok(!html.includes('Mon – Sat 11am – 9pm'), 'stale footer hours must be gone');

  const list = pick(html, /<dl[^>]*\bdata-ln-hours-list\b[^>]*>([\s\S]*?)<\/dl>/i, 'visit hours list');
  assert.equal(
    list.replace(/\s+/g, ''),
    '<dt>Sun–Thu</dt><dd>11am–8pm</dd><dt>Fri–Sat</dt><dd>11am–9pm</dd>',
    'Visit block matches the feed',
  );

  const ld = JSON.parse(pick(html, /<script[^>]*\bdata-ln-hours-ld\b[^>]*>([\s\S]*?)<\/script>/i, 'JSON-LD'));
  assert.deepEqual(ld.openingHours, ['Su-Th 11:00-20:00', 'Fr-Sa 11:00-21:00'], 'JSON-LD openingHours matches the feed');
  assert.deepEqual(ld.openingHoursSpecification.map((s) => s.closes), ['20:00', '21:00'], 'JSON-LD specs match the feed');
  assert.equal(ld.name, 'Catfish Cove - Yukon', 'JSON-LD keeps its other fields');

  // data-live marks server-rendered content exactly as the browser refresh does.
  assert.ok(html.includes('data-live="1"'), 'server render marks hours as live');
}

{
  // A different feed must produce different HTML, so the test cannot pass on hardcoded hours.
  const changed = structuredClone(fixture);
  const yukon = changed.locations[0];
  yukon.hours = [
    { day: 'Monday', open: '12:00', close: '22:30', closed: false },
    { day: 'Tuesday', open: '12:00', close: '22:30', closed: false },
    { day: 'Wednesday', open: '12:00', close: '22:30', closed: false },
    { day: 'Thursday', open: '12:00', close: '22:30', closed: false },
    { day: 'Friday', open: '12:00', close: '22:30', closed: false },
    { day: 'Saturday', open: '10:00', close: '23:00', closed: false },
    { day: 'Sunday', closed: true },
  ];

  const html = await servedHtml(changed, 'changed');

  const footer = pick(html, /<span[^>]*\bdata-ln-hours(?![\w-])[^>]*>([\s\S]*?)<\/span>/i, 'footer hours');
  assert.equal(footer, 'Mon – Fri 12pm – 10:30pm · Sat 10am – 11pm · Sun closed', 'footer follows a changed feed');

  const list = pick(html, /<dl[^>]*\bdata-ln-hours-list\b[^>]*>([\s\S]*?)<\/dl>/i, 'visit hours list');
  assert.equal(
    list.replace(/\s+/g, ''),
    '<dt>Mon–Fri</dt><dd>12pm–10:30pm</dd><dt>Sat</dt><dd>10am–11pm</dd><dt>Sun</dt><dd>Closed</dd>',
    'Visit block follows a changed feed',
  );

  const ld = JSON.parse(pick(html, /<script[^>]*\bdata-ln-hours-ld\b[^>]*>([\s\S]*?)<\/script>/i, 'JSON-LD'));
  assert.deepEqual(ld.openingHours, ['Mo-Fr 12:00-22:30', 'Sa 10:00-23:00'], 'JSON-LD follows a changed feed');
}

console.log('cove hours: served HTML matches /api/hours for both fixtures');
