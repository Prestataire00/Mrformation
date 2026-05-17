/**
 * Validation pré-génération : détecte les variables non résolues dans un HTML
 * de template document et les groupe par entité du ResolveContext.
 *
 * Pourquoi : éviter les PDFs Qualiopi avec placeholders [Xxx] visibles (cf
 * spec docs/superpowers/specs/2026-05-17-document-vars-validation-design.md).
 */
import { resolveDocumentVariables, type ResolveContext } from "@/lib/utils/resolve-variables";

export type EntityKey = "trainer" | "client" | "entity" | "learner" | "session";

export type MissingByEntity = Partial<Record<EntityKey, string[]>>;

export type EntityIds = Partial<Record<EntityKey, string>>;

export type ValidationResult = {
  valid: boolean;
  missingByEntity: MissingByEntity;
  entityIds: EntityIds;
};

/**
 * Mapping fallback string → entityKey + field. Source de vérité : grep des
 * `[Xxx]` hardcodés dans src/lib/utils/resolve-variables.ts.
 *
 * NB : ne contient QUE les fallback liés à une entité du ResolveContext.
 * Les fallback structurels (`[Tableau signature]`, `[QR Code]`, `[Liste
 * apprenants]`) sont volontairement absents — ils ne représentent pas un
 * champ à compléter par l'utilisateur.
 */
export const FALLBACK_TO_ENTITY_FIELD: Record<string, { entityKey: EntityKey; field: string }> = {
  // Formateur (trainer)
  "[Nom formateur]": { entityKey: "trainer", field: "first_name+last_name" },
  "[Adresse formateur]": { entityKey: "trainer", field: "address" },
  "[SIRET formateur]": { entityKey: "trainer", field: "siret" },
  "[NDA formateur]": { entityKey: "trainer", field: "nda" },
  "[Signature formateur]": { entityKey: "trainer", field: "signature_url" },
  "[Coût formateur]": { entityKey: "trainer", field: "hourly_rate" },

  // Client
  "[Nom client]": { entityKey: "client", field: "company_name" },
  "[Adresse client]": { entityKey: "client", field: "address" },
  "[SIRET client]": { entityKey: "client", field: "siret" },
  "[Téléphone client]": { entityKey: "client", field: "phone" },
  "[Email client]": { entityKey: "client", field: "email" },

  // Organisme (entity)
  "[Nom organisme]": { entityKey: "entity", field: "name" },
  "[SIRET organisme]": { entityKey: "entity", field: "siret" },
  "[NDA]": { entityKey: "entity", field: "nda" },
  "[Adresse organisme]": { entityKey: "entity", field: "address" },
  "[Ville organisme]": { entityKey: "entity", field: "city" },
  "[Email organisme]": { entityKey: "entity", field: "email" },
  "[Tél organisme]": { entityKey: "entity", field: "phone" },
  "[Site organisme]": { entityKey: "entity", field: "website" },
  "[Signature organisme]": { entityKey: "entity", field: "signature_text" },
  "[Représentant organisme]": { entityKey: "entity", field: "president_name" },

  // Apprenant (learner)
  "[Nom apprenant]": { entityKey: "learner", field: "last_name" },
  "[Prénom apprenant]": { entityKey: "learner", field: "first_name" },
  "[Email apprenant]": { entityKey: "learner", field: "email" },
  "[Téléphone apprenant]": { entityKey: "learner", field: "phone" },
  "[Ville de naissance]": { entityKey: "learner", field: "birth_city" },

  // Session
  "[Titre formation]": { entityKey: "session", field: "title" },
  "[Date début]": { entityKey: "session", field: "start_date" },
  "[Date fin]": { entityKey: "session", field: "end_date" },
  "[Date formation]": { entityKey: "session", field: "start_date" },
  "[Lieu]": { entityKey: "session", field: "location" },
  "[Adresse formation]": { entityKey: "session", field: "location" },
  "[Modalité]": { entityKey: "session", field: "mode" },
  "[Durée heures]": { entityKey: "session", field: "planned_hours" },
  "[Montant HT]": { entityKey: "session", field: "total_price" },
  "[Effectifs]": { entityKey: "session", field: "max_participants" },
};

/**
 * Valide qu'un template HTML peut être généré sans laisser de placeholders
 * `[Variable]` visibles. Appelle le resolver puis scanne le HTML résolu pour
 * détecter les fallback connus (cf FALLBACK_TO_ENTITY_FIELD).
 */
export function validateDocumentVariables(
  html: string,
  context: ResolveContext,
): ValidationResult {
  // Placeholder — implémentation à la Task 2 (TDD).
  void html;
  void context;
  void resolveDocumentVariables;
  return { valid: true, missingByEntity: {}, entityIds: {} };
}
