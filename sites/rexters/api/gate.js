// Gate/access adapter seam for "manage gate access ourselves".
// "Gate access" really has two parts:
//   1) OUR backend — tenants, units, rental/lease, Stripe billing, tenant portal, and a
//      code-policy (issue/expire a gate PIN) — this is fully buildable by us.
//   2) The PHYSICAL gate controller at the facility + its API/protocol. That is the adapter below.
// Some gate controllers expose a cloud API (many WiFi/cellular gate controls do) — then we can
// issue and revoke codes over HTTP just like any vendor. Others are closed and only pair with a
// specific vendor's software (ESS/StorEdge/SiteLink). So we treat the gate as one pluggable
// adapter: the rest of the backend never needs to know which physical gate is installed.
export async function setGateCode(env, ctx, { tenantId, code, unitName, untilTs }) {
  if (!env.GATE_API) {
    // No physical gate adapter configured yet. Backend still works; access codes aren't sent.
    return { ok: false, reason: 'gate_not_configured' };
  }
  // Example shape for a WiFi gate controller with a cloud API:
  // const res = await fetch(`${env.GATE_API}/access`, {
  //   method: 'POST',
  //   headers: { authorization: 'Bearer ' + env.GATE_KEY, 'content-type': 'application/json' },
  //   body: JSON.stringify({ code, note: unitName, expire: untilTs })
  // });
  // if (!res.ok) return { ok: false, reason: 'gate_error' };
  return { ok: true };
}

export async function revokeGateCode(env, ctx, { tenantId, code }) {
  if (!env.GATE_API) return { ok: false, reason: 'gate_not_configured' };
  // const res = await fetch(`${env.GATE_API}/access`, { method: 'DELETE', headers: { authorization: 'Bearer ' + env.GATE_KEY }, body: JSON.stringify({ code }) });
  return { ok: true };
}