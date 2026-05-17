"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { IncompleteDataDialog } from "@/components/dialogs/IncompleteDataDialog";
import type {
  EntityIds,
  MissingByEntity,
} from "@/lib/validation/document-vars-validator";

export type GenerateRequest = {
  template_id?: string;
  doc_type?: string;
  context: {
    session_id?: string;
    learner_id?: string;
    client_id?: string;
    trainer_id?: string;
  };
};

export type GenerateSuccess = {
  base64: string;
  filename: string;
  sizeBytes?: number;
  cached?: boolean;
  warnings?: { missingByEntity: MissingByEntity };
};

type IncompleteState = {
  open: boolean;
  docType?: string;
  missingByEntity: MissingByEntity;
  entityIds: EntityIds;
  sessionId?: string;
  lastRequest?: GenerateRequest;
};

/**
 * Hook centralisant les appels à /api/documents/generate-from-template.
 * Catch automatiquement les 422 INCOMPLETE_DATA et ouvre la modal
 * IncompleteDataDialog avec deep links vers édition des entités.
 *
 * Usage :
 *   const { generate, incompleteDialog } = useDocumentGeneration();
 *   const result = await generate({ doc_type: "convention_intervention", context: {...} });
 *   if (result) { // PDF généré }
 *   // Rendu : <>{incompleteDialog}</>
 */
export function useDocumentGeneration() {
  const { toast } = useToast();
  const [incomplete, setIncomplete] = useState<IncompleteState>({
    open: false,
    missingByEntity: {},
    entityIds: {},
  });

  const generate = useCallback(
    async (request: GenerateRequest): Promise<GenerateSuccess | null> => {
      try {
        const res = await fetch("/api/documents/generate-from-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        const json = await res.json();

        if (res.status === 422 && json.error === "INCOMPLETE_DATA") {
          setIncomplete({
            open: true,
            docType: json.docType,
            missingByEntity: json.missingByEntity ?? {},
            entityIds: json.entityIds ?? {},
            sessionId: request.context.session_id,
            lastRequest: request,
          });
          return null;
        }

        if (!res.ok) {
          throw new Error(json.error ?? "Échec génération PDF");
        }

        if (json.warnings?.missingByEntity) {
          const entities = Object.keys(json.warnings.missingByEntity).join(", ");
          toast({
            title: "Document généré avec données incomplètes",
            description: `Champs manquants sur : ${entities}. Le PDF a été produit mais reste à compléter.`,
          });
        }

        return json as GenerateSuccess;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur génération PDF";
        toast({ title: "Erreur", description: msg, variant: "destructive" });
        return null;
      }
    },
    [toast],
  );

  const incompleteDialog = (
    <IncompleteDataDialog
      open={incomplete.open}
      onOpenChange={(open) => setIncomplete((prev) => ({ ...prev, open }))}
      docType={incomplete.docType}
      missingByEntity={incomplete.missingByEntity}
      entityIds={incomplete.entityIds}
      sessionId={incomplete.sessionId}
      onRetry={
        incomplete.lastRequest
          ? () => {
              const req = incomplete.lastRequest!;
              void generate(req);
            }
          : undefined
      }
    />
  );

  return { generate, incompleteDialog };
}
