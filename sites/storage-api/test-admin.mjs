// node sites/storage-api/test-admin.mjs
// Auth gate on /admin: unset token fails closed, no cookie means no data,
// a wrong password is refused, the right one sets an HttpOnly cookie, and a
// forged cookie is refused. Uses a fake D1 so the dashboard renders for real.
import assert from 'node:assert/strict';
import worker from './worker.js';

const TOKEN = 'test-token-0123456789';

const DB = {
  prepare(sql) {
    return {
      bind() { return this; },
      async all() {
        if (/from facilities/i.test(sql)) {
          return { results: [{ slug: 'rexters', name: "Rexter's Self Storage", domain: null, phone: '(940) 665-7245', email: null, stripe_state: 'off', gate_state: 'pending' }] };
        }
        if (/from units/i.test(sql)) return { results: [{ facility_slug: 'rexters', n: 6 }] };
        if (/from reservations/i.test(sql)) {
          return { results: [{ id: 7, facility_slug: 'rexters', tenant_name: 'Jo <script>alert(1)</script>', tenant_phone: '(940) 555-0100', status: 'lead', provider: 'lead' }] };
        }
        return { results: [] };
      },
    };
  },
};

const call = (path, opts = {}, env = { ADMIN_TOKEN: TOKEN }) =>
  worker.fetch(new Request('https://storage.example' + path, opts), env, {});

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fail++; };

// 1. No ADMIN_TOKEN on the worker: refuse, and show no data.
{
  const r = await call('/admin', {}, { DB });
  const body = await r.text();
  ok(r.status === 503, 'no ADMIN_TOKEN -> 503 (got ' + r.status + ')');
  ok(/not configured/i.test(body), 'no ADMIN_TOKEN -> says not configured');
  ok(!/Facilities|reservations|rexters/i.test(body), 'no ADMIN_TOKEN -> leaks no facility or lead data');
}

// 2. Token set, no cookie: login form, no data.
{
  const r = await call('/admin');
  const body = await r.text();
  ok(r.status === 401, 'no cookie -> 401 (got ' + r.status + ')');
  ok(/type="password"/.test(body) && /action="\/admin"/.test(body), 'no cookie -> password form posting to /admin');
  ok(!/Facilities|Recent reservations/i.test(body), 'no cookie -> no dashboard content');
  ok((r.headers.get('cache-control') || '') === 'no-store', 'no cookie -> cache-control no-store');
}

// 3. Wrong password.
{
  const fd = new FormData(); fd.set('password', 'nope');
  const r = await call('/admin', { method: 'POST', body: fd });
  const body = await r.text();
  ok(r.status === 401, 'wrong password -> 401 (got ' + r.status + ')');
  ok(!r.headers.get('set-cookie'), 'wrong password -> no cookie set');
  ok(/did not match/i.test(body), 'wrong password -> explains the failure');
}

// 4. Right password: cookie, then the dashboard.
let cookie = '';
{
  const fd = new FormData(); fd.set('password', TOKEN);
  const r = await call('/admin', { method: 'POST', body: fd });
  ok(r.status === 303, 'right password -> 303 redirect (got ' + r.status + ')');
  ok((r.headers.get('location') || '') === '/admin', 'right password -> redirects to /admin');
  const sc = r.headers.get('set-cookie') || '';
  ok(/^ln_admin=[A-Za-z0-9_-]+/.test(sc), 'right password -> sets ln_admin cookie');
  ok(/HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc) && /Path=\/admin/.test(sc), 'cookie is HttpOnly, SameSite=Strict, Path=/admin');
  cookie = sc.split(';')[0];
  ok(!sc.includes(TOKEN), 'cookie does not contain the token itself');
}
{
  const r = await call('/admin', { headers: { cookie } }, { ADMIN_TOKEN: TOKEN, DB });
  const body = await r.text();
  ok(r.status === 200, 'cookie -> 200 (got ' + r.status + ')');
  ok(/Rexter&#39;s|Rexter's Self Storage/.test(body), 'cookie -> facility row renders');
  ok(/>6</.test(body), 'cookie -> unit count renders');
  ok(body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'cookie -> lead name is HTML-escaped');
  ok(!body.includes('<script>alert(1)</script>'), 'cookie -> no raw script tag from lead data');
}

// 5. Bearer token works for scripts.
{
  const r = await call('/admin', { headers: { authorization: 'Bearer ' + TOKEN } }, { ADMIN_TOKEN: TOKEN, DB });
  ok(r.status === 200, 'bearer token -> 200 (got ' + r.status + ')');
}

// 6. Forged cookie and wrong bearer.
{
  const r1 = await call('/admin', { headers: { cookie: 'ln_admin=deadbeef' } });
  ok(r1.status === 401, 'forged cookie -> 401 (got ' + r1.status + ')');
  const r2 = await call('/admin', { headers: { authorization: 'Bearer wrong' } });
  ok(r2.status === 401, 'wrong bearer -> 401 (got ' + r2.status + ')');
}

// 7. A cookie signed for one token does not work on a worker with another.
{
  const r = await call('/admin', { headers: { cookie } }, { ADMIN_TOKEN: 'some-other-token', DB });
  ok(r.status === 401, 'cookie from another token -> 401 (got ' + r.status + ')');
}

// 8. Logout clears the cookie.
{
  const r = await call('/admin/logout', { method: 'POST' });
  const sc = r.headers.get('set-cookie') || '';
  ok(r.status === 303 && /Max-Age=0/.test(sc), 'logout -> 303 and clears the cookie');
}

// 9. The public routes are untouched.
{
  const h = await call('/api/health', {}, {});
  ok(h.status === 200, '/api/health still 200');
  const l = await call('/', {}, {});
  ok(l.status === 200, 'landing still 200');
}

console.log(fail ? '\n' + fail + ' failed' : '\nall admin gate tests passed');
process.exit(fail ? 1 : 0);
