import { head } from "@vercel/blob";

/**
 * Las fotos que el cliente sube para un pedido (la foto comestible del Pack
 * Cumpleaños). Vive en `storage/` porque es el único sitio que puede hablar
 * con Vercel Blob.
 */

export const CARPETA_FOTOS = "pedidos-fotos/";

/**
 * ¿Esta URL es una foto subida a NUESTRO almacén, dentro de la carpeta de
 * fotos de pedido? `priceOrder` la llama antes de aceptar un `fotoUrl`: sin
 * esto, el navegador podría colar cualquier dirección y el obrador acabaría
 * imprimiendo una imagen ajena.
 */
export async function esFotoDePedido(url: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (!u.hostname.endsWith(".public.blob.vercel-storage.com")) return false;
  if (!u.pathname.startsWith("/" + CARPETA_FOTOS)) return false;
  try {
    // `head` con NUESTRO token: una URL de otro almacén de Blob no la encuentra.
    await head(url);
    return true;
  } catch {
    return false;
  }
}
