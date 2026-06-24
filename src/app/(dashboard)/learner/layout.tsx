import { createClient } from "@/lib/supabase/server";
import { ReactNode } from "react";
import { pickLearnerRecord } from "@/lib/learner/pick-learner-record";

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
    // Multi-fiche (compte partagé apprenant sans email) : .maybeSingle() lève
    // une erreur à ≥ 2 fiches → `existing` null → on créait à tort une fiche
    // fantôme à chaque chargement. pickLearnerRecord renvoie null UNIQUEMENT
    // s'il n'existe aucune fiche → l'insertion ne se déclenche plus à tort.
    const { data: existingRows } = await supabase
      .from("learners")
      .select("id")
      .eq("profile_id", user.id);
    const existing = pickLearnerRecord(existingRows);

    if (!existing) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, entity_id, role")
        .eq("id", user.id)
        .single();

      // Ne créer le record learners QUE pour un vrai apprenant. Sinon un
      // admin/super_admin (autorisés sur /learner par PAGE_PERMISSIONS) se
      // verrait créer un "learner-ghost" qui pollue la table.
      if (profile?.entity_id && profile.role === "learner") {
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
