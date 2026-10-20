// GET /api/status?id=<fal request id> — polls the fal queue (server-side).
// The API key comes only from the server environment variable FAL_KEY.

const FAL_MODEL = "fal-ai/kling-video/v3/standard/image-to-video";
const FAL_QUEUE = "https://queue.fal.run";

export async function onRequestGet(context) {
  const { request, env } = context;
  const id = new URL(request.url).searchParams.get("id");

  if (!env.FAL_KEY) {
    return Response.json({
      mode: "demo",
      status: "not_connected",
      message: "Live generation is not connected yet (demo build).",
    });
  }
  if (!id) {
    return Response.json({ mode: "live", status: "missing_input", message: "id is required." }, { status: 400 });
  }

  const headers = { Authorization: `Key ${env.FAL_KEY}` };
  const statusRes = await fetch(`${FAL_QUEUE}/${FAL_MODEL}/requests/${id}/status`, { headers });
  const status = await statusRes.json().catch(() => ({}));
  if (status.status !== "COMPLETED") {
    return Response.json({ mode: "live", status: status.status || "IN_QUEUE" });
  }
  const resultRes = await fetch(`${FAL_QUEUE}/${FAL_MODEL}/requests/${id}`, { headers });
  const result = await resultRes.json().catch(() => ({}));
  return Response.json({
    mode: "live",
    status: "COMPLETED",
    video_url: result && result.video ? result.video.url : null,
  });
}
