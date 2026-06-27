import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveEntity } from "@/lib/auth/effective-entity";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Non authentifié : connexion unique → page de login générique.
  if (!user) {
    redirect("/login");
  }

  // Authentifié : routage par rôle, entité dérivée du profil.
  const cookieStore = cookies();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, entity_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  // L'entité active dérive du profil (le middleware pose le cookie sur les
  // pages protégées). On ne renvoie vers /select-entity que si elle est
  // non résoluble (super_admin sans entité, ou profil sans entity_id résiduel).
  const cookieEntityId = cookieStore.get("entity_id")?.value;
  const { needsSelection } = resolveActiveEntity(
    profile.role,
    profile.entity_id as string | null | undefined,
    cookieEntityId,
  );
  if (needsSelection) {
    redirect("/select-entity");
  }

  switch (profile.role) {
    case "super_admin":
    case "admin":
      redirect("/admin");
    case "commercial":
      redirect("/admin/crm");
    case "trainer":
      redirect("/trainer");
    case "client":
      redirect("/client");
    case "learner":
      redirect("/learner");
    default:
      // Rôle inconnu/NULL : ne PAS envoyer vers /admin (la RBAC le renverrait
      // ici → boucle de redirection). On repasse par le login.
      redirect("/login");
  }
}
