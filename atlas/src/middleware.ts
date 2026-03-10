import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!url || !key) {
    // no credentials means we can't verify the user; fall back to no-op
    // middleware so the site still runs during local dev without a
    // `.env.local` file.
    console.warn(
      "[Atlas] middleware running without Supabase config; auth checks disabled.",
    );
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  const isProtected =
    pathname.startsWith("/teacher") || pathname.startsWith("/student");
  const isAuthPage =
    pathname.startsWith("/auth/login") || pathname.startsWith("/auth/signup");

  // Read role from JWT metadata — no DB query needed, never fails
  const role = (user?.user_metadata?.role as string) || "student";

  // 1. Unauthenticated → login
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 2. Logged-in user hitting an auth page → bounce to correct portal
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname =
      role === "teacher" ? "/teacher/dashboard" : "/student/dashboard";
    return NextResponse.redirect(url);
  }

  // 3. Wrong portal → correct portal
  if (user && isProtected) {
    if (role === "teacher" && pathname.startsWith("/student")) {
      const url = request.nextUrl.clone();
      url.pathname = "/teacher/dashboard";
      return NextResponse.redirect(url);
    }
    if (role === "student" && pathname.startsWith("/teacher")) {
      const url = request.nextUrl.clone();
      url.pathname = "/student/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
