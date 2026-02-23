import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth") // se você usar callback de auth no futuro
  );
}

function needsAuthPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/leads") ||
    pathname.startsWith("/home")
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ Sempre deixa assets/rotas públicas passarem
  if (isPublicPath(pathname)) {
    // se já estiver logado e abrir /login, redireciona pra /dashboard
    if (pathname === "/login") {
      const res = NextResponse.next();

      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return req.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) => {
                res.cookies.set(name, value, options);
              });
            },
          },
        }
      );

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const url = req.nextUrl.clone();
        url.pathname = "/dashboard";
        url.searchParams.delete("redirect");
        return NextResponse.redirect(url);
      }

      return res;
    }

    return NextResponse.next();
  }

  // Se não for rota protegida, passa
  if (!needsAuthPath(pathname)) {
    return NextResponse.next();
  }

  // ✅ Aqui valida sessão do jeito certo (SSR cookies)
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // ❌ Sem sessão => manda pro login
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // ✅ Com sessão => passa
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};