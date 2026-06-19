/**
 * POST /api/trainers/batch-create-credentials
 *
 * Crée des accès plateforme en masse pour des formateurs.
 * Calque le flow apprenant (/api/learners/batch-create-credentials) mais pour le rôle `trainer`.
 *
 * Corps :
 *   - { trainer_ids: string[] }                  → cible explicite (max 100)
 *   - {} ou { scope: "active_without_access" }   → tous les formateurs de l'entité reliés à
 *                                                   ≥1 session (formation_trainers) et sans compte.
 *
 * Spécificités formateur (vs apprenant) :
 *   - login par email (pas de `username`). Formateur sans email réel (ou email en doublon) →
 *     email synthétique non-routable `<slug>.<id8>@trainer.<entity_slug>.local`.
 *   - `trainers` n'a pas de colonne temp_password : le mot de passe est renvoyé dans la réponse
 *     (affiché une fois pour distribution), pas persisté.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/require-role";
import { logAudit } from "@/lib/audit-log";
import { ensureTrainerAccount } from "@/lib/services/trainer-account";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role configuration");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}


interface TrainerLite {
  id: string;
  entity_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  profile_id: string | null;
}

interface BatchResultItem {
  trainerId: string;
  fullName: string;
  success: boolean;
  email: string | null;
  password: string | null;
  syntheticEmailUsed: boolean;
  error: string | null;
  skipped: boolean;
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const explicitIds: string[] | undefined = Array.isArray(body.trainer_ids) ? body.trainer_ids : undefined;

    if (explicitIds && explicitIds.length > 100) {
      return NextResponse.json({ error: "Maximum 100 formateurs par requête" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const entityId = auth.profile.entity_id;
    const isSuperAdmin = auth.profile.role === "super_admin";

    // Slug entité (emails synthétiques)
    const { data: entityRow } = await adminClient
      .from("entities")
      .select("slug")
      .eq("id", entityId)
      .single();
    const entitySlug = entityRow?.slug ?? "mr-formation";

    // ── Résolution des cibles ────────────────────────────────────────────
    let targets: TrainerLite[] = [];
    if (explicitIds && explicitIds.length > 0) {
      let q = adminClient
        .from("trainers")
        .select("id, entity_id, first_name, last_name, email, profile_id")
        .in("id", explicitIds);
      if (!isSuperAdmin) q = q.eq("entity_id", entityId);
      const { data, error } = await q;
      if (error) {
        return NextResponse.json({ error: "Erreur lecture formateurs", details: error.message }, { status: 500 });
      }
      targets = (data ?? []) as TrainerLite[];
    } else {
      // scope par défaut : formateurs de l'entité, sans compte, reliés à ≥1 session
      const { data: ftRows } = await adminClient
        .from("formation_trainers")
        .select("trainer_id");
      const activeIds = Array.from(new Set((ftRows ?? []).map((r) => r.trainer_id))).filter(Boolean);
      if (activeIds.length === 0) {
        return NextResponse.json({ ok: true, results: [], summary: { successCount: 0, skippedCount: 0, failureCount: 0, total: 0 } });
      }
      const { data, error } = await adminClient
        .from("trainers")
        .select("id, entity_id, first_name, last_name, email, profile_id")
        .eq("entity_id", entityId)
        .is("profile_id", null)
        .in("id", activeIds);
      if (error) {
        return NextResponse.json({ error: "Erreur lecture formateurs", details: error.message }, { status: 500 });
      }
      targets = (data ?? []) as TrainerLite[];
    }

    const results: BatchResultItem[] = [];
    const usedEmails = new Set<string>();

    for (const trainer of targets) {
      const fullName = `${trainer.first_name ?? ""} ${trainer.last_name ?? ""}`.trim() || "Formateur";
      const res = await ensureTrainerAccount(adminClient, { trainer, entitySlug, usedEmails });
      results.push({
        trainerId: trainer.id,
        fullName,
        success: res.status !== "error",
        email: res.email,
        password: res.password,
        syntheticEmailUsed: res.syntheticEmailUsed,
        error: res.error,
        skipped: res.status === "skipped",
      });
    }

    const successCount = results.filter((r) => r.success && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    const failureCount = results.filter((r) => !r.success).length;

    logAudit({
      supabase: adminClient,
      entityId,
      userId: auth.user.id,
      action: "create",
      resourceType: "trainers.batch_credentials",
      resourceId: `batch_${targets.length}`,
      details: { successCount, skippedCount, failureCount, totalRequested: targets.length },
    });

    return NextResponse.json({
      ok: true,
      results,
      summary: { successCount, skippedCount, failureCount, total: targets.length },
    });
  } catch (err) {
    console.error("[trainers/batch-create-credentials] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      { status: 500 },
    );
  }
}
