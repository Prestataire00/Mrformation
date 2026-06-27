import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PAGE_PERMISSIONS, API_PERMISSIONS, findMatchingRoles, type Role } from "@/lib/auth/permissions";
import { resolveActiveEntity } from "@/lib/auth/effective-entity";

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
  const publicPaths = ["/login", "/select-entity", "/reset-password", "/api/auth", "/emargement", "/api/emargement", "/sign", "/api/documents/sign", "/api/documents/sign-status", "/access", "/questionnaire", "/api/questionnaire"];
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));
  const isRoot = pathname === "/";

  if (!user && !isPublicPath && !isRoot) {
    // Unauthenticated API calls get 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    // Connexion unique : on envoie directement vers la page de login.
    return NextResponse.redirect(new URL("/login", request.url));
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
      // .limit(1) : profile_id n'est pas unique (compte partagé apprenant sans
      // email). Sans ça, .maybeSingle() erre à ≥2 fiches → stamp first_login
      // jamais posé pour ces comptes. On stampe la 1ʳᵉ fiche (best-effort).
      .limit(1)
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

  // Entité active + RBAC : une seule lecture du profil (rôle + entity_id).
  if (user && !isPublicPath && !isRoot) {
    // Sécurité : le rôle est TOUJOURS lu depuis la DB et jamais depuis le cookie.
    // Un cookie client-side est modifiable (XSS, dev tools) → ne peut pas être
    // source de vérité pour une décision d'autorisation. Le cookie `user_role`
    // n'est conservé que pour l'affichage UI côté client (sans valeur de sécurité).
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, entity_id")
      .eq("id", user.id)
      .single();

    const userRole = profile?.role;

    // Connexion unique : l'entité active est DÉRIVÉE du profil (plus de
    // /select-entity forcé). Si le cookie manque ou diverge, on le pose ici
    // (sur la requête ET la réponse pour que la page courante le voie). On ne
    // route vers /select-entity qu'en dernier recours (entité non résoluble :
    // super_admin sans entité, ou profil sans entity_id — cas résiduel).
    const cookieEntityId = request.cookies.get("entity_id")?.value;
    const { entityId: activeEntityId, needsSelection } = resolveActiveEntity(
      userRole,
      profile?.entity_id as string | null | undefined,
      cookieEntityId,
    );
    if (needsSelection) {
      if (!pathname.startsWith("/api/")) {
        return NextResponse.redirect(new URL("/select-entity", request.url));
      }
    } else if (activeEntityId && !cookieEntityId) {
      // On ne pose le cookie que s'il est ABSENT (QR / cookie expiré). Sur un
      // cookie présent mais divergent, on ne l'écrase PAS : pour un rôle scopé
      // la RLS s'appuie de toute façon sur le profil, et écraser provoquerait
      // un flicker pendant le switch async d'un commercial (cookie posé avant
      // la mise à jour du profil).
      const entityCookie = {
        name: "entity_id",
        value: activeEntityId,
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
      };
      request.cookies.set(entityCookie);
      response.cookies.set(entityCookie);
    }

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
