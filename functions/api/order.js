// GET /api/order?id=AFR-...  or  ?session_id=cs_... — refresh-safe order status.
//
// Returns the order (paid status, credits) plus each generation enriched
// with its CURRENT fal queue status. Refreshing the page only re-reads —
// it never creates a new task or a new charge.
import { getOrder, getOrderBySession } from "../lib/orders.js";

const FAL_QUEUE = "https://queue.fal.run";

async function falStatus(env, falRequestId) {
  if (!env.FAL_KEY || !falRequestId) return null;
  try {
    const r = await fetch(
      `${FAL_QUEUE}/fal-ai/kling-video/v3/standard/image-to-video/requests/${falRequestId}/status`,
      { headers: { Authorization: "Key " + env.FAL_KEY } }
    );
    const d = await r.json().catch(() => ({}));
    return d.status || null; // IN_QUEUE | IN_PROGRESS | COMPLETED
  } catch { return null; }
}

async function falVideoUrl(env, falRequestId) {
  try {
    const r = await fetch(
      `${FAL_QUEUE}/fal-ai/kling-video/v3/standard/image-to-video/requests/${falRequestId}`,
      { headers: { Authorization: "Key " + env.FAL_KEY } }
    );
    const d = await r.json().catch(() => ({}));
    return d && d.video ? d.video.url : null;
  } catch { return null; }
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const id = u.searchParams.get("id");
  const sessionId = u.searchParams.get("session_id");
  const order = id ? await getOrder(env, id) : await getOrderBySession(env, sessionId);
  if (!order) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  // Never expose Stripe internals to the browser.
  const gens = [];
  for (const g of order.generations || []) {
    const live = g.fal_request_id ? await falStatus(env, g.fal_request_id) : null;
    let videoUrl = g.video_url;
    if (live === "COMPLETED" && !videoUrl) {
      videoUrl = await falVideoUrl(env, g.fal_request_id);
      if (videoUrl) { g.video_url = videoUrl; g.status = "completed"; }
    } else if (live && live !== "COMPLETED") {
      g.status = live === "IN_PROGRESS" ? "rendering" : "queued";
    }
    gens.push({ id: g.id, template: g.template, status: g.status, video_url: videoUrl, error: g.error || null, ts: g.ts });
  }
  if (gens.some((g) => g.video_url && !order.generations.find((x) => x.id === g.id).video_url)) {
    await env.KV.put("order:" + order.id, JSON.stringify(order));
  }
  return Response.json({
    ok: true,
    order: {
      id: order.id,
      status: order.status,
      credits_total: order.credits_total,
      credits_used: order.credits_used,
      photo_url: order.photo_url ? true : false,
      generations: gens,
    },
  });
}
