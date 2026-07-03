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
import {
  generateLearnerCredentialsPDF,
  type LearnerCredentialsRow,
  type LearnerCredentialsEntitySlug,
} from "@/lib/services/learner-credentials-pdf";
import { uploadLearnerCredentialsPDF } from "@/lib/services/learner-credentials-storage";

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

// ──────────────────────────────────────────────────────────────────────
// Orchestrateur de job complet (harness partagé Netlify BG / Railway in-process)
// ──────────────────────────────────────────────────────────────────────
//
// Ce wrapper reproduit fidèlement le harnais de la Background Function
// `netlify/functions/learners-bulk-create-background.mts` : chargement du job,
// idempotence par statut, passage en `running`, validation du payload JSONB,
// boucle de création (runBulkImportLearnerLoop), génération + upload du PDF de
// credentials, puis écriture du statut final. Il est appelable des DEUX côtés :
//   - Netlify BG function : `.mts` → runBulkLearnerJob(...) (wrapper HTTP mince).
//   - Railway : la route /start le lance en fire-and-forget in-process
//     (`void runBulkLearnerJob(...)`), le conteneur long-lived tenant la promesse
//     jusqu'à complétion.
//
// Tous les writes de progression/statut restent identiques (l'UI poll ces
// champs). Aucun mot de passe n'est jamais persisté (SEC-9).

/** Résultat de `runBulkLearnerJob` — reflète l'issue de l'idempotence/exécution. */
export interface RunBulkLearnerJobResult {
  ok: boolean;
  /** Statut final du job (ou statut existant en cas de skip idempotent). */
  status: "queued" | "running" | "completed" | "failed";
  /** Vrai si le job a été ignoré (déjà completed/failed). */
  skipped?: boolean;
  /** Vrai si le job était déjà `running` (rejeu concurrent). */
  deferred?: boolean;
  createdCount?: number;
  errorCount?: number;
  /** Message d'erreur si le job n'a pas pu démarrer/aboutir. */
  error?: string;
}

export interface RunBulkLearnerJobParams {
  /** Client service_role (bypass RLS — la garde entity_id est faite en amont). */
  admin: SupabaseClient;
  jobId: string;
  logger?: StructuredLogger;
}

/** Patch DB best-effort avec log d'erreur (n'interrompt pas le flux). */
async function patchJob(
  admin: SupabaseClient,
  jobId: string,
  patch: Record<string, unknown>,
  logger: StructuredLogger,
): Promise<void> {
  const { error } = await admin
    .from("learner_bulk_import_jobs")
    .update(patch)
    .eq("id", jobId);
  if (error) {
    logger({
      job_id: jobId,
      step: "update_job_failed",
      level: "error",
      error: error.message,
    });
  }
}

/**
 * Exécute un job de bulk import de bout en bout à partir de son `jobId`.
 *
 * Idempotence (identique au `.mts`) :
 *   - status = "completed" | "failed" → no-op (skipped).
 *   - status = "running"              → defer (rejeu concurrent, on n'écrase pas).
 *   - status = "queued"               → on prend la main (→ "running").
 *
 * Le payload (`learners[]` + `entitySlug`) est lu depuis la colonne JSONB
 * `payload` du job (persistée par la route /start).
 */
export async function runBulkLearnerJob(
  params: RunBulkLearnerJobParams,
): Promise<RunBulkLearnerJobResult> {
  const { admin, jobId, logger = defaultJsonLogger } = params;
  const startedAt = Date.now();
  logger({ job_id: jobId, step: "start" });

  // Charge le job complet (incluant `payload` JSONB).
  const { data: job, error: loadErr } = await admin
    .from("learner_bulk_import_jobs")
    .select("id, entity_id, session_id, status, payload, payload_count")
    .eq("id", jobId)
    .single();

  if (loadErr || !job) {
    logger({
      job_id: jobId,
      step: "job_not_found",
      error: loadErr?.message ?? "unknown",
    });
    return { ok: false, status: "failed", error: "job_not_found" };
  }

  // Idempotence par statut.
  if (job.status === "completed" || job.status === "failed") {
    logger({ job_id: jobId, step: "idempotent_skip", existing_status: job.status });
    return {
      ok: true,
      skipped: true,
      status: job.status as "completed" | "failed",
    };
  }
  if (job.status === "running") {
    logger({ job_id: jobId, step: "idempotent_defer", existing_status: job.status });
    return { ok: true, deferred: true, status: "running" };
  }

  // status === "queued" → on prend la main.
  await patchJob(admin, jobId, { status: "running" }, logger);

  // Validation du payload JSONB (cast typé explicite).
  const rawPayload = (job.payload ?? {}) as Partial<BulkImportPayload>;
  if (
    !rawPayload ||
    !Array.isArray(rawPayload.learners) ||
    !rawPayload.entitySlug ||
    (rawPayload.entitySlug !== "mr-formation" &&
      rawPayload.entitySlug !== "c3v-formation")
  ) {
    const msg = "Payload invalide: learners[] et entitySlug requis";
    logger({ job_id: jobId, step: "payload_invalid", error: msg });
    await patchJob(
      admin,
      jobId,
      { status: "failed", error_message: msg },
      logger,
    );
    return { ok: false, status: "failed", error: msg };
  }

  const payload: BulkImportPayload = {
    learners: rawPayload.learners,
    entitySlug: rawPayload.entitySlug,
  };

  try {
    // Boucle de création + enrollment (helper testable).
    const loopStartedAt = Date.now();
    logger({ job_id: jobId, step: "loop_start", learners_total: payload.learners.length });
    const { results, pdfRows } = await runBulkImportLearnerLoop({
      admin,
      entityId: job.entity_id,
      sessionId: job.session_id,
      payload,
      jobId,
      logger,
    });
    logger({
      job_id: jobId,
      step: "loop_done",
      duration_ms: Date.now() - loopStartedAt,
      created_count: results.created_count,
      enrolled_count: results.enrolled_count,
      error_count: results.error_count,
    });

    // PDF credentials (uniquement si au moins 1 succès). Passwords RAM only.
    let pdfPath: string | null = null;
    let pdfSignedUrl: string | null = null;
    let pdfSignedUrlExpiresAt: string | null = null;

    if (pdfRows.length > 0) {
      const pdfStartedAt = Date.now();
      try {
        const [{ data: entityRow }, { data: sessionRow }] = await Promise.all([
          admin
            .from("entities")
            .select("name, slug")
            .eq("id", job.entity_id)
            .maybeSingle(),
          admin
            .from("sessions")
            .select("id, trainings(title)")
            .eq("id", job.session_id)
            .maybeSingle(),
        ]);

        const sessionTitle =
          (sessionRow as { trainings: { title: string } | null } | null)
            ?.trainings?.title ?? "Session";
        const entityName =
          (entityRow as { name: string } | null)?.name ?? payload.entitySlug;
        const loginUrl =
          (process.env.NEXT_PUBLIC_APP_URL || process.env.URL || "")
            .trim()
            .replace(/\/$/, "") || "https://app.lms";

        const pdfBlob = await generateLearnerCredentialsPDF({
          entityName,
          entitySlug: payload.entitySlug as LearnerCredentialsEntitySlug,
          sessionTitle,
          loginUrl: `${loginUrl}/login`,
          generatedAt: new Date(),
          rows: pdfRows,
        });

        const uploaded = await uploadLearnerCredentialsPDF(admin, {
          entityId: job.entity_id,
          sessionId: job.session_id,
          pdfBlob,
        });

        if (uploaded) {
          pdfPath = uploaded.path;
          pdfSignedUrl = uploaded.signedUrl;
          pdfSignedUrlExpiresAt = new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString();
        }

        logger({
          job_id: jobId,
          step: "pdf_generated",
          uploaded: Boolean(uploaded),
          duration_ms: Date.now() - pdfStartedAt,
          rows_count: pdfRows.length,
        });
      } catch (pdfErr) {
        const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
        logger({
          job_id: jobId,
          step: "pdf_failed",
          level: "warn",
          error: msg,
          duration_ms: Date.now() - pdfStartedAt,
        });
        // Non bloquant : le job reste completed sans signed URL.
      }
    }

    // Finalisation.
    const finalStatus = decideFinalStatus(results);
    const aggregatedError = buildAggregatedErrorMessage(results);

    await patchJob(
      admin,
      jobId,
      {
        status: finalStatus,
        results: results as unknown as Record<string, unknown>,
        pdf_path: pdfPath,
        pdf_signed_url: pdfSignedUrl,
        pdf_signed_url_expires_at: pdfSignedUrlExpiresAt,
        error_message: aggregatedError,
      },
      logger,
    );

    logger({
      job_id: jobId,
      step: finalStatus,
      duration_ms_total: Date.now() - startedAt,
      created_count: results.created_count,
      error_count: results.error_count,
    });

    return {
      ok: true,
      status: finalStatus,
      createdCount: results.created_count,
      errorCount: results.error_count,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger({
      job_id: jobId,
      step: "fatal",
      level: "error",
      error: message,
      duration_ms_total: Date.now() - startedAt,
    });
    await patchJob(
      admin,
      jobId,
      { status: "failed", error_message: message },
      logger,
    );
    return { ok: false, status: "failed", error: message };
  }
}
