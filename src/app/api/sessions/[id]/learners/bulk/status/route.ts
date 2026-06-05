/**
 * Pédagogie V2 Epic 2.5 — TASK 10
 * GET /api/sessions/[id]/learners/bulk/status?jobId=<uuid>
 *
 * Renvoie l'état courant d'un job d'import bulk lancé via POST
 * /api/sessions/[id]/learners/bulk/start. Le client front polle cet endpoint
 * toutes les 2-3s pour suivre la progression.
 *
 * Sécurité :
 *  - requireRole admin/super_admin (auth session)
 *  - vérifie que le job appartient bien à l'entité active (super_admin OK
 *    cross-entity via resolveActiveEntityId)
 *  - vérifie que le job appartient bien à la session demandée (cohérence URL)
 *
 * Réponse :
 *   {
 *     ok: true,
 *     jobId, status, payloadCount,
 *     results: JobResults | null,
 *     pdfSignedUrl, pdfSignedUrlExpiresAt,
 *     errorMessage, createdAt, updatedAt
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
    const parsed = QuerySchema.safeParse({ jobId: url.searchParams.get("jobId") });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_query", details: parsed.error.flatten() },
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
        "id, entity_id, session_id, status, payload_count, results, pdf_path, pdf_signed_url, pdf_signed_url_expires_at, error_message, created_at, updated_at",
      )
      .eq("id", jobId)
      .maybeSingle();

    if (error || !job) {
      return NextResponse.json(
        { error: "job_not_found" },
        { status: 404 },
      );
    }

    // Garde multi-tenant : refuse si l'entité du job diffère.
    if (job.entity_id !== activeEntityId) {
      return NextResponse.json(
        { error: "job_not_in_active_entity" },
        { status: 403 },
      );
    }

    // Garde URL : refuse si le sessionId de l'URL ne matche pas.
    if (job.session_id !== sessionId) {
      return NextResponse.json(
        { error: "job_not_for_session" },
        { status: 403 },
      );
    }

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      status: job.status,
      payloadCount: job.payload_count,
      results: job.results,
      pdfSignedUrl: job.pdf_signed_url,
      pdfSignedUrlExpiresAt: job.pdf_signed_url_expires_at,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "GET /api/sessions/[id]/learners/bulk/status") },
      { status: 500 },
    );
  }
}
