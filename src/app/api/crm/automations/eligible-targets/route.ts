import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Story aut-a-6 — POST /api/crm/automations/eligible-targets
 *
 * Utilisé par le <CrmRuleWizard> étape 5 (B.1/C.1) pour afficher le nombre
 * de cibles éligibles + sample (top 5) AVANT création de la règle.
 *
 * Body input : { trigger_type: string, conditions?: object }
 *   - trigger_type requis (V1 supporte : prospect_inactive_30d,
 *     quote_expiring_3d, task_overdue_3d)
 *   - conditions : filtre optionnel (V1 ignoré, prévu pour V2)
 *
 * Body output : { trigger_type, count, sample: [{ id, name }] }
 *
 * Auth : admin/super_admin (la rule n'existe pas encore en DB).
 * NFR-AUT-SEC-5 : 0 effet de bord, pure SELECT.
 * NFR-AUT-PERF-3 : < 400ms P95 (calcul à la demande, pas de cache V1).
 */

const SUPPORTED_TRIGGERS = new Set([
  "prospect_inactive_30d",
  "quote_expiring_3d",
  "task_overdue_3d",
]);

export async function POST(request: NextRequest) {
  const supabase = createClient();

  // Auth admin
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("entity_id, role")
    .eq("id", user.id)
    .single();
  if (
    !profile?.entity_id ||
    !["admin", "super_admin"].includes(profile.role)
  ) {
    return NextResponse.json(
      { data: null, error: "Admin access required" },
      { status: 403 },
    );
  }

  // Parse body
  let trigger_type: string | null = null;
  try {
    const body = await request.json();
    trigger_type = body?.trigger_type ?? null;
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!trigger_type) {
    return NextResponse.json(
      { data: null, error: "trigger_type required" },
      { status: 400 },
    );
  }

  if (!SUPPORTED_TRIGGERS.has(trigger_type)) {
    return NextResponse.json(
      {
        data: null,
        error: `trigger_type '${trigger_type}' non supporté pour eligible-targets (V1). Supportés : ${Array.from(SUPPORTED_TRIGGERS).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const entityId = profile.entity_id;
  const today = new Date();

  try {
    if (trigger_type === "prospect_inactive_30d") {
      const cutoff = new Date(
        today.getTime() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const [sampleRes, countRes] = await Promise.all([
        supabase
          .from("crm_prospects")
          .select("id, company_name")
          .eq("entity_id", entityId)
          .lt("last_activity_at", cutoff)
          .limit(5),
        supabase
          .from("crm_prospects")
          .select("id", { count: "exact", head: true })
          .eq("entity_id", entityId)
          .lt("last_activity_at", cutoff),
      ]);
      return NextResponse.json({
        data: {
          trigger_type,
          count: countRes.count ?? 0,
          sample: (sampleRes.data ?? []).map((p) => ({
            id: p.id,
            name: p.company_name ?? "—",
          })),
        },
        error: null,
      });
    }

    if (trigger_type === "quote_expiring_3d") {
      const inThreeDays = new Date(
        today.getTime() + 3 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const [sampleRes, countRes] = await Promise.all([
        supabase
          .from("crm_quotes")
          .select("id, reference")
          .eq("entity_id", entityId)
          .lte("valid_until", inThreeDays)
          .gte("valid_until", today.toISOString())
          .limit(5),
        supabase
          .from("crm_quotes")
          .select("id", { count: "exact", head: true })
          .eq("entity_id", entityId)
          .lte("valid_until", inThreeDays)
          .gte("valid_until", today.toISOString()),
      ]);
      return NextResponse.json({
        data: {
          trigger_type,
          count: countRes.count ?? 0,
          sample: (sampleRes.data ?? []).map((q) => ({
            id: q.id,
            name: q.reference ?? "—",
          })),
        },
        error: null,
      });
    }

    if (trigger_type === "task_overdue_3d") {
      const overdueCutoff = new Date(
        today.getTime() - 3 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const [sampleRes, countRes] = await Promise.all([
        supabase
          .from("crm_tasks")
          .select("id, title")
          .eq("entity_id", entityId)
          .lt("due_at", overdueCutoff)
          .neq("status", "done")
          .limit(5),
        supabase
          .from("crm_tasks")
          .select("id", { count: "exact", head: true })
          .eq("entity_id", entityId)
          .lt("due_at", overdueCutoff)
          .neq("status", "done"),
      ]);
      return NextResponse.json({
        data: {
          trigger_type,
          count: countRes.count ?? 0,
          sample: (sampleRes.data ?? []).map((t) => ({
            id: t.id,
            name: t.title ?? "—",
          })),
        },
        error: null,
      });
    }

    // Unreachable (filtré par SUPPORTED_TRIGGERS plus haut)
    return NextResponse.json(
      { data: null, error: "Unreachable" },
      { status: 500 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json(
      { data: null, error: message },
      { status: 500 },
    );
  }
}
