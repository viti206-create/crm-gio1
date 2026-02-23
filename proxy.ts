import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rotas públicas
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api");

  if (isPublic) return NextResponse.next();

  // Rotas que exigem login (ajuste conforme seu app)
  const needsAuth =
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/leads") ||
    pathname.startsWith("/home") ||
    pathname.startsWith("/kanban");

  if (!needsAuth) return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Se não tiver env no ambiente (ex.: build/local mal configurado), não trava o deploy:
  // redireciona para login com um hint (você verá no browser).
  if (!supabaseUrl || !supabaseAnonKey) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    url.searchParams.set("e", "missing-env");
    return NextResponse.redirect(url);
  }

  // IMPORTANTE: criar um response "mutável" pra receber cookies do Supabase SSR
  let res = NextResponse.next();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // atualiza os cookies no response (necessário para login persistir no Vercel)
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);

    // quando redireciona, precisa devolver o response do redirect (e não o "res" acima)
    const redirectRes = NextResponse.redirect(url);

    // se o Supabase tentou setar cookies, replica no redirectRes
    res.cookies.getAll().forEach((c) => {
      redirectRes.cookies.set(c.name, c.value, c);
    });

    return redirectRes;
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};