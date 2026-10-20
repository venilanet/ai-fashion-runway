// GET /api/config — public site configuration.
// Exposes only non-secret values: Crisp website id (public site identifier),
// support email (public contact), and whether live generation is available.
export async function onRequestGet({ env }) {
  return Response.json({
    crispWebsiteId: env.CRISP_WEBSITE_ID || null,
    supportEmail: env.SUPPORT_EMAIL || null,
    generationLive: !!env.FAL_KEY,
  });
}
