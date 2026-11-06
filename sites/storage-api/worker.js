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