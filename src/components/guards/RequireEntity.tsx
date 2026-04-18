"use client";

import { useEntity } from "@/contexts/EntityContext";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface Props {
  children: React.ReactNode;
}

export function RequireEntity({ children }: Props) {
  const { entityId } = useEntity();

  if (!entityId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Aucune entité sélectionnée</p>
        <Button asChild>
          <Link href="/select-entity">Sélectionner une entité</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
