import type { APIRoute } from "astro";

/**
 * `robots.txt` con la dirección real de la web (9-10-2026). Antes era un
 * fichero fijo en `public/` que apuntaba los sitemaps a
 * `hornosanlorenzo-demo.vercel.app`, una dirección antigua. Ahora sale de
 * `site` (`PUBLIC_SITE_URL`, `astro.config.mjs`): al pasar al dominio
 * definitivo se actualiza solo.
 */
export const GET: APIRoute = ({ site }) => {
  const base = (site?.href ?? "https://hornosanlorenzo.vercel.app/").replace(/\/$/, "");
  return new Response(
    [
      "User-agent: *",
      "Allow: /",
      "",
      `Sitemap: ${base}/sitemap-index.xml`,
      `Sitemap: ${base}/sitemap-contenido.xml`,
      "",
    ].join("\n"),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
};
