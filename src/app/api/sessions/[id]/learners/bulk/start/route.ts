/**
 * Pédagogie V2 Epic 2.5 — TASK 10
 * POST /api/sessions/[id]/learners/bulk/start
 *
 * Lance un bulk import d'apprenants pour une session donnée.
 *
 * Flux :
 *  1. requireRole admin/super_admin (auth session)
 *  2. isCsrfMismatch (vérification Origin/Referer vs NEXT_PUBLIC_APP_URL)
 *  3. Valide le body Zod (learners[], idempotencyKey, entitySlug)
 *  4. Résout l'entity_id active via resolveActiveEntityId (cross-entity
 *     super_admin)
 *  5. Vérifie la session appartient bien à cette entité
 *  6. Replay-protection : si un job existe déjà pour
 *     (entity_id, idempotency_key) → retourne ce job-là
 *  7. INSERT job (status=queued, payload_count=N)
 *  8. Si N ≤ INLINE_THRESHOLD (20) : boucle inline createLearnerWithCredentials
 *     + enrollments + génération PDF + upload Storage → job marqué completed
 *  9. Si INLINE_THRESHOLD < N ≤ BG_MAX (100) : fire-and-forget vers la
 *     Netlify Background Function `learners-bulk-create-background.mts`
 * 10. Si N > BG_MAX : 400 "Volume > 100, contacter support"
 *
 * NB AUTO-ENROLL E-LEARNING (Epic 3.5) :
 *   La création INSERT enrollments est faite ici, MAIS le câblage
 *   d'auto-enrollment e-learning (trigger sur enrollment → ajout dans les
 *   cours e-learning du programme) n'est PAS branché dans cette route.
 *   Cf. concerns en fin de PR.
 *
 * Sécurité :
 *  - SEC-3 : temp_password JAMAIS persisté en DB (uniquement dans le PDF
 *    + retour inline). results JSONB ne contient PAS les passwords.
 *  - SEC-7 : Origin-check via isCsrfMismatch
 *  - SEC-10 : resolveActiveEntityId pour super_admin cross-entity
 *  - PROD-C1 : seuil 20 inline / 100 max async pour ne pas frapper le
 *    timeout Netlify de 26s
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { isCsrfMismatch } from "@/lib/auth/csrf-check";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLearnerWithCredentials } from "@/lib/services/learner-account";
import {
  generateLearnerCredentialsPDF,
  type LearnerCredentialsEntitySlug,
  type LearnerCredentialsRow,
} from "@/lib/services/learner-credentials-pdf";
import { uploadLearnerCredentialsPDF } from "@/lib/services/learner-credentials-storage";
import { runBulkLearnerJob } from "@/lib/services/bulk-import-runner";
import { isRailway } from "@/lib/platform";
import { sanitizeError } from "@/lib/api-error";

export const maxDuration = 30;

// ──────────────────────────────────────────────────────────────────────
// Schémas Zod
// ──────────────────────────────────────────────────────────────────────

const LearnerInputSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().email().max(160).optional().nullable(),
  /** Optionnel : entreprise cliente rattachée (INTER multi-entreprises). */
  clientId: z.string().uuid().optional().nullable(),
});

const BodySchema = z.object({
  learners: z.array(LearnerInputSchema).min(1).max(100),
  idempotencyKey: z.string().min(8).max(80),
  /**
   * Slug entité visé (mr-formation | c3v-formation). Sert à fabriquer
   * un email synthétique si l'apprenant n'a pas d'email réel, et à colorer
   * le PDF de credentials. Validé contre l'entité active.
   */
  entitySlug: z.enum(["mr-formation", "c3v-formation"]),
});

// Seuil au-delà duquel on délègue à la Background Function Netlify.
// ≤ INLINE_THRESHOLD : traitement synchrone dans cette route.
// INLINE_THRESHOLD < N ≤ BG_MAX : dispatch vers BG function (fire-and-forget).
// N > BG_MAX : rejeté avec 400.
const INLINE_THRESHOLD = 20;
const BG_MAX = 100;

// ──────────────────────────────────────────────────────────────────────
// Types résultats job (sans passwords — SEC-9)
// ──────────────────────────────────────────────────────────────────────

interface JobLearnerResult {
  learnerId: string | null;
  fullName: string;
  username: string | null;
  email: string | null;
  syntheticEmailUsed: boolean;
  enrolled: boolean;
  isError: boolean;
  errorMessage: string | null;
}

interface JobResults {
  created_count: number;
  enrolled_count: number;
  error_count: number;
  learners: JobLearnerResult[];
}

// ──────────────────────────────────────────────────────────────────────
// Route
// ──────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // 1. CSRF check (avant auth pour court-circuiter rapidement).
    if (isCsrfMismatch(request)) {
      return NextResponse.json(
        { error: "csrf_mismatch" },
        { status: 403 },
      );
    }

    // 2. Auth role.
    const auth = await requireRole(["admin", "super_admin"]);
    if (auth.error) return auth.error;
    const { profile } = auth;

    // 3. Validation body.
    const rawBody = (await request.json().catch(() => null)) as unknown;
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const sessionId = params.id;

    // 4. Résolution entity active (super_admin cross-entity safe).
    const activeEntityId = resolveActiveEntityId(profile);

    // 5. Validation : la session appartient bien à l'entité active.
    //    On utilise un client admin (bypass RLS) pour pouvoir lire la
    //    session indépendamment du profil — la garde est faite manuellement.
    const admin = createAdminClient();
    const { data: sessionRow, error: sessionErr } = await admin
      .from("sessions")
      .select("id, entity_id, training_id, trainings!inner(title)")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr || !sessionRow) {
      return NextResponse.json(
        { error: "session_not_found" },
        { status: 404 },
      );
    }
    if (sessionRow.entity_id !== activeEntityId) {
      return NextResponse.json(
        { error: "session_not_in_active_entity" },
        { status: 403 },
      );
    }

    // Slug entité vs entity_id : on valide que le slug du body matche bien
    // l'entité active (pour éviter qu'un payload mal formé mélange MR/C3V).
    const { data: entityRow } = await admin
      .from("entities")
      .select("id, name, slug")
      .eq("id", activeEntityId)
      .maybeSingle();
    if (!entityRow || entityRow.slug !== body.entitySlug) {
      return NextResponse.json(
        { error: "entity_slug_mismatch" },
        { status: 400 },
      );
    }

    // 6. Replay-protection idempotency. Si un job existe déjà pour
    //    (entity_id, idempotency_key), on retourne ce job tel quel.
    const { data: existingJob } = await admin
      .from("learner_bulk_import_jobs")
      .select(
        "id, status, results, pdf_path, pdf_signed_url, pdf_signed_url_expires_at, payload_count, error_message",
      )
      .eq("entity_id", activeEntityId)
      .eq("idempotency_key", body.idempotencyKey)
      .maybeSingle();

    if (existingJob) {
      return NextResponse.json({
        ok: true,
        replayed: true,
        jobId: existingJob.id,
        status: existingJob.status,
        results: existingJob.results,
        pdfSignedUrl: existingJob.pdf_signed_url,
      });
    }

    // 7. INSERT job (status=queued).
    //
    // E2-S01 : on persiste `payload` (learners[] + entitySlug) pour que la
    // Background Function puisse charger les apprenants à traiter sans
    // dépendre de la RAM de cette route (fire-and-forget). Le payload ne
    // contient AUCUN mot de passe (générés à la volée côté BG function).
    const { data: jobRow, error: jobErr } = await admin
      .from("learner_bulk_import_jobs")
      .insert({
        entity_id: activeEntityId,
        session_id: sessionId,
        created_by: profile.id,
        idempotency_key: body.idempotencyKey,
        status: "queued",
        payload_count: body.learners.length,
        payload: {
          learners: body.learners,
          entitySlug: body.entitySlug,
        },
        results: {},
      })
      .select("id")
      .single();

    if (jobErr || !jobRow) {
      // Cas race : un autre POST a inséré pile avant nous → ré-essayer le SELECT.
      if ((jobErr as { code?: string } | null)?.code === "23505") {
        const { data: raced } = await admin
          .from("learner_bulk_import_jobs")
          .select("id, status, results, pdf_signed_url")
          .eq("entity_id", activeEntityId)
          .eq("idempotency_key", body.idempotencyKey)
          .maybeSingle();
        if (raced) {
          return NextResponse.json({
            ok: true,
            replayed: true,
            jobId: raced.id,
            status: raced.status,
            results: raced.results,
            pdfSignedUrl: raced.pdf_signed_url,
          });
        }
      }
      return NextResponse.json(
        { error: `Impossible de créer le job: ${jobErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    const jobId = jobRow.id;

    // 8. Routage sync / async selon le seuil.
    const N = body.learners.length;

    // 8.0 N > BG_MAX → rejet immédiat.
    if (N > BG_MAX) {
      await admin
        .from("learner_bulk_import_jobs")
        .update({
          status: "failed",
          error_message: `bulk_exceeds_max: max ${BG_MAX} learners, got ${N}`,
        })
        .eq("id", jobId);
      return NextResponse.json(
        {
          error: `Volume trop important (${N} apprenants). Maximum autorisé : ${BG_MAX}. Contactez le support pour un import en masse.`,
          code: "bulk_exceeds_max",
          maxLearners: BG_MAX,
          attempted: N,
          jobId,
        },
        { status: 400 },
      );
    }

    // 8.1 INLINE_THRESHOLD < N ≤ BG_MAX → dispatch vers BG function.
    if (N > INLINE_THRESHOLD) {
      return await dispatchToBackground(jobId);
    }

    // 8.2 N ≤ INLINE_THRESHOLD → traitement inline synchrone.
    await admin
      .from("learner_bulk_import_jobs")
      .update({ status: "running" })
      .eq("id", jobId);

    const results: JobResults = {
      created_count: 0,
      enrolled_count: 0,
      error_count: 0,
      learners: [],
    };

    // Rows pour PDF (passwords stockés en RAM, jamais persistés en DB).
    const pdfRows: LearnerCredentialsRow[] = [];

    for (const learnerInput of body.learners) {
      const fullName = `${learnerInput.firstName} ${learnerInput.lastName}`.trim();
      try {
        const created = await createLearnerWithCredentials(admin, {
          entityId: activeEntityId,
          entitySlug: body.entitySlug,
          firstName: learnerInput.firstName,
          lastName: learnerInput.lastName,
          email: learnerInput.email ?? null,
          clientId: learnerInput.clientId ?? null,
        });

        // INSERT enrollment immédiat.
        // NB : on NE câble PAS l'auto-enroll e-learning (Epic 3.5) ici.
        const { error: enrollErr } = await admin.from("enrollments").insert({
          session_id: sessionId,
          learner_id: created.learnerId,
          client_id: learnerInput.clientId ?? null,
          status: "registered",
        });

        results.created_count += 1;
        if (!enrollErr) results.enrolled_count += 1;

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

        pdfRows.push({
          fullName,
          identifier: created.username,
          password: created.tempPassword,
          isSynthetic: created.syntheticEmailUsed,
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
      }
    }

    // 8.b Génération PDF + upload Storage (si au moins 1 row créé).
    let pdfPath: string | null = null;
    let pdfSignedUrl: string | null = null;
    let pdfSignedUrlExpiresAt: string | null = null;

    if (pdfRows.length > 0) {
      try {
        const sessionTitle =
          (sessionRow as unknown as { trainings: { title: string } | null })
            .trainings?.title ?? "Session";

        const loginUrl =
          process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
          "https://app.lms";

        const pdfBlob = await generateLearnerCredentialsPDF({
          entityName: entityRow.name,
          entitySlug: body.entitySlug as LearnerCredentialsEntitySlug,
          sessionTitle,
          loginUrl: `${loginUrl}/login`,
          generatedAt: new Date(),
          rows: pdfRows,
        });

        const uploaded = await uploadLearnerCredentialsPDF(admin, {
          entityId: activeEntityId,
          sessionId,
          pdfBlob,
        });

        if (uploaded) {
          pdfPath = uploaded.path;
          pdfSignedUrl = uploaded.signedUrl;
          // TTL 24h côté helper.
          pdfSignedUrlExpiresAt = new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString();
        }
      } catch (pdfErr) {
        console.error("[bulk/start] PDF generation/upload failed:", pdfErr);
        // Non bloquant : le job reste completed avec les learners créés,
        // mais sans signed URL. L'admin pourra régénérer via une route
        // dédiée (TASK 16, hors scope direct).
      }
    }

    // 8.c Finalisation job.
    await admin
      .from("learner_bulk_import_jobs")
      .update({
        status: results.error_count > 0 && results.created_count === 0
          ? "failed"
          : "completed",
        results: results as unknown as Record<string, unknown>,
        pdf_path: pdfPath,
        pdf_signed_url: pdfSignedUrl,
        pdf_signed_url_expires_at: pdfSignedUrlExpiresAt,
        error_message:
          results.created_count === 0 && results.error_count > 0
            ? "Tous les apprenants ont échoué (voir results.learners[].errorMessage)"
            : null,
      })
      .eq("id", jobId);

    return NextResponse.json({
      ok: true,
      jobId,
      status:
        results.error_count > 0 && results.created_count === 0
          ? "failed"
          : "completed",
      results,
      pdfSignedUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "POST /api/sessions/[id]/learners/bulk/start") },
      { status: 500 },
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

/**
 * Déclenche le traitement asynchrone du job (DUAL-MODE Netlify / Railway).
 *
 * On retourne immédiatement `queued` côté UI ; le client polera ensuite
 * GET /api/sessions/[id]/learners/bulk/status pour suivre la progression.
 *
 * - Railway (conteneur long-lived) : fire-and-forget IN-PROCESS via
 *   `runBulkLearnerJob`. Pas de timeout serverless → on n'`await` PAS le
 *   runner ; il écrit lui-même sa progression/statut final en DB. En cas
 *   d'exception non capturée, on marque le job `failed` (défense en profondeur,
 *   le runner gère déjà ses erreurs en interne).
 * - Netlify (inchangé) : dispatch vers la Background Function via
 *   `Bearer CRON_SECRET`. Si le fetch échoue, le job reste 'queued' et on
 *   retourne 200 avec un champ `error` pour que l'UI puisse informer l'admin.
 */
async function dispatchToBackground(jobId: string): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;

  // ── Railway : fire-and-forget in-process ──
  if (isRailway()) {
    const admin = createAdminClient();
    // On NE fait PAS `await` : la route répond tout de suite (queued), le
    // runner poursuit en tâche de fond dans le conteneur.
    void runBulkLearnerJob({ admin, jobId }).catch(async (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[bulk/start] runBulkLearnerJob (railway) failed:", msg);
      // Filet de sécurité : le runner écrit déjà `failed` en interne, mais si
      // l'exception survient hors de son try/catch on force l'état ici.
      await admin
        .from("learner_bulk_import_jobs")
        .update({ status: "failed", error_message: msg })
        .eq("id", jobId);
    });

    return NextResponse.json({
      ok: true,
      jobId,
      status: "queued",
      pollUrl: `/api/sessions/_/learners/bulk/status?jobId=${jobId}`,
    });
  }

  // ── Netlify : dispatch vers la Background Function (inchangé) ──
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré (background dispatch impossible)" },
      { status: 500 },
    );
  }
  const baseUrl = process.env.URL || "http://localhost:8888";
  const bgUrl = `${baseUrl}/.netlify/functions/learners-bulk-create-background`;

  let dispatchFailed = false;
  try {
    const bgRes = await fetch(bgUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobId }),
    });
    if (!bgRes.ok) {
      console.error(`[bulk/start] BG dispatch HTTP ${bgRes.status}`);
      dispatchFailed = true;
    }
  } catch (e) {
    console.error("[bulk/start] BG dispatch failed:", e);
    dispatchFailed = true;
  }

  // Job reste 'queued' dans tous les cas — la BG function ou un retry
  // pourra le reprendre.
  return NextResponse.json({
    ok: true,
    jobId,
    status: "queued",
    pollUrl: `/api/sessions/_/learners/bulk/status?jobId=${jobId}`,
    ...(dispatchFailed && {
      error: "BG dispatch failed, job remains queued for retry",
    }),
  });
}
