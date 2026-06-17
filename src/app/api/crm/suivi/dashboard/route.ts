import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import {
  computeKpis,
  computeActivitySeries,
  computeByCommercial,
  type ActionLite,
  type ProspectLite,
  type Period,
} from "@/lib/crm/commercial-dashboard";

const querySchema = z.object({
  period: z.enum(["month", "30d", "quarter"]).default("month"),
});

function buildPeriod(kind: "month" | "30d" | "quarter", now: Date): Period {
  const end = now;
  const start = new Date(now);
  if (kind === "month") {
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
  } else if (kind === "30d") {
    start.setUTCDate(start.getUTCDate() - 30);
  } else {
    start.setUTCMonth(start.getUTCMonth() - 3);
  }
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return { start, end, prevStart, prevEnd };
}

export async function GET(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("entity_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.entity_id) {
    return NextResponse.json(
      { error: "Profil ou entité introuvable" },
      { status: 403 }
    );
  }

  if (!["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // resolveActiveEntityId prend uniquement le profil (pas la request).
  // Pour super_admin, lit le cookie `entity_id` via next/headers en interne.
  const entityId = resolveActiveEntityId(profile);
  if (!entityId) {
    return NextResponse.json({ error: "Entité introuvable" }, { status: 400 });
  }

  const parsed = querySchema.safeParse({
    period: request.nextUrl.searchParams.get("period") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètre period invalide" },
      { status: 400 }
    );
  }

  const now = new Date();
  const period = buildPeriod(parsed.data.period, now);
  const sinceCurve = new Date(now);
  sinceCurve.setUTCDate(sinceCurve.getUTCDate() - 8 * 7);
  const since = new Date(
    Math.min(period.prevStart.getTime(), sinceCurve.getTime())
  ).toISOString();

  const [{ data: rawActions }, { data: rawProspects }, { data: rawProfiles }] =
    await Promise.all([
      supabase
        .from("crm_commercial_actions")
        .select("author_id, action_type, created_at")
        .eq("entity_id", entityId)
        .gte("created_at", since),
      supabase
        .from("crm_prospects")
        .select("assigned_to, status, amount, updated_at")
        .eq("entity_id", entityId),
      supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("entity_id", entityId),
    ]);

  const actions: ActionLite[] = (rawActions ?? []).map((row) => ({
    author_id: row.author_id as string,
    action_type: row.action_type as string,
    created_at: row.created_at as string,
  }));

  const prospects: ProspectLite[] = (rawProspects ?? []).map((row) => ({
    assigned_to: (row.assigned_to as string | null) ?? null,
    status: row.status as string,
    amount: (row.amount as number | null) ?? null,
    updated_at: row.updated_at as string,
  }));

  const names = new Map<string, string>();
  for (const p of rawProfiles ?? []) {
    names.set(
      p.id as string,
      `${(p.first_name as string | null) ?? ""} ${(p.last_name as string | null) ?? ""}`.trim() || "—"
    );
  }

  return NextResponse.json({
    kpis: computeKpis(actions, prospects, period),
    activitySeries: computeActivitySeries(actions, 8, now),
    byCommercial: computeByCommercial(actions, prospects, names, period),
  });
}
