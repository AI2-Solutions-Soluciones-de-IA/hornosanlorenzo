import { upload } from "@vercel/blob/client";

/** Sin acentos ni espacios: el nombre acaba en la URL. */
function nombre(fichero: File): string {
  const ext =
    fichero.type === "image/png"
      ? "png"
      : fichero.type === "image/webp"
        ? "webp"
        : "jpg";
  // El UUID hace única la ruta: el token se firma para esa ruta exacta.
  return `pedidos-fotos/${crypto.randomUUID()}.${ext}`;
}

/**
 * Sube la foto del cliente directo a Vercel Blob (navegador) con el token que
 * da `/api/foto-pedido`, y devuelve su URL. Sin recomprimir: se imprime tal
 * cual. Por encima de 5 MB se sube por trozos.
 */
export async function subirFotoPedido(fichero: File): Promise<string> {
  const { url } = await upload(nombre(fichero), fichero, {
    access: "public",
    handleUploadUrl: "/api/foto-pedido",
    multipart: fichero.size > 5 * 1024 * 1024,
  });
  return url;
}
