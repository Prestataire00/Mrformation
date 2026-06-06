/**
 * Pédagogie V2 Epic 2 — Story E2-S04
 * GET /api/sessions/[id]/learners/bulk/status?jobId=<uuid>
 *
 * Renvoie l'état courant d'un job d'import bulk lancé via POST
 * /api/sessions/[id]/learners/bulk/start. Le client front polle cet endpoint
 * toutes les 2-3s pour suivre la progression.
 *
 * Sécurité :
 *  - requireRole admin/super_admin (auth session)
 *  - super_admin : entité active résolue via cookie (cross-entity safe)
 *  - 404 (PAS 403) si le job n'existe pas OU appartient à une autre entité
 *    → anti-énumération : ne révèle pas l'existence du job à un user d'une
 *      autre entité (même cohérence pour mismatch session_id de l'URL).
 *  - PAS d'exposition de `payload` (peut contenir des données learners pré-création)
 *    ni de `created_by` (PII admin).
 *
 * Réponse (200) :
 *   {
 *     ok: true,
 *     job: {
 *       id,
 *       status,
 *       payload_count,
 *       results,                  // JobResults | null
 *       pdf_signed_url,
 *       pdf_signed_url_expires_at,
 *       error_message,
 *       created_at,
 *       updated_at
 *     }
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeError } from "@/lib/api-error";

const QuerySchema = z.object({
  jobId: z.string().uuid(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireRole(["admin", "super_admin"]);
    if (auth.error) return auth.error;
    const { profile } = auth;

    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      jobId: url.searchParams.get("jobId"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "missing_or_invalid_job_id" },
        { status: 400 },
      );
    }
    const { jobId } = parsed.data;
    const sessionId = params.id;

    const activeEntityId = resolveActiveEntityId(profile);

    const admin = createAdminClient();
    const { data: job, error } = await admin
      .from("learner_bulk_import_jobs")
      .select(
        // Whitelist explicite : EXCLUT `payload` (données learners avant création)
        // et `created_by` (PII admin). On garde `entity_id` et `session_id` pour
        // les gardes d'isolement ci-dessous, mais on ne les renvoie pas au client.
        "id, entity_id, session_id, status, payload_count, results, pdf_signed_url, pdf_signed_url_expires_at, error_message, created_at, updated_at",
      )
      .eq("id", jobId)
      .maybeSingle();

    // Anti-énumération : même réponse 404 si le job n'existe pas, s'il
    // appartient à une autre entité, ou s'il appartient à une autre session.
    // → empêche un admin de l'entité B de découvrir l'existence d'un job de
    //   l'entité A en se basant sur un code HTTP différent (404 vs 403).
    if (
      error ||
      !job ||
      job.entity_id !== activeEntityId ||
      job.session_id !== sessionId
    ) {
      return NextResponse.json(
        { error: "job_not_found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      job: {
        id: job.id,
        status: job.status,
        payload_count: job.payload_count,
        results: job.results,
        pdf_signed_url: job.pdf_signed_url,
        pdf_signed_url_expires_at: job.pdf_signed_url_expires_at,
        error_message: job.error_message,
        created_at: job.created_at,
        updated_at: job.updated_at,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: sanitizeError(
          err,
          "GET /api/sessions/[id]/learners/bulk/status",
        ),
      },
      { status: 500 },
    );
  }
}
