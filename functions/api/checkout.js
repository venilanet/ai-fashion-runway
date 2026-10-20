// POST /api/checkout — create a Stripe Checkout session for the $9.99 single video.
//
// GATED: returns 403 unless PAYMENTS_LIVE=1 is set in the server environment.
// The page must never show a working buy button before that. No secrets here:
// STRIPE_SECRET_KEY and STRIPE_PRICE_ID live only in the server environment.
import { paymentsLive, siteUrl } from "../lib/orders.js";

const TEMPLATES = ["golden-sheer-wings", "supermodel-walk", "dream-angel"];

export async function onRequestPost({ request, env }) {
  if (!paymentsLive(env)) {
    return Response.json(
      { ok: false, error: "not_live", message: "Payments are not open yet." },
      { status: 403 }
    );
  }
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
    return Response.json(
      { ok: false, error: "not_configured", message: "Checkout is not configured yet." },
      { status: 503 }
    );
  }
  let body = {};
  try { body = await request.json(); } catch (_) { /* fall through */ }
  const template = TEMPLATES.includes(body.template) ? body.template : "golden-sheer-wings";
  const base = siteUrl(env);
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": env.STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    success_url: base + "/success/?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: base + "/#pricing",
    "metadata[product]": "ai-fashion-runway-single-video",
    "metadata[template]": template,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    return Response.json(
      { ok: false, error: "stripe_error", message: "Could not start checkout. Please try again." },
      { status: 502 }
    );
  }
  return Response.json({ ok: true, url: data.url });
}
