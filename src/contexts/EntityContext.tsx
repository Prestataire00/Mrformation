"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  const [entity, setEntityState] = useState<Entity | null>(initialEntity);

  const setEntity = useCallback(
    (newEntity: Entity) => {
      setEntityState(newEntity);
      setCookie("entity_id", newEntity.id);
      router.refresh();
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
