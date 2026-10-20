// POST /api/stripe-webhook — Stripe payment notifications.
//
// SECURITY: verifies the Stripe signature (HMAC-SHA256, WebCrypto) using
// STRIPE_WEBHOOK_SECRET from the server environment. Unsigned or
// mis-signed requests are rejected before any order is touched.
//
// IDEMPOTENCY (prevents double-processing on Stripe retries):
//  1. each Stripe event id is recorded (stripe_evt:<id>); repeats are acked without work.
//  2. each checkout session creates at most one order (order_by_session:<session_id>).
// Only checkout.session.completed with payment_status=paid creates an order.
// A generation task is NEVER created here — it is created later by /api/generate,
// only for a paid order, so a duplicate callback can never cause a duplicate video.
import { newOrderId, getOrderBySession, saveOrder } from "../lib/orders.js";

async function verifySignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  // Reject events older than 5 minutes (replay protection).
  if (Math.abs(Date.now() / 1000 - parseInt(t, 10)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + rawBody));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  const sig = request.headers.get("stripe-signature") || "";
  if (!(await verifySignature(raw, sig, env.STRIPE_WEBHOOK_SECRET))) {
    return new Response("invalid signature", { status: 400 });
  }
  let event;
  try { event = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  // Stripe retries until 2xx — dedupe by event id first.
  const evtKey = "stripe_evt:" + event.id;
  if (await env.KV.get(evtKey)) return new Response("duplicate", { status: 200 });
  await env.KV.put(evtKey, "1", { expirationTtl: 7 * 86400 });

  if (event.type === "checkout.session.completed") {
    const s = event.data.object || {};
    if (s.payment_status === "paid" && s.mode === "payment") {
      const existing = await getOrderBySession(env, s.id);
      if (!existing) {
        const md = s.metadata || {};
        const template = ["golden-sheer-wings", "supermodel-walk", "dream-angel"].includes(md.template)
          ? md.template : "golden-sheer-wings";
        const order = {
          id: newOrderId(),
          email: (s.customer_details && s.customer_details.email) || null,
          stripe_session_id: s.id,
          stripe_payment_intent: s.payment_intent || null,
          amount_total: s.amount_total || null,
          currency: s.currency || null,
          status: "paid",
          credits_total: 1,
          credits_used: 0,
          template,
          photo_url: null,
          generations: [],
          created_ts: Date.now(),
          paid_ts: Date.now(),
        };
        await saveOrder(env, order);
        await env.KV.put("order_by_session:" + s.id, order.id);
      }
    }
  }
  return new Response("ok", { status: 200 });
}
