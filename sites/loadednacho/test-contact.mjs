// Vanity phone display: letters are allowed only when they map to the dialled number.
import assert from 'node:assert/strict';
import { msContact } from './worker.js';

const payload = (display) => ({ contact: { phone: '(844) 336-2246', ...(display === undefined ? {} : { phone_display: display }) } });
const phone = (display) => msContact(payload(display));
const locPayload = (display) => ({ contact: { phone: null, locations: [{ name: 'Loaded Nacho', phone: '(844) 336-2246', ...(display === undefined ? {} : { phone_display: display }) }] } });
const locPhone = (display) => msContact(locPayload(display));

{
  const p = phone('(844) 33-NACHO');
  assert.equal(p.phoneText, '(844) 33-NACHO', 'letters display is kept');
  assert.equal(p.tel, '+18443362246', 'tel stays numeric');
}
{
  const p = phone('844-33-NACHO');
  assert.equal(p.phoneText, '844-33-NACHO', 'hyphenated letters display is kept');
  assert.equal(p.tel, '+18443362246');
}
{
  const p = phone('(844) 33-NACHX');
  assert.equal(p.phoneText, '(844) 336-2246', 'mismatched letters fall back to the formatted number');
  assert.equal(p.tel, '+18443362246');
}
{
  const p = phone('844-336-2246');
  assert.equal(p.phoneText, '844-336-2246', 'a plain display still works');
}
{
  const p = phone(undefined);
  assert.equal(p.phoneText, '(844) 336-2246', 'missing display falls back');
}
{
  const p = phone('(844) 33-<NACHO>');
  assert.equal(p.phoneText, '(844) 336-2246', 'markup is rejected');
}
{
  const p = phone('(' + ' '.repeat(35) + '844) 33-NACHO');
  assert.equal(p.phoneText, '(844) 336-2246', 'over-long display is rejected');
}
{
  const p = locPhone('(844) 33-NACHO');
  assert.equal(p.phoneText, '(844) 33-NACHO', 'display on the phone location is kept');
  assert.equal(p.tel, '+18443362246', 'location phone still dials numerically');
}
{
  const p = locPhone('(844) 33-NACHX');
  assert.equal(p.phoneText, '(844) 336-2246', 'location display with mismatched letters falls back');
}
{
  const p = msContact({ contact: { phone: '(844) 336-2246', phone_display: '(844) 33-NACHO', locations: [{ phone: '(844) 336-2246', phone_display: '(844) 99-WRONG' }] } });
  assert.equal(p.phoneText, '(844) 33-NACHO', 'top-level phone uses its own top-level display');
}
console.log('loadednacho contact: vanity phone display passes');
