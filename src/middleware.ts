import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function createSupabaseMiddlewareClient(req: NextRequest, res: NextResponse) {
  return createServerClient(
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
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Ignore static/assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  // Public pages
  const isPublic = pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/acesso");

  const res = NextResponse.next();
  const supabase = createSupabaseMiddlewareClient(req, res);

  // Only protect dashboard routes
  if (pathname.startsWith("/dashboard")) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const url = new URL("/login", req.url);
      return NextResponse.redirect(url);
    }
    return res;
  }

  // Optional: if user is logged in and tries to go to /login, bounce to /dashboard
  if (isPublic && pathname.startsWith("/login")) {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const url = new URL("/dashboard", req.url);
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/:path*"],
};
