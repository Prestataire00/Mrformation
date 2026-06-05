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
 *  8. Si N ≤ 50 : boucle inline createLearnerWithCredentials + enrollments
 *     + génération PDF + upload Storage → job marqué completed
 *  9. Si N > 50 : fire-and-forget vers la Netlify Background Function
 *     `learners-bulk-create-background.mts`
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
 *  - PROD-C1 : seuil 50 inline / async pour ne pas frapper le timeout
 *    Netlify de 26s
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
  learners: z.array(LearnerInputSchema).min(1).max(200),
  idempotencyKey: z.string().min(8).max(80),
  /**
   * Slug entité visé (mr-formation | c3v-formation). Sert à fabriquer
   * un email synthétique si l'apprenant n'a pas d'email réel, et à colorer
   * le PDF de credentials. Validé contre l'entité active.
   */
  entitySlug: z.enum(["mr-formation", "c3v-formation"]),
});

// Seuil au-delà duquel on délègue à la Background Function.
// Seuil sync inline. Au-delà, la Background Function devrait prendre le relais.
// Or la BG function V1 est un STUB qui marque silently completed sans rien créer
// (cf. Production Review C1) — on bloque donc explicitement les imports > seuil
// avec une 400 jusqu'à ce que la BG soit complète (V1.1). Le seuil 20 garde
// une marge confortable sous le timeout Netlify Pro (~26s pour 20 × ~1s/learner).
const INLINE_THRESHOLD = 20;
const BG_NOT_READY_V1 = true;

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
    const { data: jobRow, error: jobErr } = await admin
      .from("learner_bulk_import_jobs")
      .insert({
        entity_id: activeEntityId,
        session_id: sessionId,
        created_by: profile.id,
        idempotency_key: body.idempotencyKey,
        status: "queued",
        payload_count: body.learners.length,
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
    //
    // V1 : la Background Function est un STUB (silently completed sans rien
    // créer). Pour éviter la perte silencieuse de données, on bloque
    // explicitement les imports au-delà du seuil avec une 400.
    // À retirer en V1.1 quand la BG sera complète.
    if (body.learners.length > INLINE_THRESHOLD) {
      if (BG_NOT_READY_V1) {
        // Marque le job en failed pour traçabilité audit.
        await admin
          .from("learner_bulk_import_jobs")
          .update({
            status: "failed",
            error_message: `bulk_too_large_v1: max ${INLINE_THRESHOLD} learners per request, got ${body.learners.length}`,
          })
          .eq("id", jobId);
        return NextResponse.json(
          {
            error: `Pour cette V1, l'import en bulk est limité à ${INLINE_THRESHOLD} apprenants par requête. Veuillez splitter votre liste (la prochaine version supportera des imports plus larges via Background Function).`,
            code: "bulk_too_large_v1",
            maxLearners: INLINE_THRESHOLD,
            attempted: body.learners.length,
            jobId,
          },
          { status: 400 },
        );
      }
      return await dispatchToBackground(jobId);
    }

    // 8.a Inline (≤ 50 apprenants).
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
 * Fire-and-forget : déclenche la Netlify Background Function en repassant
 * `Bearer CRON_SECRET`. La BG function répond 202 immédiatement.
 *
 * On retourne tout de suite `queued` côté UI ; le client polera ensuite
 * GET /api/sessions/[id]/learners/bulk/status pour suivre la progression.
 */
async function dispatchToBackground(jobId: string): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré (background dispatch impossible)" },
      { status: 500 },
    );
  }
  const baseUrl = process.env.URL || "http://localhost:8888";
  const bgUrl = `${baseUrl}/.netlify/functions/learners-bulk-create-background`;
  try {
    // Pas de await long : on émet et on rend la main au client.
    fetch(bgUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobId }),
    }).catch((e) => {
      console.error("[bulk/start] BG fetch failed (non-blocking):", e);
    });
  } catch (e) {
    console.error("[bulk/start] BG dispatch threw (non-blocking):", e);
  }
  return NextResponse.json({
    ok: true,
    jobId,
    status: "queued",
    pollUrl: `/api/sessions/_/learners/bulk/status?jobId=${jobId}`,
  });
}
