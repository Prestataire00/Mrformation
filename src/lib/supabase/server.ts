import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./public-config";

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // The `set` method was called from a Server Component.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // The `delete` method was called from a Server Component.
          }
        },
      },
    }
  );
}

/**
 * Client Supabase utilisant la service_role key — bypass complet des RLS.
 *
 * À n'utiliser QUE dans des contextes serveur authentifiés par un mécanisme
 * autre que Supabase Auth (ex: routes cron protégées par CRON_SECRET, appels
 * inter-services depuis une Netlify Background Function).
 *
 * NE JAMAIS instancier dans un code qui peut être déclenché par un utilisateur
 * non authentifié sans audit préalable — toute la sécurité multi-tenant
 * (entity_id, propriété apprenant) doit être appliquée explicitement par le
 * code appelant.
 */
export function createServiceRoleClient() {
  const url = SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "createServiceRoleClient : SUPABASE_SERVICE_ROLE_KEY manquant",
    );
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
