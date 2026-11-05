// Scaffold: the single entry point for "rent this unit / pay".
// Today it creates a Stripe Checkout Session. The switch point to a platform
// (ESS / StorEdge / QuikStor) is `startRental` — swap its body for the platform API and
// keep the same input/output shape, so the page and schema never change.
export async function startRental(req, env, ctx) {
  const { size, name, email, phone } = await req.json();

  if (!env.STRIPE_SECRET_KEY) {
    // Not configured yet -> lead mode. The page already falls back to "we'll call you".
    return json({ ok: false, mode: 'lead' });
  }

  const session = await stripeCreateCheckout(env, {
    amount_cents: 0, // set from the unit's monthly_rate_cents + deposit_cents in `units`
    description: `Self storage ${size || ''} — first month + deposit`,
    email,
    success_url: new URL('/?rented=1', env.URL).href,
    cancel_url: new URL('/#reserve', env.URL).href,
    metadata: { size, tenant: name }
  });

  // Insert a pending reservation (provider-agnostic seam):
  await env.DB.prepare(
    `INSERT INTO reservations (tenant_name, tenant_email, tenant_phone, status, provider) VALUES (?,?,?, 'pending', 'stripe')`
  ).bind(name, email || null, phone || null).run();

  return json({ ok: true, mode: 'stripe', checkout_url: session.url });
}

// Minimal Stripe client (Checkout). Expand as needed; these calls go straight to api.stripe.com.
async function stripeCreateCheckout(env, o) {
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: 'Basic ' + btoa(env.STRIPE_SECRET_KEY + ':'), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(o.amount_cents),
      'line_items[0][price_data][product_data][name]': o.description,
      'success_url': o.success_url,
      'cancel_url': o.cancel_url,
      ...(o.email ? { customer_email: o.email } : {}),
      ...(o.metadata ? { 'metadata[size]': o.metadata.size, 'metadata[tenant]': o.metadata.tenant } : {})
    })
  });
  const j = await res.json();
  if (!j.id) throw new Error('Stripe: ' + (j.error && j.error.message));
  return j;
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
}