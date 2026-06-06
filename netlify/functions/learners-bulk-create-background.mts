/**
 * Pédagogie V2 Epic 2 — Story E2-S01 — Netlify Background Function
 *
 * Bulk creation d'apprenants depuis un job pré-enregistré dans
 * `learner_bulk_import_jobs`. Déclenchée par
 * POST /api/sessions/[id]/learners/bulk/start au-delà du seuil INLINE.
 *
 * Auth : Bearer `CRON_SECRET` (la route /start est la seule à appeler ici).
 *
 * Flux (AC complet) :
 *  1. AC 6 — Auth Bearer CRON_SECRET (401 si absent/invalide).
 *  2. Charge le job complet (id, entity_id, session_id, status,
 *     payload, payload_count).
 *  3. AC 2 — Idempotence :
 *       status = "completed"|"failed" → return 200 (no-op).
 *       status = "running"            → return 202 (defer, déjà en cours).
 *       status = "queued"             → UPDATE status="running".
 *  4. AC 3 — Boucle createLearnerWithCredentials par learner via
 *     runBulkImportLearnerLoop (helper testable).
 *  5. AC 4 — Si created_count > 0 : génère le PDF credentials +
 *     uploadLearnerCredentialsPDF (TTL signed URL 24h).
 *  6. AC 5 — Mots de passe RAM uniquement (pdfRows). Le results
 *     persisté en DB n'en contient AUCUN (cf. bulk-import-runner.ts).
 *  7. AC 7 — Logs JSON structurés à chaque étape (ts, job_id, step,
 *     duration_ms, ...).
 *  8. AC 8 — Mesure du temps total via duration_ms_total dans le log
 *     final.
 *
 * Pattern : aligné sur `elearning-generate-pipeline-background.mts`.
 */

import type { Config } from "@netlify/functions";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  runBulkImportLearnerLoop,
  decideFinalStatus,
  buildAggregatedErrorMessage,
  type BulkImportPayload,
  type StructuredLogger,
} from "../../src/lib/services/bulk-import-runner";
import {
  generateLearnerCredentialsPDF,
  type LearnerCredentialsEntitySlug,
} from "../../src/lib/services/learner-credentials-pdf";
import { uploadLearnerCredentialsPDF } from "../../src/lib/services/learner-credentials-storage";

type Payload = {
  jobId: string;
};

const CRON_SECRET = process.env.CRON_SECRET;
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabaseAdmin(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    throw new Error(
      "Supabase service_role non configuré (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant)",
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function updateJob(
  supabase: SupabaseClient,
  jobId: string,
  patch: Record<string, unknown>,
  logger: StructuredLogger,
): Promise<void> {
  const { error } = await supabase
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

/** Logger JSON aligné AC 7. */
function makeLogger(jobId: string): StructuredLogger {
  return (record) => {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        fn: "learners-bulk-create-background",
        job_id: jobId,
        ...record,
      }),
    );
  };
}

export default async (req: Request): Promise<Response> => {
  const startedAt = Date.now();

  // AC 6 — Auth Bearer CRON_SECRET.
  if (!CRON_SECRET) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        fn: "learners-bulk-create-background",
        step: "boot_error",
        error: "CRON_SECRET not configured",
      }),
    );
    return new Response("CRON_SECRET not configured", { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payloadRaw: Payload;
  try {
    payloadRaw = (await req.json()) as Payload;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!payloadRaw.jobId) {
    return new Response("jobId required", { status: 400 });
  }

  const { jobId } = payloadRaw;
  const logger = makeLogger(jobId);
  logger({ step: "start" });

  const supabase = supabaseAdmin();

  // Charge le job complet (incluant `payload` JSONB).
  const { data: job, error: loadErr } = await supabase
    .from("learner_bulk_import_jobs")
    .select(
      "id, entity_id, session_id, status, payload, payload_count",
    )
    .eq("id", jobId)
    .single();

  if (loadErr || !job) {
    logger({ step: "job_not_found", error: loadErr?.message ?? "unknown" });
    return new Response("Job not found", { status: 404 });
  }

  // AC 2 — Idempotence.
  if (job.status === "completed" || job.status === "failed") {
    logger({ step: "idempotent_skip", existing_status: job.status });
    return new Response(
      JSON.stringify({ ok: true, skipped: true, status: job.status }),
      { status: 200 },
    );
  }
  if (job.status === "running") {
    // Déjà en cours (rejeu Netlify) — on n'écrase pas le travail en cours.
    logger({ step: "idempotent_defer", existing_status: job.status });
    return new Response(
      JSON.stringify({ ok: true, deferred: true, status: job.status }),
      { status: 202 },
    );
  }

  // status === "queued" → on prend la main.
  await updateJob(supabase, jobId, { status: "running" }, logger);

  // Valide la forme du payload (typed cast explicite — JSONB).
  const payload = (job.payload ?? {}) as Partial<BulkImportPayload>;
  if (
    !payload ||
    !Array.isArray(payload.learners) ||
    !payload.entitySlug ||
    (payload.entitySlug !== "mr-formation" &&
      payload.entitySlug !== "c3v-formation")
  ) {
    const msg = "Payload invalide: learners[] et entitySlug requis";
    logger({ step: "payload_invalid", error: msg });
    await updateJob(
      supabase,
      jobId,
      { status: "failed", error_message: msg },
      logger,
    );
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400,
    });
  }

  const validPayload: BulkImportPayload = {
    learners: payload.learners,
    entitySlug: payload.entitySlug,
  };

  try {
    // AC 3 — Boucle de création (via helper testable).
    const loopStartedAt = Date.now();
    logger({
      step: "loop_start",
      learners_total: validPayload.learners.length,
    });
    const { results, pdfRows } = await runBulkImportLearnerLoop({
      admin: supabase,
      entityId: job.entity_id,
      sessionId: job.session_id,
      payload: validPayload,
      jobId,
      logger,
    });
    logger({
      step: "loop_done",
      duration_ms: Date.now() - loopStartedAt,
      created_count: results.created_count,
      enrolled_count: results.enrolled_count,
      error_count: results.error_count,
    });

    // AC 4 — PDF credentials (uniquement si au moins 1 succès).
    let pdfPath: string | null = null;
    let pdfSignedUrl: string | null = null;
    let pdfSignedUrlExpiresAt: string | null = null;

    if (pdfRows.length > 0) {
      const pdfStartedAt = Date.now();
      try {
        // Charge nom + session title pour le PDF.
        const [{ data: entityRow }, { data: sessionRow }] = await Promise.all([
          supabase
            .from("entities")
            .select("name, slug")
            .eq("id", job.entity_id)
            .maybeSingle(),
          supabase
            .from("sessions")
            .select("id, trainings(title)")
            .eq("id", job.session_id)
            .maybeSingle(),
        ]);

        const sessionTitle =
          (sessionRow as
            | { trainings: { title: string } | null }
            | null)?.trainings?.title ?? "Session";
        const entityName = entityRow?.name ?? validPayload.entitySlug;
        const loginUrl =
          (process.env.NEXT_PUBLIC_APP_URL || process.env.URL || "")
            .trim()
            .replace(/\/$/, "") || "https://app.lms";

        const pdfBlob = await generateLearnerCredentialsPDF({
          entityName,
          entitySlug: validPayload.entitySlug as LearnerCredentialsEntitySlug,
          sessionTitle,
          loginUrl: `${loginUrl}/login`,
          generatedAt: new Date(),
          rows: pdfRows,
        });

        const uploaded = await uploadLearnerCredentialsPDF(supabase, {
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
          step: "pdf_generated",
          uploaded: Boolean(uploaded),
          duration_ms: Date.now() - pdfStartedAt,
          rows_count: pdfRows.length,
        });
      } catch (pdfErr) {
        const msg =
          pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
        logger({
          step: "pdf_failed",
          level: "warn",
          error: msg,
          duration_ms: Date.now() - pdfStartedAt,
        });
        // Non bloquant : on continue, le job sera completed sans signed URL.
      }
    }

    // AC 2/3 — Finalisation.
    const finalStatus = decideFinalStatus(results);
    const aggregatedError = buildAggregatedErrorMessage(results);

    await updateJob(
      supabase,
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

    // AC 8 — Log final avec durée totale.
    logger({
      step: finalStatus,
      duration_ms_total: Date.now() - startedAt,
      created_count: results.created_count,
      error_count: results.error_count,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        job_id: jobId,
        status: finalStatus,
        created_count: results.created_count,
        error_count: results.error_count,
      }),
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger({
      step: "fatal",
      level: "error",
      error: message,
      duration_ms_total: Date.now() - startedAt,
    });
    await updateJob(
      supabase,
      jobId,
      {
        status: "failed",
        error_message: message,
      },
      logger,
    );
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
    });
  }
};

export const config: Config = {
  // Pas de schedule — déclenchée à la demande par /api/sessions/[id]/learners/bulk/start
};
