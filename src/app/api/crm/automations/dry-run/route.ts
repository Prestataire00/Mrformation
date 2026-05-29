import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateLeadScore } from "@/lib/crm/lead-scoring";

/**
 * Story aut-a-6 + aut-c-5 — POST /api/crm/automations/dry-run
 *
 * Proxy admin-authenticated vers /api/crm/automations/run mode=dry-run +
 * enrichissement `action_preview` pour les action_types update_prospect_status
 * et update_scores (aut-c-5, FR-AUT-45).
 *
 * Utilisé par <DryRunDialog> côté UI (B.1) pour afficher les cibles
 * éligibles d'une règle CRM SANS effet de bord.
 *
 * Body input : { rule_id?: string, trigger_type?: string }
 *   - Si rule_id : charge la rule pour identifier trigger_type + action_type,
 *     retourne eligibility + action_preview spécifique à l'action
 *   - Si trigger_type seul (sans rule_id) : eligibility pour ce trigger
 *   - Si rien : eligibility pour tous les triggers
 *
 * Body output : {
 *   mode: "dry-run",
 *   entity_id,
 *   trigger_type,
 *   eligibility,
 *   action_preview?: {  // aut-c-5 — seulement si rule_id + action_type pertinent
 *     action_type: "update_prospect_status" | "update_scores",
 *     sample: Array<{ id, name, current, next, delta? }>,
 *     avg_before?, avg_after?, avg_delta?  // update_scores uniquement
 *   }
 * }
 *
 * Auth : admin/super_admin de l'entité.
 * NFR-AUT-SEC-5 : 0 effet de bord — toutes les queries sont SELECT only.
 */

// Action types qui déclenchent un action_preview enrichi (aut-c-5)
const PREVIEW_ENABLED_ACTIONS = new Set([
  "update_prospect_status",
  "update_scores",
]);

// Triggers V1 qui ont un dataset prospects identifiable (cohérent avec eligible-targets)
const PROSPECT_TRIGGERS = new Set([
  "prospect_inactive_30d",
  "prospect_created",
  "prospect_qualified",
]);

const PREVIEW_SAMPLE_LIMIT = 20;

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
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json(
      { data: null, error: "Admin access required" },
      { status: 403 },
    );
  }

  // Parse body
  let rule_id: string | null = null;
  let trigger_type: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    rule_id = body?.rule_id ?? null;
    trigger_type = body?.trigger_type ?? null;
  } catch {
    /* body vide accepté → eligibility tous triggers */
  }

  // Si rule_id fourni : charger la rule pour récupérer trigger_type + action_type + config
  let loadedRule: {
    entity_id: string;
    trigger_type: string;
    action_type: string;
    config: Record<string, unknown> | null;
  } | null = null;
  if (rule_id) {
    const { data: rule } = await supabase
      .from("crm_automation_rules")
      .select("entity_id, trigger_type, action_type, config, name")
      .eq("id", rule_id)
      .maybeSingle();
    if (!rule) {
      return NextResponse.json(
        { data: null, error: "Règle CRM introuvable" },
        { status: 404 },
      );
    }
    // Défense en profondeur entité
    if (profile.role === "admin" && rule.entity_id !== profile.entity_id) {
      return NextResponse.json(
        { data: null, error: "Règle hors de l'entité" },
        { status: 403 },
      );
    }
    // Le trigger_type de la rule overwrite l'input
    trigger_type = rule.trigger_type;
    loadedRule = {
      entity_id: rule.entity_id,
      trigger_type: rule.trigger_type,
      action_type: rule.action_type,
      config: rule.config as Record<string, unknown> | null,
    };
  }

  // Proxy vers /api/crm/automations/run mode=dry-run via session admin actuelle
  // (PAS via Bearer CRON_SECRET : la branche dry-run vit dans la branche user
  // de crm/automations/run, pas dans la branche cron).
  // On utilise donc le client Supabase admin actuel directement, en réutilisant
  // la même logique via un fetch interne authentifié par le cookie de session.
  //
  // Alternative pertinente : appeler la logique de calcul d'eligibility en
  // duplication ici. Pour V1, on garde le proxy fetch pour éviter duplication.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.URL ||
    "http://localhost:3000";

  // Forward le cookie de session pour que la route cible voit le user admin actuel
  const cookieHeader = request.headers.get("cookie") ?? "";

  try {
    const res = await fetch(`${baseUrl}/api/crm/automations/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        mode: "dry-run",
        ...(trigger_type ? { trigger_type } : {}),
      }),
    });
    const proxyJson = await res.json();
    const proxyData = proxyJson?.data ?? proxyJson;

    // aut-c-5 — enrichir avec action_preview si pertinent
    let action_preview: ActionPreview | null = null;
    if (loadedRule && PREVIEW_ENABLED_ACTIONS.has(loadedRule.action_type)) {
      try {
        action_preview = await computeActionPreview(supabase, loadedRule);
      } catch (previewErr) {
        // Non-blocking : on retourne le dry-run sans action_preview
        console.error(
          "[crm/automations/dry-run] action_preview failed (non-blocking):",
          previewErr instanceof Error ? previewErr.message : previewErr,
        );
      }
    }

    return NextResponse.json(
      {
        data: action_preview ? { ...proxyData, action_preview } : proxyData,
        error: null,
      },
      { status: res.status },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy error";
    return NextResponse.json(
      { data: null, error: message },
      { status: 500 },
    );
  }
}

// ── aut-c-5 : helpers action_preview ────────────────────────────────────

type ProspectRow = {
  id: string;
  company_name: string | null;
  status: string | null;
  score: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

type ActionPreviewSampleItem = {
  id: string;
  name: string;
  current: string | number;
  next: string | number;
  delta?: number;
};

type ActionPreview = {
  action_type: "update_prospect_status" | "update_scores";
  sample: ActionPreviewSampleItem[];
  total_count: number;
  // Stats agrégées pour update_scores uniquement
  avg_before?: number;
  avg_after?: number;
  avg_delta?: number;
};

/**
 * Calcule un aperçu d'impact d'une règle CRM sur les prospects affectés.
 * - update_prospect_status : top 20 prospects éligibles avec current_status → new_status
 * - update_scores : top 20 prospects avec current_score → simulated_score + avg avant/après
 *
 * NFR-AUT-SEC-5 : aucun UPDATE persisté. `calculateLeadScore` est une pure
 * fonction de lecture (queries SELECT only sur crm_quotes et crm_tasks).
 */
async function computeActionPreview(
  supabase: ReturnType<typeof createClient>,
  rule: { entity_id: string; trigger_type: string; action_type: string; config: Record<string, unknown> | null },
): Promise<ActionPreview | null> {
  // Construire le filtre de prospects selon le trigger_type
  // Pour les triggers non-prospect (quote/task), on ne peut pas montrer un sample pertinent → null
  if (!PROSPECT_TRIGGERS.has(rule.trigger_type)) {
    return null;
  }

  const today = new Date();
  let query = supabase
    .from("crm_prospects")
    .select("id, company_name, status, score, source, created_at, updated_at", { count: "exact" })
    .eq("entity_id", rule.entity_id);

  if (rule.trigger_type === "prospect_inactive_30d") {
    const cutoff = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    query = query.lt("last_activity_at", cutoff);
  } else if (rule.trigger_type === "prospect_qualified") {
    query = query.eq("status", "qualified");
  }
  // prospect_created → tous les prospects (pas de filtre supplémentaire)

  const { data: prospects, count } = await query.limit(PREVIEW_SAMPLE_LIMIT);
  const rows = (prospects ?? []) as ProspectRow[];

  if (rule.action_type === "update_prospect_status") {
    const newStatus = (rule.config?.new_status as string) ?? "—";
    return {
      action_type: "update_prospect_status",
      total_count: count ?? rows.length,
      sample: rows.map((p) => ({
        id: p.id,
        name: p.company_name ?? "—",
        current: p.status ?? "—",
        next: newStatus,
      })),
    };
  }

  // action_type === "update_scores" : recalcul réel via calculateLeadScore
  const simulated = await Promise.all(
    rows.map(async (p) => {
      const newScore = await calculateLeadScore(supabase, p.id, {
        source: p.source,
        created_at: p.created_at,
        updated_at: p.updated_at,
      });
      const currentScore = p.score ?? 0;
      return {
        id: p.id,
        name: p.company_name ?? "—",
        current: currentScore,
        next: newScore,
        delta: newScore - currentScore,
      };
    }),
  );

  const avgBefore =
    simulated.length === 0
      ? 0
      : Math.round(
          simulated.reduce((sum, s) => sum + Number(s.current), 0) / simulated.length,
        );
  const avgAfter =
    simulated.length === 0
      ? 0
      : Math.round(
          simulated.reduce((sum, s) => sum + Number(s.next), 0) / simulated.length,
        );

  return {
    action_type: "update_scores",
    total_count: count ?? rows.length,
    sample: simulated,
    avg_before: avgBefore,
    avg_after: avgAfter,
    avg_delta: avgAfter - avgBefore,
  };
}
