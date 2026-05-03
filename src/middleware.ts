import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PAGE_PERMISSIONS, API_PERMISSIONS, type Role } from "@/lib/auth/permissions";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Public routes
  const publicPaths = ["/login", "/select-entity", "/select-role", "/reset-password", "/api/auth", "/emargement", "/api/emargement", "/sign", "/api/documents/sign", "/api/documents/sign-status", "/access", "/questionnaire", "/api/questionnaire"];
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));
  const isRoot = pathname === "/";

  if (!user && !isPublicPath && !isRoot) {
    // Unauthenticated API calls get 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Allow reset-password page even when authenticated (user clicked reset link)
  if (pathname.startsWith("/reset-password")) {
    return response;
  }

  // Entity selection enforcement: authenticated users must have an entity cookie
  if (user && !isPublicPath && !isRoot) {
    const entityId = request.cookies.get("entity_id")?.value;
    if (!entityId && !pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/select-entity", request.url));
    }
  }

  // RBAC: Role-based access control
  if (user && !isPublicPath && !isRoot) {
    // Sécurité : le rôle est TOUJOURS lu depuis la DB et jamais depuis le cookie.
    // Un cookie client-side est modifiable (XSS, dev tools) → ne peut pas être
    // source de vérité pour une décision d'autorisation. Le cookie `user_role`
    // n'est conservé que pour l'affichage UI côté client (sans valeur de sécurité).
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const userRole = profile?.role;

    // Re-synchronise le cookie UI si nécessaire (httpOnly: false volontairement,
    // car lu par les pages client pour de l'affichage conditionnel uniquement).
    const cookieRole = request.cookies.get("user_role")?.value;
    if (userRole && cookieRole !== userRole) {
      response.cookies.set("user_role", userRole, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }

    // Check page routes (first match wins — PAGE_PERMISSIONS is ordered most-specific first)
    for (const [prefix, allowedRoles] of PAGE_PERMISSIONS) {
      if (pathname.startsWith(prefix)) {
        if (!userRole || !allowedRoles.includes(userRole as Role)) {
          return NextResponse.redirect(new URL("/", request.url));
        }
        break;
      }
    }

    // Check API routes (first match wins — API_PERMISSIONS is ordered most-specific first)
    for (const [prefix, allowedRoles] of API_PERMISSIONS) {
      if (pathname.startsWith(prefix)) {
        if (!userRole || !allowedRoles.includes(userRole as Role)) {
          return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
        }
        break;
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
