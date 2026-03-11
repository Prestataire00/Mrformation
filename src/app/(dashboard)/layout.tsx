import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { EntityProvider } from "@/contexts/EntityContext";
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

  // Read entity from cookie
  const cookieStore = cookies();
  const entityCookieId = cookieStore.get("entity_id")?.value;

  if (!entityCookieId) {
    redirect("/select-entity");
  }

  // Load current entity
  const { data: currentEntity } = await supabase
    .from("entities")
    .select("*")
    .eq("id", entityCookieId)
    .single();

  // Load all entities (for the switcher)
  const { data: allEntities } = await supabase
    .from("entities")
    .select("*")
    .order("name");

  // Load profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const entity: Entity | null = currentEntity ?? null;
  const entitySlug = entity?.slug ?? "mr-formation";

  return (
    <EntityProvider initialEntity={entity} allEntities={allEntities ?? []}>
      <div
        className="flex flex-col h-screen overflow-hidden bg-background"
        data-entity={entitySlug}
      >
        <Header profile={profile} entity={entity} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar entity={entity} role={profile?.role ?? "admin"} hasCrmAccess={profile?.has_crm_access ?? false} />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </EntityProvider>
  );
}
