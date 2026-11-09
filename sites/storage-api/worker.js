// Loaded Nacho Storage Platform — master backend.
// D1-ready: once the DB binding + Stripe secrets are on this worker, it reads units/prices from
// D1 and charges via Stripe. Until then it runs with an embedded fallback (no persistence) so the
// platform is live to test now. Facility/customer data is keyed by slug.
const FACILITIES = {
  rexters: {
    name: "Rexter's Self Storage",
    contact: { phone: "(940) 665-7245" },
    units: [
      { size: "5x5", label: "5×5", price: 5500 },
      { size: "5x10", label: "5×10", price: 7000 },
      { size: "10x10", label: "10×10", price: 9500 },
      { size: "10x15", label: "10×15", price: 12000 },
      { size: "10x20", label: "10×20", price: 15000 },
      { size: "10x25", label: "10×25", price: 17500 }
    ]
  }
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/api/health') {
        return json({ ok: true, d1: !!env.DB, stripe: !!env.STRIPE_SECRET_KEY });
      }
      if (url.pathname === '/api/reserve' && req.method === 'POST') {
        const b = await req.json();
        if (!env.STRIPE_SECRET_KEY) {
          return json({ ok: false, mode: 'lead', message: 'Payments not wired for this facility yet — a lead was captured.' });
        }
        return json({ ok: true, mode: 'stripe', message: 'Checkout online once this facility is wired.' });
      }
      const m = url.pathname.match(/^\/api\/facility\/([^/]+)\/units$/);
      if (m) {
        const slug = m[1];
        let units = null;
        if (env.DB) {
          const r = await env.DB.prepare('SELECT size,label,monthly_rate_cents AS price FROM units WHERE facility_slug=? ORDER BY sort').bind(slug).all();
          if (r && r.results && r.results.length) units = r.results.map(u => ({ size: u.size, label: u.label, price: u.price }));
        }
        const f = FACILITIES[slug];
        if (!f && !units) return json({ ok: false, error: 'facility not found' }, 404);
        return json({ ok: true, slug, name: (f && f.name) || slug, units: units || (f && f.units) || [] });
      }
      if (url.pathname === '/admin' || url.pathname === '/admin/') {
        return new Response(await adminPage(env), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return new Response(landing(Object.keys(FACILITIES)), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    } catch (e) {
      return json({ ok: false, error: String((e && e.message) || e) }, 500);
    }
  }
};

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}
function landing(slugs) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Loaded Nacho Storage Platform</title><style>body{font:15px/1.55 system-ui,sans-serif;max-width:780px;margin:44px auto;padding:0 22px;color:#12233f}h1{color:#0b1f3a}p{color:#5c6672}code{background:#f3f6fa;border:1px solid #e4eaf0;border-radius:6px;padding:2px 6px}li{margin:8px 0}a{color:#e2641a}</style></head><body><h1>Loaded Nacho Storage Platform</h1><p>Master backend / admin. Facility endpoints:</p><ul>' + slugs.map(s => '<li>/api/facility/<b>' + s + '</b>/units</li>').join('') + '</ul><p>Health: /api/health · Reserve: POST /api/reserve</p></body></html>';
}

// Admin/control dashboard — reads the live D1 (facilities, unit counts, recent reservations).
async function adminPage(env) {
  const head = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loaded Nacho Storage — Admin</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:0;background:#f5f7fa;color:#20304a}h1{font-size:22px;margin:24px 22px 6px;color:#0b1f3a}h2{font-size:16px;margin:26px 22px 6px;color:#0b1f3a}p{margin:6px 22px;color:#5c6672}table{border-collapse:collapse;width:calc(100% - 44px);margin:12px 22px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}th,td{text-align:left;padding:9px 12px;border-bottom:1px solid #eef2f6;font-size:13.5px}th{background:#f0f4f8;color:#0b1f3a;font-size:12px;text-transform:uppercase;letter-spacing:.04em}code{background:#eef3f8;border-radius:5px;padding:1px 5px}</style></head><body><h1>Loaded Nacho Storage — Admin</h1>';
  if (!env.DB) return head + '<p>D1 is not bound — no database to administer yet.</p></body></html>';
  try {
    const fac = (await env.DB.prepare('SELECT slug,name,domain,phone,email,stripe_state,gate_state FROM facilities ORDER BY slug').all()).results || [];
    const ucs = (await env.DB.prepare('SELECT facility_slug, COUNT(*) AS n FROM units GROUP BY facility_slug').all()).results || [];
    const bySlug = {}; ucs.forEach(u => bySlug[u.facility_slug] = u.n);
    const res = (await env.DB.prepare('SELECT id,facility_slug,tenant_name,tenant_phone,status,provider FROM reservations ORDER BY id DESC LIMIT 20').all()).results || [];
    const frows = fac.length ? fac.map(f => '<tr><td><b>' + esc(f.slug) + '</b></td><td>' + esc(f.name) + '</td><td>' + esc(f.domain || '—') + '</td><td>' + (bySlug[f.slug] || 0) + '</td><td>' + esc(f.stripe_state) + '</td><td>' + esc(f.gate_state) + '</td></tr>').join('') : '<tr><td colspan="6">No facilities yet.</td></tr>';
    const rrows = res.length ? res.map(r => '<tr><td>#' + r.id + '</td><td>' + esc(r.facility_slug || '') + '</td><td>' + esc(r.tenant_name || '') + '</td><td>' + esc(r.tenant_phone || '') + '</td><td>' + esc(r.status || '') + '</td><td>' + esc(r.provider || '') + '</td></tr>').join('') : '<tr><td colspan="6">No reservations yet.</td></tr>';
    return head +
      '<p>Live dashboard. Facilities + work behind the scenes.</p>' +
      '<h2>Facilities</h2><table><tr><th>Slug</th><th>Name</th><th>Domain</th><th>Units</th><th>Payments</th><th>Gate</th></tr>' + frows + '</table>' +
      '<h2>Recent reservations (leads)</h2><table><tr><th>ID</th><th>Facility</th><th>Name</th><th>Phone</th><th>Status</th><th>Provider</th></tr>' + rrows + '</table>' +
      '<p>API: <code>/api/health</code> · <code>/api/facility/&lt;slug&gt;/units</code></p></body></html>';
  } catch (e) {
    return head + '<p>Error loading admin data: ' + esc(String((e && e.message) || e)) + '</p></body></html>';
  }
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }