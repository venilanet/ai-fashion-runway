// Shared order helpers (KV-backed).
// Order record shape:
// { id:"AFR-YYYYMMDD-XXXX", email, stripe_session_id, status:"paid"|"refunded",
//   credits_total:1, credits_used:0, photo_url:null,
//   generations:[{ id, idem_key, template, status, fal_request_id, video_url, error, ts }],
//   created_ts, paid_ts }

export function newOrderId() {
  const d = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AFR-${d}-${r}`;
}

export async function getOrder(env, id) {
  if (!id || !env.KV) return null;
  const raw = await env.KV.get("order:" + id);
  return raw ? JSON.parse(raw) : null;
}

export async function saveOrder(env, order) {
  await env.KV.put("order:" + order.id, JSON.stringify(order));
}

export async function getOrderBySession(env, sessionId) {
  if (!env.KV || !sessionId) return null;
  const id = await env.KV.get("order_by_session:" + sessionId);
  return id ? getOrder(env, id) : null;
}

export function paymentsLive(env) {
  return env.PAYMENTS_LIVE === "1" || env.PAYMENTS_LIVE === "true";
}

export function siteUrl(env) {
  return (env.SITE_URL || "https://runway.ventlane.com").replace(/\/$/, "");
}
