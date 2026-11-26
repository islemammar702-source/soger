import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale, UNLOCALIZED } from "@/i18n/config";

/**
 * 1. Back-office : vérification « optimiste » (sans cookie de session, inutile de charger la page).
 *    La vraie vérification (session, rôle, permission) est faite côté serveur (src/server/auth/dal.ts).
 * 2. Site public : chaque adresse porte sa langue (/fr, /en, /ar). Une adresse sans langue
 *    (ancien lien, lien partagé) est redirigée vers la langue choisie ou celle du navigateur.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (pathname.startsWith("/admin/connexion") || request.cookies.has("soger_session")) return NextResponse.next();
    return NextResponse.redirect(new URL("/admin/connexion", request.url));
  }
  if (UNLOCALIZED.test(pathname)) return NextResponse.next();

  const first = pathname.split("/")[1];
  if (isLocale(first)) {
    // Mémorise la langue (redirections des anciens liens, actions serveur).
    const res = NextResponse.next();
    if (request.cookies.get(LOCALE_COOKIE)?.value !== first) {
      res.cookies.set(LOCALE_COOKIE, first, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    }
    return res;
  }

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : negotiateLocale(request.headers.get("accept-language")) ?? DEFAULT_LOCALE;
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.redirect(url);
}

export const config = {
  // Tout sauf les fichiers internes, les API, les fichiers stockés et les fichiers statiques (avec extension).
  matcher: ["/((?!_next/|api/|media/|documents/|favicon\\.ico|.*\\.[a-zA-Z0-9]{2,5}$).*)"],
};
