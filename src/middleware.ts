import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PAGE_PERMISSIONS, API_PERMISSIONS, findMatchingRoles, type Role } from "@/lib/auth/permissions";

export async function middleware(request: NextRequest) {
  // Bypass pour les requêtes server-to-server signées avec CRON_SECRET.
  // Sans ce bypass, le proxy /api/.../trigger-event → /api/.../run-cron et les
  // Netlify Scheduled Functions (fetch depuis le serveur, donc sans cookies)
  // sont 401'd par le middleware faute de session Supabase. Les routes cron
  // valident elles-mêmes le secret (comparaison stricte) → on peut les laisser
  // passer en toute sécurité ici. Le secret n'est jamais exposé au navigateur,
  // donc cette voie est inatteignable depuis le front.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader === `Bearer ${cronSecret}`) {
      return NextResponse.next({ request: { headers: request.headers } });
    }
  }

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

  // Pédagogie V2 Epic 2.5 — Force change password à la première connexion.
  // Le flag `password_must_change` est porté par `user_metadata` (claim JWT,
  // donc lu depuis la session sans hit DB). On laisse passer la page de
  // changement de mot de passe elle-même, son API, et l'API auth (sign-out).
  if (user && user.user_metadata?.password_must_change === true) {
    const isChangePasswordPage = pathname.startsWith("/learner/change-password");
    const isChangePasswordApi = pathname.startsWith("/api/learner/change-password");
    const isAuthApi = pathname.startsWith("/api/auth");
    if (!isChangePasswordPage && !isChangePasswordApi && !isAuthApi) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "password_change_required" },
          { status: 403 },
        );
      }
      return NextResponse.redirect(
        new URL("/learner/change-password", request.url),
      );
    }
  }

  // Pédagogie V2 Epic 2.5 — Audit log first_login (fire-and-forget).
  // Quand un apprenant accède pour la 1re fois (post-change-password) à une
  // page de son espace, on stamp `first_login_at`. La marque
  // `learner_first_login_at_stamped` (cookie session) évite de rerequêter
  // sur chaque navigation : on ne stamp qu'une seule fois par session.
  if (
    user &&
    pathname.startsWith("/learner") &&
    !pathname.startsWith("/learner/change-password") &&
    !request.cookies.get("learner_first_login_stamped")
  ) {
    // On marque dès maintenant pour ne pas relancer le check à chaque nav.
    response.cookies.set("learner_first_login_stamped", "1", {
      path: "/",
      maxAge: 60 * 60 * 24, // 24h
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
    // Stamping en arrière-plan (non bloquant). On ne fait PAS attendre la
    // requête principale — c'est juste un best-effort audit log.
    void supabase
      .from("learners")
      .select("id, entity_id, first_login_at")
      .eq("profile_id", user.id)
      .maybeSingle()
      .then(async ({ data: learner }) => {
        if (learner && !learner.first_login_at) {
          await supabase
            .from("learners")
            .update({ first_login_at: new Date().toISOString() })
            .eq("id", learner.id);
          await supabase.from("activity_log").insert({
            entity_id: learner.entity_id,
            user_id: user.id,
            action: "update",
            resource_type: "learner.first_login",
            resource_id: learner.id,
            details: {},
          });
        }
      });
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

    // Page routes (first match wins — PAGE_PERMISSIONS ordonné du plus spécifique au plus général)
    const pageRoles = findMatchingRoles(pathname, PAGE_PERMISSIONS);
    if (pageRoles && (!userRole || !pageRoles.includes(userRole as Role))) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    // API routes (first match wins — API_PERMISSIONS ordonné du plus spécifique au plus général)
    const apiRoles = findMatchingRoles(pathname, API_PERMISSIONS);
    if (apiRoles && (!userRole || !apiRoles.includes(userRole as Role))) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
