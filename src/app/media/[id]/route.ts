import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaFiles } from "@/db/schema";

/**
 * Images produit stockées en base (quand Cloudinary n'est pas configuré).
 * Un identifiant ne change jamais de contenu (un remplacement crée un nouveau fichier) :
 * la réponse peut donc être mise en cache longtemps par le navigateur et le CDN.
 */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Introuvable", { status: 404 });
  const [f] = await db.select({ mimeType: mediaFiles.mimeType, data: mediaFiles.data }).from(mediaFiles).where(eq(mediaFiles.id, id));
  if (!f) return new Response("Introuvable", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Length": String(f.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
