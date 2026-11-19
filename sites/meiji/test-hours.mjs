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

async function servedHtml(hours, tag) {
  const moduleUrl = new URL('./worker.js', import.meta.url).href + '?fixture=' + tag;
  const worker = (await import(moduleUrl)).default;
  const res = await worker.fetch(new Request('https://meijiok.com/'), env(hours), { waitUntil() {} });
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

{
  const html = await servedHtml(fixture, 'live');
  const hours = hoursByLoc(html);

  assert.equal(hours['midwest-city'], 'Sun–Thu 11 AM–9 PM<br>Fri–Sat 11 AM–9:30 PM', 'Midwest City hours match the feed');
  assert.equal(hours['okc-memorial'], 'Opening date TBA', 'a location with no hours keeps its copy');
}

{
  // A different feed must produce different HTML, so the test cannot pass on hardcoded hours.
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

  const html = await servedHtml(changed, 'changed');
  const hours = hoursByLoc(html);
  assert.equal(hours['midwest-city'], 'Mon closed<br>Tue–Sun 10 AM–10 PM', 'Midwest City hours follow a changed feed');
}

console.log('meiji hours: served HTML matches /api/hours for both fixtures');
