// GET /api/config — public site configuration (non-secret values only).
export async function onRequestGet({ env }) {
  return Response.json({
    supportEmail: env.SUPPORT_EMAIL || "venilanet@gmail.com",
    generationLive: !!env.FAL_KEY,
    paymentsLive: env.PAYMENTS_LIVE === "1" || env.PAYMENTS_LIVE === "true",
  });
}
