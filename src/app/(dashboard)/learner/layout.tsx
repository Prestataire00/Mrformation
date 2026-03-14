import { createClient } from "@/lib/supabase/server";
import { ReactNode } from "react";

/**
 * Layout du portail apprenant.
 * Crée automatiquement le record `learners` si l'utilisateur connecté
 * n'en a pas encore (cas d'un compte créé via inscription directe).
 */
export default async function LearnerLayout({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // maybeSingle() retourne null proprement si 0 résultats (contrairement à single() qui lève une erreur)
    const { data: existing } = await supabase
      .from("learners")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (!existing) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, entity_id")
        .eq("id", user.id)
        .single();

      if (profile?.entity_id) {
        await supabase.from("learners").insert({
          profile_id: user.id,
          entity_id: profile.entity_id,
          first_name: profile.first_name ?? "Apprenant",
          last_name: profile.last_name ?? "",
          email: profile.email ?? user.email,
        });
      }
    }
  }

  return <>{children}</>;
}
