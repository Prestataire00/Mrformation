"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink } from "lucide-react";
import type {
  EntityKey,
  MissingByEntity,
  EntityIds,
} from "@/lib/validation/document-vars-validator";

const ENTITY_LABEL: Record<EntityKey, string> = {
  trainer: "Formateur",
  client: "Client",
  entity: "Organisme",
  learner: "Apprenant",
  session: "Session",
};

const ENTITY_ICON: Record<EntityKey, string> = {
  trainer: "🧑‍🏫",
  client: "🏢",
  entity: "🏛️",
  learner: "👤",
  session: "📅",
};

const FIELD_LABEL: Record<string, string> = {
  "first_name+last_name": "Nom complet",
  first_name: "Prénom",
  last_name: "Nom",
  address: "Adresse",
  postal_code: "Code postal",
  city: "Ville",
  siret: "SIRET",
  nda: "N° Déclaration d'Activité (NDA)",
  signature_url: "Signature (image)",
  signature_text: "Signature (texte)",
  hourly_rate: "Tarif horaire",
  company_name: "Raison sociale",
  email: "Email",
  phone: "Téléphone",
  name: "Nom",
  website: "Site web",
  president_name: "Représentant",
  birth_city: "Ville de naissance",
  title: "Titre",
  start_date: "Date de début",
  end_date: "Date de fin",
  location: "Lieu",
  mode: "Modalité",
  planned_hours: "Durée (heures)",
  total_price: "Montant HT",
  max_participants: "Nombre de participants",
};

const DOC_TYPE_LABEL: Record<string, string> = {
  convention_entreprise: "la convention de formation",
  convention_intervention: "la convention d'intervention",
  contrat_sous_traitance: "le contrat de sous-traitance",
  attestation_assiduite: "l'attestation d'assiduité",
  certificat_realisation: "le certificat de réalisation",
  feuille_emargement: "la feuille d'émargement",
  feuille_emargement_collectif: "la feuille d'émargement collective",
};

function buildEditUrl(entityKey: EntityKey, entityId: string | undefined, sessionId: string | undefined): string | null {
  if (entityKey === "trainer" && entityId) return `/admin/trainers/${entityId}`;
  if (entityKey === "client" && entityId) return `/admin/clients/${entityId}`;
  if (entityKey === "learner" && entityId) return `/admin/clients/apprenants/${entityId}`;
  if (entityKey === "entity") return `/admin/settings/organization`;
  if (entityKey === "session" && sessionId) return `/admin/formations/${sessionId}`;
  return null;
}

export type IncompleteDataDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docType?: string;
  missingByEntity: MissingByEntity;
  entityIds: EntityIds;
  sessionId?: string;
  onRetry?: () => void;
};

export function IncompleteDataDialog({
  open,
  onOpenChange,
  docType,
  missingByEntity,
  entityIds,
  sessionId,
  onRetry,
}: IncompleteDataDialogProps) {
  const docLabel = docType ? (DOC_TYPE_LABEL[docType] ?? "le document") : "le document";
  const entityKeys = Object.keys(missingByEntity) as EntityKey[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Impossible de générer {docLabel}
          </DialogTitle>
          <DialogDescription>
            Des données obligatoires sont manquantes pour produire un document conforme Qualiopi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {entityKeys.map((entityKey) => {
            const fields = missingByEntity[entityKey] ?? [];
            const editUrl = buildEditUrl(entityKey, entityIds[entityKey], sessionId);
            return (
              <div key={entityKey} className="border rounded-md p-3 space-y-2">
                <div className="font-medium flex items-center gap-2">
                  <span>{ENTITY_ICON[entityKey]}</span>
                  <span>{ENTITY_LABEL[entityKey]}</span>
                </div>
                <ul className="text-sm text-muted-foreground list-disc pl-5">
                  {fields.map((field) => (
                    <li key={field}>{FIELD_LABEL[field] ?? field}</li>
                  ))}
                </ul>
                {editUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => window.open(editUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Compléter le profil
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          {onRetry && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onRetry();
              }}
            >
              Recharger après édition
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
