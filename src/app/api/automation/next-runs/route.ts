import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeBatchEvents } from "@/lib/automation/compute-events";
import {
  naturalLanguageNextRun,
  type NextRunInfo,
} from "@/lib/automation/next-run-natural-language";
import {
  getNextRunsCache,
  setNextRunsCache,
} from "@/lib/automation/next-runs-cache";

/**
 * Story aut-a-6 — GET /api/automation/next-runs?entity_id=X
 *
 * Batch-loader pour afficher le "▶ Prochain déclenchement" sur chaque card
 * règle dans `/admin/automation` (B.2). Retourne un Record<rule_id, NextRunInfo>
 * pour O(1) lookup côté UI.
 *
 * Cache module-level 5min (ID-AUT-1 architecture, extrait dans next-runs-cache.ts).
 * Pour invalider manuellement après modification d'une rule, utiliser
 * invalidateNextRunsCache() depuis @/lib/automation/next-runs-cache.
 *
 * Auth : admin/super_admin de l'entité.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get("entity_id");

  if (!entityId) {
    return NextResponse.json(
      { data: null, error: "entity_id query param required" },
      { status: 400 },
    );
  }

  const supabase = createClient();

  // Auth admin/super_admin de l'entité ciblée
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
    !profile ||
    !["admin", "super_admin"].includes(profile.role) ||
    // Super_admin peut accéder à toutes les entités, admin uniquement à la sienne
    (profile.role === "admin" && profile.entity_id !== entityId)
  ) {
    return NextResponse.json(
      { data: null, error: "Forbidden" },
      { status: 403 },
    );
  }

  // Cache hit ?
  const cached = getNextRunsCache(entityId);
  if (cached) {
    return NextResponse.json({ data: cached.data, error: null, cached: true });
  }

  // Cache miss : compute fresh
  // 1. Toutes les rules actives de l'entité
  const { data: rules } = await supabase
    .from("formation_automation_rules")
    .select("id, name, trigger_type, is_enabled")
    .eq("entity_id", entityId)
    .eq("is_enabled", true);

  if (!rules || rules.length === 0) {
    const empty: Record<string, NextRunInfo> = {};
    setNextRunsCache(entityId, empty);
    return NextResponse.json({ data: empty, error: null, cached: false });
  }

  // 2. Tous les events futurs des sessions actives (60 jours fenêtre suffit)
  const today = new Date();
  const horizon = new Date(today.getTime() + 60 * 86400000);
  const { events } = await computeBatchEvents(supabase, entityId, {
    from: today,
    to: horizon,
  });

  // 3. Agréger par rule_id : min(scheduled_date) + count
  const byRule = new Map<string, { next: string; count: number }>();
  for (const ev of events) {
    if (ev.status === "executed" || ev.status === "failed") continue; // déjà traité
    const evDate = new Date(ev.scheduled_date);
    if (evDate < today) continue; // passé
    const current = byRule.get(ev.rule_id);
    if (!current) {
      byRule.set(ev.rule_id, { next: ev.scheduled_date, count: 1 });
    } else {
      current.count += 1;
      if (evDate < new Date(current.next)) {
        current.next = ev.scheduled_date;
      }
    }
  }

  // 4. Construire NextRunInfo pour chaque rule
  const data: Record<string, NextRunInfo> = {};
  for (const rule of rules) {
    const agg = byRule.get(rule.id);
    const next_at = agg?.next ?? null;
    data[rule.id] = {
      next_at,
      natural_language: naturalLanguageNextRun(rule, next_at),
      applicable_count: agg?.count ?? 0,
    };
  }

  setNextRunsCache(entityId, data);
  return NextResponse.json({ data, error: null, cached: false });
}
