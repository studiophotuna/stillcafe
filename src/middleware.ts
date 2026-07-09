import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and guards the /admin
 * area (except the login page). Unauthenticated users are redirected to login.
 */
export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/admin/login";

  // If Supabase isn't configured yet, don't crash the edge runtime. Let the
  // login page render (it surfaces the misconfiguration), and send other admin
  // routes there rather than throwing a 500.
  if (!supabaseUrl || !supabaseKey) {
    if (!isLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  try {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as any)
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!isLogin && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }

    if (isLogin && user) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      url.searchParams.delete("redirect");
      return NextResponse.redirect(url);
    }

    return response;
  } catch (e) {
    // Never let an auth/network hiccup take down the edge with a 500.
    console.error("[middleware] auth check failed:", e);
    if (!isLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
