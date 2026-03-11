import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Mapping : route prefix → allowed roles
const PAGE_ROLE_ROUTES: Record<string, string[]> = {
  "/admin/crm": ["admin", "trainer"],
  "/admin": ["admin"],
  "/trainer": ["admin", "trainer"],
  "/client": ["admin", "client"],
  "/learner": ["admin", "learner"],
};

const API_ROLE_ROUTES: Record<string, string[]> = {
  "/api/clients": ["admin"],
  "/api/trainers": ["admin"],
  "/api/trainings": ["admin"],
  "/api/sessions": ["admin"],
  "/api/crm": ["admin", "trainer"],
  "/api/elearning": ["admin", "learner"],
  "/api/enrollments/self-enroll": ["learner"],
  "/api/admin": ["admin"],
  "/api/ai": ["admin"],
  "/api/emails": ["admin"],
  "/api/infogreffe": ["admin"],
  "/api/pappers": ["admin"],
};

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
  const publicPaths = ["/login", "/inscription", "/select-entity", "/select-role", "/reset-password", "/api/auth"];
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
    let userRole = request.cookies.get("user_role")?.value;

    // If cookie is missing, fetch role from DB and set it
    if (!userRole) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role) {
        userRole = profile.role;
        // Set the cookie on the response so it persists for future requests
        response.cookies.set("user_role", profile.role, {
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
          sameSite: "lax",
        });
      }
    }

    // Check page routes
    for (const [prefix, allowedRoles] of Object.entries(PAGE_ROLE_ROUTES)) {
      if (pathname.startsWith(prefix)) {
        if (!userRole || !allowedRoles.includes(userRole)) {
          return NextResponse.redirect(new URL("/", request.url));
        }
        break;
      }
    }

    // Check API routes
    for (const [prefix, allowedRoles] of Object.entries(API_ROLE_ROUTES)) {
      if (pathname.startsWith(prefix)) {
        if (!userRole || !allowedRoles.includes(userRole)) {
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
