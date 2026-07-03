/**
 * Pédagogie V2 Epic 2 — Story E2-S01 — Netlify Background Function
 *
 * Bulk creation d'apprenants depuis un job pré-enregistré dans
 * `learner_bulk_import_jobs`. Déclenchée par
 * POST /api/sessions/[id]/learners/bulk/start au-delà du seuil INLINE.
 *
 * Auth : Bearer `CRON_SECRET` (la route /start est la seule à appeler ici).
 *
 * ⚠️ DUAL-MODE : tout le harnais métier (chargement job, idempotence par
 * statut, boucle de création, PDF credentials, écriture statut final) vit
 * désormais dans `runBulkLearnerJob` (src/lib/services/bulk-import-runner.ts).
 * Cette Background Function n'est plus qu'un WRAPPER HTTP mince autour de ce
 * helper, afin d'éviter deux implémentations divergentes : sur Railway la route
 * /start appelle DIRECTEMENT `runBulkLearnerJob` en fire-and-forget in-process.
 */

import type { Config } from "@netlify/functions";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runBulkLearnerJob } from "../../src/lib/services/bulk-import-runner";

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

export default async (req: Request): Promise<Response> => {
  // Auth Bearer CRON_SECRET.
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

  // Logger JSON structuré (aligné AC 7 : ts, fn, job_id, step, ...).
  const logger = (record: Record<string, unknown>): void => {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        fn: "learners-bulk-create-background",
        job_id: jobId,
        ...record,
      }),
    );
  };

  const supabase = supabaseAdmin();

  // Toute la logique (idempotence, boucle, PDF, statut final) est déléguée au
  // helper partagé — même implémentation que le chemin Railway in-process.
  const outcome = await runBulkLearnerJob({ admin: supabase, jobId, logger });

  if (!outcome.ok) {
    // job_not_found → 404 ; payload invalide / erreur fatale → 500.
    const status = outcome.error === "job_not_found" ? 404 : 500;
    return new Response(
      JSON.stringify({ ok: false, error: outcome.error ?? "unknown" }),
      { status },
    );
  }
  if (outcome.skipped) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, status: outcome.status }),
      { status: 200 },
    );
  }
  if (outcome.deferred) {
    return new Response(
      JSON.stringify({ ok: true, deferred: true, status: outcome.status }),
      { status: 202 },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      job_id: jobId,
      status: outcome.status,
      created_count: outcome.createdCount ?? 0,
      error_count: outcome.errorCount ?? 0,
    }),
    { status: 200 },
  );
};

export const config: Config = {
  // Pas de schedule — déclenchée à la demande par /api/sessions/[id]/learners/bulk/start
};
