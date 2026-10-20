// POST /api/generate — create a real fal.ai generation task.
//
// PAYMENT GATING (hard rule): a generation task is created ONLY for an order
// that (a) exists in KV, (b) has status "paid", (c) still has unused credits.
// Uploading a photo or switching templates never touches this endpoint and
// never calls the paid video API — those are pure client-side UI.
//
// DUPLICATE PROTECTION:
//  - the client sends an idem_key per attempt; a repeated key returns the
//    existing generation record instead of creating a new task (covers
//    double-clicks and page refreshes);
//  - credits are consumed only after fal accepts the job; a failed submit
//    consumes nothing and the order record is kept for manual handling.
//  - the paid fal call happens only when PAYMENTS_LIVE=1 AND a paid order
//    exists. In admin-testing mode this endpoint refuses with 403, so no
//    paid API call can happen without the owner's confirmation.
//
// SECURITY: FAL_KEY is read only from the server environment, never sent
// to the browser.

import { getOrder, saveOrder, paymentsLive } from "../lib/orders.js";

const FAL_MODEL = "fal-ai/kling-video/v3/standard/image-to-video";
const FAL_QUEUE = "https://queue.fal.run";

const TEMPLATES = {
  "golden-sheer-wings": {
    name: "Golden Sheer Wings",
    outfit:
      "She wears a slim couture gown and enormous translucent golden silk wings — sheer flowing fabric panels, not feathers: champagne-gold chiffon that billows and ripples like silk caught in a gentle wind, stage light shining through the fabric, metallic sheen as the wings unfold and flutter with each step.",
  },
  "supermodel-walk": {
    name: "Supermodel Walk",
    outfit:
      "She wears an elegant black couture evening gown with a flowing train, walking a classic spotlight runway.",
  },
  "dream-angel": {
    name: "Dream Angel",
    outfit:
      "She wears a blush-pink gown with soft pink translucent wings, under dreamy pastel runway lighting with floating light particles.",
  },
};

function runwayPrompts(tpl) {
  return [
    {
      prompt:
        "Wide low-angle shot on an original couture runway: a dark mirrored catwalk beneath a canopy of warm hanging star lights. @Element1, the same woman with identical face, glasses and long black hairstyle, enters from the far end. " +
        tpl.outfit +
        " She walks confidently toward the camera. Audience silhouettes sit on both sides. No logos, no brand text.",
      duration: "4",
    },
    {
      prompt:
        "Medium tracking shot: @Element1 continues her runway walk straight toward the camera, steady eye contact, subtle confident smile. Keep her face exactly the same as @Element1.",
      duration: "5",
    },
    {
      prompt:
        "Close pass: the camera glides past @Element1's shoulder as she reaches the end of the runway; she turns gracefully, looks back over her shoulder and waves once, smiling. Keep her face exactly the same as @Element1.",
      duration: "4",
    },
  ];
}

const NEGATIVE =
  "blur, distort, low quality, face change, different person, identity drift, extra people in focus, text, logo, watermark, deformed hands, extra fingers, opaque wings, feather wings";

export async function onRequestPost({ request, env }) {
  if (!paymentsLive(env)) {
    return Response.json(
      { ok: false, error: "not_live", message: "Generation is in closed testing." },
      { status: 403 }
    );
  }
  let body = {};
  try { body = await request.json(); } catch (_) { /* fall through */ }
  const orderId = String(body.order_id || "").trim();
  const idemKey = String(body.idem_key || "").trim().slice(0, 64);
  const template = TEMPLATES[body.template] ? body.template : "golden-sheer-wings";
  if (!orderId || !idemKey) {
    return Response.json({ ok: false, error: "bad_request", message: "order_id and idem_key are required." }, { status: 400 });
  }

  const order = await getOrder(env, orderId);
  if (!order || order.status !== "paid") {
    return Response.json({ ok: false, error: "no_paid_order", message: "No paid order found." }, { status: 403 });
  }
  if (order.credits_used >= order.credits_total) {
    return Response.json({ ok: false, error: "no_credits", message: "This order has no generation credits left." }, { status: 402 });
  }
  if (!order.photo_url) {
    return Response.json({ ok: false, error: "no_photo", message: "Please upload your photo first." }, { status: 400 });
  }
  if (!env.FAL_KEY) {
    return Response.json({ ok: false, error: "not_configured", message: "Generation service is not configured." }, { status: 503 });
  }

  // Idempotency: same key → same generation, never a second task.
  const seen = await env.KV.get("gen_req:" + idemKey);
  if (seen) {
    return Response.json({ ok: true, duplicate: true, generation: JSON.parse(seen) });
  }

  const tpl = TEMPLATES[template];
  const falBody = {
    start_image_url: order.photo_url,
    duration: "13",
    generate_audio: false,
    negative_prompt: NEGATIVE,
    multi_prompt: runwayPrompts(tpl),
  };
  let falRes, falData;
  try {
    falRes = await fetch(`${FAL_QUEUE}/${FAL_MODEL}`, {
      method: "POST",
      headers: { Authorization: "Key " + env.FAL_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(falBody),
    });
    falData = await falRes.json().catch(() => ({}));
  } catch (e) {
    falRes = null;
  }
  if (!falRes || !falRes.ok || !falData.request_id) {
    // Failed submit: consume nothing, keep the order record for manual handling.
    const gen = {
      id: "gen-" + Date.now().toString(36),
      idem_key: idemKey, template, status: "submit_failed",
      error: "The video service did not accept the job. Your credit was not used — contact support and quote your order number.",
      ts: Date.now(),
    };
    order.generations.push(gen);
    await saveOrder(env, order);
    await env.KV.put("gen_req:" + idemKey, JSON.stringify(gen), { expirationTtl: 7 * 86400 });
    return Response.json({ ok: false, error: "submit_failed", generation: gen }, { status: 502 });
  }

  const gen = {
    id: "gen-" + Date.now().toString(36),
    idem_key: idemKey, template, status: "queued",
    fal_request_id: falData.request_id, video_url: null, error: null,
    ts: Date.now(),
  };
  order.credits_used += 1;
  order.generations.push(gen);
  await saveOrder(env, order);
  await env.KV.put("gen_req:" + idemKey, JSON.stringify(gen), { expirationTtl: 7 * 86400 });
  return Response.json({ ok: true, generation: gen });
}
