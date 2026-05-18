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
import { AlertTriangle, ExternalLink, FileWarning } from "lucide-react";
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
  cout_formateur_ht: "Coût/tarif horaire du formateur (à saisir sur la formation, section Formateurs)",
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

// Libellé du bouton d'action selon l'entité visée. Avant : "Compléter le profil"
// systématique → trompeur pour entity (organisme = settings) et session
// (formation = pas un profil). Désormais explicite.
const EDIT_CTA_LABEL: Record<EntityKey, string> = {
  trainer: "Compléter le profil",
  client: "Compléter le profil",
  learner: "Compléter le profil",
  entity: "Modifier l'organisme",
  session: "Modifier la formation",
};

export type IncompleteDataDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docType?: string;
  missingByEntity: MissingByEntity;
  entityIds: EntityIds;
  sessionId?: string;
  onRetry?: () => void;
  // h-16 : bypass validation et génère le PDF avec placeholders restants.
  // L'admin assume le document partiel (à compléter ensuite ou utile pour
  // un brouillon à envoyer en signature).
  onForceGenerate?: () => void;
};

export function IncompleteDataDialog({
  open,
  onOpenChange,
  docType,
  missingByEntity,
  entityIds,
  sessionId,
  onRetry,
  onForceGenerate,
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
                    {EDIT_CTA_LABEL[entityKey]}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          {onForceGenerate && (
            <Button
              variant="outline"
              className="gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => {
                onOpenChange(false);
                onForceGenerate();
              }}
              title="Génère le PDF avec les champs manquants laissés vides (utile pour un brouillon ou un envoi en signature)"
            >
              <FileWarning className="h-3 w-3" />
              Générer quand même
            </Button>
          )}
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
