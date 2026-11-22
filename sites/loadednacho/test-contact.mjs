// Vanity phone display: letters are allowed only when they map to the dialled number.
import assert from 'node:assert/strict';
import { msContact } from './worker.js';

const payload = (display) => ({ contact: { phone: '(844) 336-2246', ...(display === undefined ? {} : { phone_display: display }) } });
const phone = (display) => msContact(payload(display));

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
console.log('loadednacho contact: vanity phone display passes');
