import { NextResponse, type NextRequest } from "next/server";

/**
 * Vérification « optimiste » : sans cookie de session, inutile de charger le back-office.
 * La vraie vérification (session valide, rôle, permission) est faite côté serveur
 * dans chaque page et chaque action (src/server/auth/dal.ts).
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("soger_session")) {
    return NextResponse.redirect(new URL("/admin/connexion", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/((?!connexion).*)"],
};
