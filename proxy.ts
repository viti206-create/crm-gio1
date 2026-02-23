import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rotas públicas
  if (
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  // Rotas do CRM que precisam de login
  const needsAuth =
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/leads") ||
    pathname.startsWith("/home");

  if (!needsAuth) return NextResponse.next();

  // Supabase cria cookies sb-... quando autenticado
  const hasSupabaseCookie = req.cookies
    .getAll()
    .some((c) => c.name.includes("sb-"));

  if (!hasSupabaseCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};