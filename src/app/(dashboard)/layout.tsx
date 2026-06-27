import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileSidebarWrapper } from "@/components/layout/MobileSidebarWrapper";
import { EntityProvider } from "@/contexts/EntityContext";
import { GlobalProviders } from "@/components/layout/GlobalProviders";
import { resolveActiveEntity } from "@/lib/auth/effective-entity";
import type { Entity } from "@/lib/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const cookieStore = cookies();
  const entityCookieId = cookieStore.get("entity_id")?.value;

  // Profil (rôle + entité) et liste des entités (pour le switcher).
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: allEntities } = await supabase
    .from("entities")
    .select("*")
    .order("name");

  // Connexion unique : l'entité active est DÉRIVÉE du profil (plus de
  // /select-entity forcé sur cookie absent — il pourrait juste avoir expiré).
  // On ne redirige que si l'entité n'est pas résoluble (cas résiduel).
  // super_admin → cookie ?? profil ; rôles scopés → profil (RLS).
  const { entityId: activeEntityId, needsSelection } = resolveActiveEntity(
    profile?.role,
    profile?.entity_id,
    entityCookieId,
  );
  if (needsSelection) {
    redirect("/select-entity");
  }

  const entity: Entity | null =
    (allEntities ?? []).find((e) => e.id === activeEntityId) ?? null;
  const entitySlug = entity?.slug ?? "mr-formation";

  return (
    <EntityProvider initialEntity={entity} allEntities={allEntities ?? []}>
      <div
        className="flex flex-col h-screen overflow-hidden bg-background"
        data-entity={entitySlug}
      >
        <Header profile={profile} entity={entity} />
        <div className="flex flex-1 overflow-hidden">
          {/* Desktop sidebar */}
          <div className="hidden md:flex">
            <Sidebar entity={entity} role={profile?.role ?? "admin"} hasCrmAccess={profile?.has_crm_access ?? false} />
          </div>
          {/* Mobile sidebar overlay */}
          <MobileSidebarWrapper>
            <Sidebar entity={entity} role={profile?.role ?? "admin"} hasCrmAccess={profile?.has_crm_access ?? false} />
          </MobileSidebarWrapper>
          <main className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
      <GlobalProviders>{null}</GlobalProviders>
    </EntityProvider>
  );
}
