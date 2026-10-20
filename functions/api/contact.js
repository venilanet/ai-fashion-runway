// POST /api/contact — support ticket creation (KV-backed).
// Returns a ticket reference the customer can quote when following up.
// Basic per-IP rate limiting: 10 tickets/hour.
export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch (e) { /* fall through */ }
  const name = String(body.name || "").trim().slice(0, 80);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
  const subject = String(body.subject || "").trim().slice(0, 120);
  const message = String(body.message || "").trim().slice(0, 2000);
  const orderRef = String(body.orderRef || "").trim().slice(0, 40);

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !message) {
    return Response.json(
      { ok: false, message: "Please complete your name, a valid email and your message." },
      { status: 400 }
    );
  }
  if (!env.KV) {
    return Response.json({ ok: false, message: "Support system is not configured yet. Please try again later." }, { status: 503 });
  }

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const hour = new Date().toISOString().slice(0, 13);
  const rlKey = `rl:contact:${ip}:${hour}`;
  const count = parseInt((await env.KV.get(rlKey)) || "0", 10);
  if (count >= 10) {
    return Response.json({ ok: false, message: "Too many requests. Please try again later." }, { status: 429 });
  }
  await env.KV.put(rlKey, String(count + 1), { expirationTtl: 3600 });

  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const ref = `SUP-${day}-${rand}`;
  await env.KV.put(
    `ticket:${ref}`,
    JSON.stringify({ name, email, subject, message, orderRef, ip, ts: Date.now(), status: "open" }),
    { expirationTtl: 180 * 86400 }
  );
  return Response.json({ ok: true, ticket_ref: ref });
}
