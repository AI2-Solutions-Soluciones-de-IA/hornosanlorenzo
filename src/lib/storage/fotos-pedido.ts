import { BlobNotFoundError, head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

/**
 * Las fotos que el cliente sube para un pedido (la foto comestible del Pack
 * Cumpleaños). Vive en `storage/` porque es el único sitio que puede hablar
 * con Vercel Blob.
 *
 * La foto va del navegador directo al almacén (Vercel corta el cuerpo de una
 * función en 4,5 MB y una foto de móvil pasa de eso) y NO se recomprime: la
 * calidad que llega es la que se imprime.
 */

export const CARPETA_FOTOS = "pedidos-fotos/";
export const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
export const MAX_BYTES_FOTO = 20 * 1024 * 1024;

const NOMBRE = /^pedidos-fotos\/[a-z0-9-]{1,60}\.(jpe?g|png|webp)$/;

/**
 * Atiende la petición del navegador a `/api/foto-pedido`: le da un token de
 * un solo uso para subir UNA foto, o (si es el aviso de subida completada)
 * lo verifica.
 */
export async function atenderSubida(request: Request, body: unknown) {
  return handleUpload({
    request,
    body: body as HandleUploadBody,
    onBeforeGenerateToken: async (pathname) => {
      // La ruta la propone el navegador: se acepta solo dentro de la carpeta
      // de fotos y con un nombre sin sorpresas.
      if (!NOMBRE.test(pathname)) throw new Error("ruta no válida");
      return {
        allowedContentTypes: TIPOS_FOTO,
        maximumSizeInBytes: MAX_BYTES_FOTO,
        addRandomSuffix: true,
        allowOverwrite: false,
        validUntil: Date.now() + 10 * 60 * 1000,
      };
    },
    // Sin `onUploadCompleted` (opcional en @vercel/blob 2.8): no se pide
    // aviso de subida completada. La foto se comprueba al pagar
    // (`esFotoDePedido`), que es cuando importa.
  });
}

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
    // `head` con NUESTRO token: una URL de otro almacén de Blob la rechaza
    // (comprobado contra la API real: `BlobAccessError`).
    await head(url);
    return true;
  } catch (error) {
    // «No existe» es lo normal ante una URL inventada. Lo demás (token
    // ausente, red caída, otro almacén) también da `false`, pero se anota:
    // si no, un fallo de configuración parecería «foto no válida» sin más.
    if (!(error instanceof BlobNotFoundError))
      console.error("esFotoDePedido: head falló", error);
    return false;
  }
}
