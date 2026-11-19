// Fails when the served HTML disagrees with the bridge payload for a fixture.
// Runs the real worker: ASSETS serves public/*.html, PORTAL answers /api/site/<slug>.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

globalThis.caches ??= { default: { match: async () => null, put: async () => {} } };

const indexHtml = await fs.readFile(new URL('./public/index.html', import.meta.url), 'utf8');
const contactHtml = await fs.readFile(new URL('./public/contact.html', import.meta.url), 'utf8');
const fixture = JSON.parse(await fs.readFile(new URL('./test-hours.fixture.json', import.meta.url), 'utf8'));

// A legacy /api/hours payload, for the window before /api/site is live.
const legacy = {
  client: fixture.name,
  tz: fixture.tz,
  locations: fixture.locations.map(l => ({ slug: l.slug, name: l.name, status: l.status, hours: l.hours, holidays: l.holidays })),
};

function env({ site, hours }) {
  return {
    ASSETS: {
      fetch: async (req) => {
        const path = new URL(req.url).pathname;
        const html = path === '/contact' || path === '/contact.html' ? contactHtml : indexHtml;
        if (path === '/' || path === '/index.html' || path === '/contact' || path === '/contact.html') {
          return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        }
        return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
      },
    },
    PORTAL: {
      fetch: async (url) => {
        const u = String(url);
        if (u.includes('/api/site/')) {
          return site ? new Response(JSON.stringify(site), { headers: { 'content-type': 'application/json' } }) : new Response('{"error":"not found"}', { status: 404 });
        }
        if (u.includes('/api/hours/')) {
          return hours ? new Response(JSON.stringify(hours), { headers: { 'content-type': 'application/json' } }) : new Response('{"error":"unavailable"}', { status: 503 });
        }
        return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
      },
    },
  };
}

// Fresh module (and fresh 60s memo) per case.
async function request(path, opts, tag) {
  const moduleUrl = new URL('./worker.js', import.meta.url).href + '?fixture=' + tag;
  const worker = (await import(moduleUrl)).default;
  const res = await worker.fetch(new Request('https://catfishcove.co' + path), env(opts), { waitUntil() {} });
  return { status: res.status, body: await res.text() };
}

async function page(path, opts, tag) {
  const { status, body } = await request(path, opts, tag);
  assert.equal(status, 200, 'served status for ' + path);
  return body;
}

const pick = (html, re, what) => {
  const m = html.match(re);
  assert.ok(m, `marker missing: ${what}`);
  return m[1];
};
const FOOTER = /<span[^>]*\bdata-ln-hours(?![\w-])[^>]*>([\s\S]*?)<\/span>/i;
const LIST = /<dl[^>]*\bdata-ln-hours-list\b[^>]*>([\s\S]*?)<\/dl>/i;
const LD = /<script[^>]*\bdata-ln-hours-ld\b[^>]*>([\s\S]*?)<\/script>/i;

function assertHours(html, expected, label) {
  const footer = pick(html, FOOTER, 'footer hours');
  assert.equal(footer, expected.footer, label + ': footer matches the payload');
  const list = pick(html, LIST, 'Visit hours list');
  assert.equal(list.replace(/\s+/g, ''), expected.list, label + ': Visit block matches the payload');
  const ld = JSON.parse(pick(html, LD, 'JSON-LD'));
  assert.deepEqual(ld.openingHours, expected.openingHours, label + ': JSON-LD openingHours matches the payload');
  assert.deepEqual(ld.openingHoursSpecification.map((s) => s.closes), expected.closes, label + ': JSON-LD specs match the payload');
  assert.ok(html.includes('data-live="1"'), label + ': bridge values are marked data-live');
}

const LIVE = {
  footer: 'Sun – Thu 11am – 8pm · Fri – Sat 11am – 9pm',
  list: '<dt>Sun–Thu</dt><dd>11am–8pm</dd><dt>Fri–Sat</dt><dd>11am–9pm</dd>',
  openingHours: ['Su-Th 11:00-20:00', 'Fr-Sa 11:00-21:00'],
  closes: ['20:00', '21:00'],
};

{
  const html = await page('/', { site: fixture }, 'live');
  assertHours(html, LIVE, 'v1 payload');
  assert.ok(!html.includes('Mon – Sat 11am – 9pm'), 'stale hand-written hours must be gone');

  const { status, body } = await request('/api/site', { site: fixture }, 'live');
  assert.equal(status, 200, '/api/site status');
  assert.deepEqual(JSON.parse(body), fixture, '/api/site proxies the v1 payload');

  const contact = await page('/contact', { site: fixture }, 'live-contact');
  assertHours(contact, LIVE, 'contact page');
}

{
  // A different payload must produce different HTML, so the test cannot pass on hardcoded hours.
  const changed = structuredClone(fixture);
  changed.locations[0].hours = [
    { day: 'Monday', open: '12:00', close: '22:30', closed: false },
    { day: 'Tuesday', open: '12:00', close: '22:30', closed: false },
    { day: 'Wednesday', open: '12:00', close: '22:30', closed: false },
    { day: 'Thursday', open: '12:00', close: '22:30', closed: false },
    { day: 'Friday', open: '12:00', close: '22:30', closed: false },
    { day: 'Saturday', open: '10:00', close: '23:00', closed: false },
    { day: 'Sunday', closed: true },
  ];
  const html = await page('/', { site: changed }, 'changed');
  assertHours(html, {
    footer: 'Mon – Fri 12pm – 10:30pm · Sat 10am – 11pm · Sun closed',
    list: '<dt>Mon–Fri</dt><dd>12pm–10:30pm</dd><dt>Sat</dt><dd>10am–11pm</dd><dt>Sun</dt><dd>Closed</dd>',
    openingHours: ['Mo-Fr 12:00-22:30', 'Sa 10:00-23:00'],
    closes: ['22:30', '23:00'],
  }, 'changed payload');
}

{
  // Before /api/site is live, the bridge adapts /api/hours/<slug> to v1.
  const html = await page('/', { site: null, hours: legacy }, 'legacy');
  assertHours(html, LIVE, '/api/hours fallback');
}

console.log('cove hours: served HTML matches the bridge payload (v1, changed, legacy fallback)');
