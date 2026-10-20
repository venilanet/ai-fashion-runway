// POST /api/generate — server-side entry point for fal.ai generation.
//
// SECURITY: the fal API key is read ONLY from the server-side environment
// variable FAL_KEY (set in the Cloudflare Pages dashboard / wrangler secret).
// It is never sent to the browser and never appears in client code.
//
// EARLY ACCESS: while FAL_KEY is not configured, this endpoint performs NO
// generation and reports waitlist mode; the frontend routes users to the
// early-access waitlist instead of faking a video. When the key is
// configured, it submits ONE job to the fal queue for the Kling v3 Standard
// image-to-video endpoint and returns the request id; the client polls
// /api/status.

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

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    /* empty body is fine */
  }
  const template = TEMPLATES[body.template] ? body.template : "golden-sheer-wings";

  if (!env.FAL_KEY) {
    return Response.json({
      mode: "waitlist",
      status: "not_available",
      message:
        "Generation is currently in early access. Join the waitlist to be notified when your spot opens.",
      template,
    });
  }

  // Live path (activates only when FAL_KEY is set in the server environment).
  // The client must first upload the photo via /api/upload (planned) and pass
  // start_image_url + face_ref_url. Until those exist we refuse honestly
  // instead of generating from a placeholder.
  const { start_image_url, face_ref_url } = body;
  if (!start_image_url || !face_ref_url) {
    return Response.json(
      {
        mode: "live",
        status: "missing_input",
        message: "start_image_url and face_ref_url are required.",
      },
      { status: 400 }
    );
  }

// COST & ABUSE GUARDS (launch checklist, implemented server-side only):
//  1. This endpoint never accepts a duration or audio flag from the client —
//     both are fixed here, so a caller cannot inflate the bill.
//  2. Rate limiting: add a KV namespace binding (e.g. RATE_LIMIT) and reject
//     bursts per IP before this live path is opened.
//  3. Spend cap: poll fal's usage API (GET /v1/usage) and compare against a
//     DAILY_BUDGET_USD env var; return 429 with an honest message when exceeded.
//  4. The FAL_KEY itself must be set as a Pages secret (dashboard >
//     Settings > Environment variables, or `wrangler pages secret put`).
//     It must never be committed to the repo or sent to the browser.

  const payload = {
    start_image_url,
    duration: "13",
    generate_audio: false, // must stay false: audio raises price to $0.126/s
    shot_type: "customize",
    multi_prompt: runwayPrompts(TEMPLATES[template]),
    elements: [
      { frontal_image_url: face_ref_url, reference_image_urls: [start_image_url] },
    ],
    negative_prompt: NEGATIVE,
    cfg_scale: 0.5,
    enable_safety_checker: true,
  };

  const res = await fetch(`${FAL_QUEUE}/${FAL_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${env.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).catch(() => null);
  if (!res) {
    return Response.json(
      { mode: "live", status: "error", message: "Could not reach the generation service. Please try again in a minute." },
      { status: 502 }
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return Response.json(
      { mode: "live", status: "error", message: "fal queue rejected the request.", detail: data },
      { status: 502 }
    );
  }
  return Response.json({ mode: "live", status: "queued", request_id: data.request_id, template });
}
