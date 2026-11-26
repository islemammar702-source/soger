import "server-only";
import { createHash } from "node:crypto";

const MAX_BYTES = 5 * 1024 * 1024;

/** Type réel du fichier d'après ses premiers octets (on ne se fie pas à l'extension). */
function sniffImage(buf: Uint8Array) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  return null;
}

/**
 * Envoi signé vers Cloudinary (variable CLOUDINARY_URL = cloudinary://clé:secret@nom-du-cloud).
 * L'URL renvoyée sert l'image en WebP/AVIF selon le navigateur (f_auto,q_auto).
 */
export async function uploadImage(file: File, folder: string) {
  const conf = process.env.CLOUDINARY_URL;
  if (!conf) throw new Error("L'envoi de fichiers n'est pas configuré (CLOUDINARY_URL). Indiquez plutôt l'adresse https:// d'une image.");
  const m = /^cloudinary:\/\/(\w+):([\w-]+)@([\w-]+)$/.exec(conf.trim());
  if (!m) throw new Error("CLOUDINARY_URL invalide.");
  const [, apiKey, apiSecret, cloud] = m;

  if (file.size > MAX_BYTES) throw new Error("Image trop lourde (5 Mo maximum).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) throw new Error("Format non accepté : JPEG, PNG ou WebP uniquement.");

  const timestamp = Math.floor(Date.now() / 1000);
  const params = `folder=${folder}&timestamp=${timestamp}`;
  const signature = createHash("sha1").update(params + apiSecret).digest("hex");
  const body = new FormData();
  body.set("file", new Blob([bytes], { type }));
  body.set("api_key", apiKey);
  body.set("timestamp", String(timestamp));
  body.set("folder", folder);
  body.set("signature", signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body });
  if (!res.ok) throw new Error("Cloudinary a refusé l'envoi de l'image.");
  const data = (await res.json()) as { secure_url: string; public_id: string };
  return { url: data.secure_url.replace("/image/upload/", "/image/upload/f_auto,q_auto/"), publicId: data.public_id };
}
