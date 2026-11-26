import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaFiles } from "@/db/schema";

/** Taille maximale d'un fichier envoyé (avant optimisation). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MIN_SIDE = 100;
const MAX_SIDE = 1600;
const MAX_PIXELS = 40_000_000;

export class UploadError extends Error {}

/** Type réel du fichier d'après ses premiers octets (on ne se fie ni à l'extension ni au type annoncé). */
export function sniffImage(buf: Uint8Array) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  return null;
}

type Prepared = { data: Buffer; type: string; width: number | null; height: number | null };

/**
 * Vérifie le fichier puis l'optimise : rotation EXIF, réduction à 1600 px de côté,
 * conversion WebP. Si la bibliothèque d'optimisation n'est pas disponible,
 * le fichier vérifié est conservé tel quel.
 */
export async function prepareImage(file: File): Promise<Prepared> {
  if (!(file instanceof File) || file.size === 0) throw new UploadError("Fichier vide.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError(`« ${file.name} » est trop lourd (8 Mo maximum).`);
  const input = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(input);
  if (!type) throw new UploadError(`« ${file.name} » : format non accepté (JPEG, PNG ou WebP uniquement).`);

  let sharp: (typeof import("sharp"))["default"] | null = null;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    sharp = null;
  }
  if (!sharp) return { data: input, type, width: null, height: null };

  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new UploadError(`« ${file.name} » est illisible ou endommagé.`);
  }
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w * h > MAX_PIXELS) throw new UploadError(`« ${file.name} » : image trop grande (${w}×${h} px).`);
  if (Math.min(w, h) < MIN_SIDE) throw new UploadError(`« ${file.name} » : image trop petite (${w}×${h} px, ${MIN_SIDE} px minimum).`);
  const { data, info } = await sharp(input, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { data, type: "image/webp", width: info.width, height: info.height };
}

function cloudinaryConf() {
  const conf = process.env.CLOUDINARY_URL;
  if (!conf) return null;
  const m = /^cloudinary:\/\/(\w+):([\w-]+)@([\w-]+)$/.exec(conf.trim());
  if (!m) throw new UploadError("CLOUDINARY_URL invalide.");
  const [, apiKey, apiSecret, cloud] = m;
  return { apiKey, apiSecret, cloud };
}

export const storageMode = () => (process.env.CLOUDINARY_URL ? "cloudinary" : "database");

/**
 * Enregistre une image vérifiée et optimisée :
 * - Cloudinary si CLOUDINARY_URL est configuré (URL servie en WebP/AVIF via f_auto,q_auto) ;
 * - sinon dans PostgreSQL (table media_files), servie par /media/[id].
 */
export async function uploadImage(file: File, folder: string): Promise<{ url: string; publicId: string | null }> {
  const img = await prepareImage(file);
  const cl = cloudinaryConf();
  if (!cl) {
    const [row] = await db.insert(mediaFiles).values({ mimeType: img.type, bytes: img.data.length, width: img.width, height: img.height, data: img.data }).returning({ id: mediaFiles.id });
    return { url: `/media/${row.id}`, publicId: null };
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const params = `folder=${folder}&timestamp=${timestamp}`;
  const signature = createHash("sha1").update(params + cl.apiSecret).digest("hex");
  const body = new FormData();
  body.set("file", new Blob([new Uint8Array(img.data)], { type: img.type }));
  body.set("api_key", cl.apiKey);
  body.set("timestamp", String(timestamp));
  body.set("folder", folder);
  body.set("signature", signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cl.cloud}/image/upload`, { method: "POST", body });
  if (!res.ok) throw new UploadError("Cloudinary a refusé l'envoi de l'image.");
  const data = (await res.json()) as { secure_url: string; public_id: string };
  return { url: data.secure_url.replace("/image/upload/", "/image/upload/f_auto,q_auto/"), publicId: data.public_id };
}

/** Supprime le fichier stocké (à n'appeler que s'il n'est plus référencé). Sans effet sur les URL externes. */
export async function deleteStoredImage(url: string, publicId: string | null) {
  const local = /^\/media\/(\d+)$/.exec(url);
  if (local) {
    await db.delete(mediaFiles).where(eq(mediaFiles.id, Number(local[1])));
    return;
  }
  const cl = publicId ? cloudinaryConf() : null;
  if (!cl || !publicId) return;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash("sha1").update(`public_id=${publicId}&timestamp=${timestamp}${cl.apiSecret}`).digest("hex");
    const body = new FormData();
    body.set("public_id", publicId);
    body.set("api_key", cl.apiKey);
    body.set("timestamp", String(timestamp));
    body.set("signature", signature);
    await fetch(`https://api.cloudinary.com/v1_1/${cl.cloud}/image/destroy`, { method: "POST", body });
  } catch (e) {
    console.error("Suppression Cloudinary", e);
  }
}
