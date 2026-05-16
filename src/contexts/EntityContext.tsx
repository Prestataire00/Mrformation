"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Entity } from "@/lib/types";

interface EntityContextValue {
  entity: Entity | null;
  entityId: string | null;
  entities: Entity[];
  setEntity: (entity: Entity) => void;
}

const EntityContext = createContext<EntityContextValue>({
  entity: null,
  entityId: null,
  entities: [],
  setEntity: () => {},
});

export function useEntity() {
  return useContext(EntityContext);
}

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

interface EntityProviderProps {
  children: React.ReactNode;
  initialEntity: Entity | null;
  allEntities: Entity[];
}

export function EntityProvider({ children, initialEntity, allEntities }: EntityProviderProps) {
  const router = useRouter();
  const supabase = createClient();
  const [entity, setEntityState] = useState<Entity | null>(initialEntity);

  const setEntity = useCallback(
    (newEntity: Entity) => {
      setEntityState(newEntity);
      setCookie("entity_id", newEntity.id);
      // Persist profile.entity_id en DB pour que les routes API
      // (qui lisent depuis profiles, pas le cookie) voient la nouvelle entité.
      // Sans ça : le switcher Header changeait juste le cookie+UI mais les
      // PDF générés gardaient l'ancienne entité du profile (bug visible
      // notamment quand super_admin switche : UI=C3V mais PDF=MR).
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("profiles")
            .update({ entity_id: newEntity.id })
            .eq("id", user.id);
        }
        router.refresh();
      })();
    },
    [router, supabase]
  );

  // Sync cookie on mount if initialEntity exists
  useEffect(() => {
    if (initialEntity) {
      setCookie("entity_id", initialEntity.id);
    }
  }, [initialEntity]);

  return (
    <EntityContext.Provider
      value={{
        entity,
        entityId: entity?.id ?? null,
        entities: allEntities,
        setEntity,
      }}
    >
      {children}
    </EntityContext.Provider>
  );
}
