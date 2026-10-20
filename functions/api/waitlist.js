// POST /api/waitlist — early-access email capture (KV-backed).
export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch (e) { /* fall through */ }
  const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return Response.json({ ok: false, message: "Please enter a valid email address." }, { status: 400 });
  }
  if (!env.KV) {
    return Response.json({ ok: false, message: "Waitlist is not configured yet. Please try again later." }, { status: 503 });
  }
  const key = "waitlist:" + email;
  const exists = await env.KV.get(key);
  if (!exists) {
    await env.KV.put(key, JSON.stringify({ ts: Date.now() }), { expirationTtl: 365 * 86400 });
  }
  return Response.json({ ok: true });
}
