import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaFiles } from "@/db/schema";
import { getCurrentUser, getUserAccess } from "@/server/auth/dal";

/**
 * Fichiers stockés en base.
 * - Images produit (publiques) : un identifiant ne change jamais de contenu, mise en cache longue.
 * - Fichiers privés (factures fournisseurs) : personnel autorisé uniquement, jamais mis en cache.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Introuvable", { status: 404 });
  const [f] = await db.select({ mimeType: mediaFiles.mimeType, data: mediaFiles.data, isPrivate: mediaFiles.isPrivate, fileName: mediaFiles.fileName }).from(mediaFiles).where(eq(mediaFiles.id, id));
  if (!f) return new Response("Introuvable", { status: 404 });
  if (f.isPrivate) {
    const user = await getCurrentUser();
    const perms = user?.kind === "staff" ? (await getUserAccess(user.id)).permissions : null;
    const ok = !!perms && perms.has("invoices.view") && perms.has("products.view_cost");
    if (!ok) return new Response("Introuvable", { status: 404 });
  }
  const download = new URL(request.url).searchParams.has("telecharger");
  const name = (f.fileName ?? `fichier-${id}`).replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Length": String(f.data.length),
      "Cache-Control": f.isPrivate ? "private, no-store" : "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Images : aucune ressource annexe. PDF : affiché par la visionneuse intégrée du navigateur.
      ...(f.mimeType === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'" }),
      ...(f.isPrivate ? { "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"` } : {}),
    },
  });
}
