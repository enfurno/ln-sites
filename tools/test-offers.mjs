// Validates the sample fixture used to preview the offers section.
// It must stay clearly sample data and must never repeat a banned client claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = new URL('../shared/ln-bridge/offers.fixture.json', import.meta.url);
const f = JSON.parse(fs.readFileSync(file, 'utf8'));
const all = JSON.stringify(f).toLowerCase();

assert.equal(f._sample, true, 'fixture is marked as sample data');
assert.match(f._note || '', /sample/i, 'fixture note says it is sample');
assert.ok(Array.isArray(f.offers) && f.offers.length >= 2, 'fixture has sample offers');
assert.ok(!/fish\s*fry|friday\s*fish/.test(all), 'fixture must not contain the banned Friday fish claim');

for (const o of f.offers) {
  assert.ok(o.id && o.title && o.details && o.when, 'each sample offer has id, title, details and when');
  assert.equal(o.active, true, 'sample offers are active');
  assert.match(o.link, /^https:\/\//, 'sample links are absolute https');
  assert.match(o.details, /sample/i, 'sample offer details are clearly labelled');
}
const titles = f.offers.map((o) => o.title.toLowerCase());
assert.ok(titles.includes('20% off dinner'), 'neutral dinner sample is present');
assert.ok(titles.includes('$5 off crab legs'), 'neutral crab legs sample is present');

console.log('offers fixture: neutral sample data passes (' + f.offers.length + ' offers)');
