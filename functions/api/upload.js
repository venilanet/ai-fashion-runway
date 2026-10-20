// POST /api/upload — store the customer's photo for their paid order.
//
// GATED: requires PAYMENTS_LIVE=1 and a paid order with remaining credits.
// Uploading a photo on the public site (free browsing) never calls this
// endpoint — that stays client-side. This runs only in the post-payment flow.
//
// STORAGE: Cloudflare R2 bucket bound as UPLOADS. If the binding is absent
// (R2 not yet enabled on the account) it returns 503 — never a fake URL.
import { getOrder, saveOrder, paymentsLive, siteUrl } from "../lib/orders.js";

const MAX_BYTES = 10 * 1024 * 1024;

export async function onRequestPost({ request, env }) {
  if (!paymentsLive(env)) {
    return Response.json({ ok: false, error: "not_live" }, { status: 403 });
  }
  if (!env.UPLOADS) {
    return Response.json(
      { ok: false, error: "storage_not_configured", message: "Photo storage is not configured yet." },
      { status: 503 }
    );
  }
  let form;
  try { form = await request.formData(); } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const orderId = String(form.get("order_id") || "").trim();
  const file = form.get("photo");
  const order = await getOrder(env, orderId);
  if (!order || order.status !== "paid") {
    return Response.json({ ok: false, error: "no_paid_order" }, { status: 403 });
  }
  if (!file || typeof file === "string" || !file.type.startsWith("image/")) {
    return Response.json({ ok: false, error: "bad_photo", message: "Please upload an image file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: "too_large", message: "Photo must be under 10 MB." }, { status: 400 });
  }
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 4) || "jpg";
  const key = `uploads/${order.id}/${Date.now()}.${ext}`;
  await env.UPLOADS.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  const base = (env.R2_PUBLIC_BASE || "").replace(/\/$/, "");
  if (!base) {
    return Response.json({ ok: false, error: "storage_not_configured" }, { status: 503 });
  }
  order.photo_url = base + "/" + key;
  await saveOrder(env, order);
  return Response.json({ ok: true, photo_url: order.photo_url });
}
