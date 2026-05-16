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
      // Persist profile.entity_id en DB via endpoint dédié (service_role).
      // RLS bloque le UPDATE direct sur entity_id depuis le client (fix
      // sécurité auto-promotion — cf supabase/fix_rls_security.sql). On
      // passe donc par /api/auth/switch-entity qui vérifie super_admin et
      // bypass via service_role.
      (async () => {
        try {
          await fetch("/api/auth/switch-entity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entityId: newEntity.id }),
          });
        } catch {
          // Silent : si l'endpoint échoue, le cookie a déjà été set et
          // l'UI affichera la nouvelle entité (mais les API verront
          // l'ancienne). Symptôme : PDF avec mauvaise entité.
          // Pour debug : ouvrir DevTools > Network > XHR pour voir l'erreur.
        }
        router.refresh();
      })();
    },
    [router]
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
