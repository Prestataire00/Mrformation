import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Story aut-a-6 — POST /api/crm/automations/dry-run
 *
 * Proxy admin-authenticated vers /api/crm/automations/run mode=dry-run.
 * Utilisé par <DryRunDialog> côté UI (B.1) pour afficher les cibles
 * éligibles d'une règle CRM SANS effet de bord.
 *
 * Body input : { rule_id?: string, trigger_type?: string }
 *   - Si rule_id : charge la rule pour identifier trigger_type, retourne
 *     eligibility pour ce trigger uniquement
 *   - Si trigger_type seul (sans rule_id) : eligibility pour ce trigger
 *   - Si rien : eligibility pour tous les triggers
 *
 * Body output : { mode: "dry-run", entity_id, trigger_type, eligibility }
 *   (cf. crm/automations/run branche user mode=dry-run, aut-a-3)
 *
 * Auth : admin/super_admin de l'entité.
 * NFR-AUT-SEC-5 : 0 création de tâche/notification.
 */

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

  // Si rule_id fourni : charger la rule pour récupérer trigger_type
  if (rule_id) {
    const { data: rule } = await supabase
      .from("crm_automation_rules")
      .select("entity_id, trigger_type, name")
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
    const data = await res.json();
    return NextResponse.json({ data, error: null }, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy error";
    return NextResponse.json(
      { data: null, error: message },
      { status: 500 },
    );
  }
}
