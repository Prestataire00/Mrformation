/**
 * Pédagogie V2 Epic 2 — Story E2-S01
 *
 * Helper de la boucle d'exécution du bulk import d'apprenants.
 *
 * Extrait du fichier `netlify/functions/learners-bulk-create-background.mts`
 * pour être testable depuis vitest (les .mts Netlify ne sont pas inclus dans
 * vitest.config.ts → on isole ici la logique pure et la BG function n'est
 * qu'un wrapper HTTP autour de ce helper).
 *
 * Responsabilités :
 *  - Itérer sur la liste des learners du payload
 *  - Appeler `createLearnerWithCredentials` par learner
 *  - Créer l'enrollment correspondant
 *  - Cumuler results (created_count, error_count, learners[])
 *  - Construire les pdfRows (passwords RAM uniquement)
 *  - Logger en JSON structuré chaque étape
 *
 * SÉCURITÉ (AC 5) : aucun mot de passe ne sort en DB. Les passwords sont
 * uniquement dans `pdfRows` (RAM) consommé par `generateLearnerCredentialsPDF`.
 * Le `JobResults` retourné ne contient PAS de password.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createLearnerWithCredentials,
  type CreateLearnerInput,
} from "@/lib/services/learner-account";
import type { LearnerCredentialsRow } from "@/lib/services/learner-credentials-pdf";

// ──────────────────────────────────────────────────────────────────────
// Types payload (miroir de la route /start)
// ──────────────────────────────────────────────────────────────────────

export interface BulkImportLearnerInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  clientId?: string | null;
}

export interface BulkImportPayload {
  learners: BulkImportLearnerInput[];
  entitySlug: "mr-formation" | "c3v-formation";
}

// ──────────────────────────────────────────────────────────────────────
// Types results (miroir de la route /start — strict no-password)
// ──────────────────────────────────────────────────────────────────────

export interface JobLearnerResult {
  learnerId: string | null;
  fullName: string;
  username: string | null;
  email: string | null;
  syntheticEmailUsed: boolean;
  enrolled: boolean;
  isError: boolean;
  errorMessage: string | null;
}

export interface JobResults {
  created_count: number;
  enrolled_count: number;
  error_count: number;
  learners: JobLearnerResult[];
}

// ──────────────────────────────────────────────────────────────────────
// Logger structuré JSON
// ──────────────────────────────────────────────────────────────────────

export type StructuredLogger = (record: Record<string, unknown>) => void;

/** Logger par défaut : JSON sur console.log. */
export const defaultJsonLogger: StructuredLogger = (record) => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...record }));
};

// ──────────────────────────────────────────────────────────────────────
// Helper : exécute la boucle de création + enrollment
// ──────────────────────────────────────────────────────────────────────

export interface RunBulkImportLearnerLoopParams {
  admin: SupabaseClient;
  entityId: string;
  sessionId: string;
  payload: BulkImportPayload;
  jobId: string;
  logger?: StructuredLogger;
}

export interface RunBulkImportLearnerLoopResult {
  results: JobResults;
  /** Credentials en RAM pour génération PDF (passwords présents). */
  pdfRows: LearnerCredentialsRow[];
}

/**
 * Exécute la boucle de création d'apprenants pour un job bulk import.
 *
 * Garanties :
 *  - 1 learner KO n'interrompt PAS la boucle (erreur isolée dans
 *    `results.learners[].errorMessage`).
 *  - Les passwords ne sont JAMAIS écrits dans `results.learners[]` —
 *    uniquement dans `pdfRows` pour usage immédiat par le PDF generator.
 *  - Chaque learner traité émet un log JSON structuré
 *    (`step: "learner_processed"`).
 */
export async function runBulkImportLearnerLoop(
  params: RunBulkImportLearnerLoopParams,
): Promise<RunBulkImportLearnerLoopResult> {
  const {
    admin,
    entityId,
    sessionId,
    payload,
    jobId,
    logger = defaultJsonLogger,
  } = params;

  const results: JobResults = {
    created_count: 0,
    enrolled_count: 0,
    error_count: 0,
    learners: [],
  };

  const pdfRows: LearnerCredentialsRow[] = [];

  for (let i = 0; i < payload.learners.length; i++) {
    const learnerInput = payload.learners[i];
    const fullName =
      `${learnerInput.firstName} ${learnerInput.lastName}`.trim();
    const learnerStartedAt = Date.now();

    try {
      const createInput: CreateLearnerInput = {
        entityId,
        entitySlug: payload.entitySlug,
        firstName: learnerInput.firstName,
        lastName: learnerInput.lastName,
        email: learnerInput.email ?? null,
        clientId: learnerInput.clientId ?? null,
      };

      const created = await createLearnerWithCredentials(admin, createInput);

      // INSERT enrollment immédiat (idem pattern /start route).
      const { error: enrollErr } = await admin.from("enrollments").insert({
        session_id: sessionId,
        learner_id: created.learnerId,
        client_id: learnerInput.clientId ?? null,
        status: "registered",
      });

      results.created_count += 1;
      if (!enrollErr) results.enrolled_count += 1;

      // SEC-9 : on EXCLUT explicitement `tempPassword` de results.learners[].
      results.learners.push({
        learnerId: created.learnerId,
        fullName,
        username: created.username,
        email: created.email,
        syntheticEmailUsed: created.syntheticEmailUsed,
        enrolled: !enrollErr,
        isError: false,
        errorMessage: enrollErr ? enrollErr.message : null,
      });

      // pdfRows contient les passwords (RAM uniquement, consommé par PDF gen).
      pdfRows.push({
        fullName,
        identifier: created.username,
        password: created.tempPassword,
        isSynthetic: created.syntheticEmailUsed,
      });

      logger({
        job_id: jobId,
        step: "learner_processed",
        index: i,
        total: payload.learners.length,
        success: true,
        enrolled: !enrollErr,
        synthetic_email: created.syntheticEmailUsed,
        duration_ms: Date.now() - learnerStartedAt,
      });
    } catch (creationErr) {
      results.error_count += 1;
      const msg =
        creationErr instanceof Error
          ? creationErr.message
          : String(creationErr);
      results.learners.push({
        learnerId: null,
        fullName,
        username: null,
        email: null,
        syntheticEmailUsed: false,
        enrolled: false,
        isError: true,
        errorMessage: msg,
      });

      logger({
        job_id: jobId,
        step: "learner_processed",
        index: i,
        total: payload.learners.length,
        success: false,
        error: msg,
        duration_ms: Date.now() - learnerStartedAt,
      });
    }
  }

  return { results, pdfRows };
}

// ──────────────────────────────────────────────────────────────────────
// Helper de finalisation : décide du status final du job (completed/failed)
// ──────────────────────────────────────────────────────────────────────

/**
 * Statut final du job en fonction des résultats.
 *
 * Règle alignée avec la route /start route inline (cf. ligne ~402) :
 *  - "failed" si TOUS ont échoué (created_count === 0 ET error_count > 0)
 *  - "completed" sinon (même partiel : on a au moins 1 succès).
 */
export function decideFinalStatus(
  results: JobResults,
): "completed" | "failed" {
  if (results.created_count === 0 && results.error_count > 0) return "failed";
  return "completed";
}

/**
 * Message d'erreur agrégé pour le job (champ `error_message` en DB).
 * Null si pas d'erreur OU si au moins 1 succès (info disponible dans
 * `results.learners[].errorMessage` par learner KO).
 */
export function buildAggregatedErrorMessage(
  results: JobResults,
): string | null {
  if (results.created_count === 0 && results.error_count > 0) {
    return "Tous les apprenants ont échoué (voir results.learners[].errorMessage)";
  }
  return null;
}
