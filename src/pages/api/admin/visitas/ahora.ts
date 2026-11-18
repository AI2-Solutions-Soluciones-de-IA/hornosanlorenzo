// src/pages/api/admin/visitas/ahora.ts
// «Ahora en la web» y las visitas de hoy, para que la página de visitas se
// refresque sola cada minuto. Solo la cuenta de Oscar (lo corta el
// middleware; esta es la segunda llave).
import type { APIRoute } from "astro";
import { veVisitas } from "~/lib/auth/guardia";
import { leerAhora } from "~/lib/visitas-lectura";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!veVisitas(locals.usuario))
    return new Response("No encontrado", { status: 404 });
  const datos = await leerAhora();
  return new Response(JSON.stringify(datos), {
    status: datos ? 200 : 503,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
};
