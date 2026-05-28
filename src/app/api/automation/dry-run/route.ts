import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Story aut-a-6 — POST /api/automation/dry-run
 *
 * Proxy admin-authenticated vers /api/formations/automation-rules/run-cron
 * mode=dry-run. Utilisé par <DryRunDialog> côté UI (B.1) pour afficher
 * destinataires + aperçu mail + PJ d'une règle SANS l'exécuter.
 *
 * Body input : { rule_id: string, session_id: string }
 * Body output : DryRunResult (cf. run-cron mode dry-run, aut-a-3)
 *
 * Auth : admin/super_admin de l'entité (vérifié via la rule).
 * NFR-AUT-SEC-5 : 0 effet de bord (aucun email enqueué).
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
  let session_id: string | null = null;
  try {
    const body = await request.json();
    rule_id = body.rule_id ?? null;
    session_id = body.session_id ?? null;
  } catch {
    return NextResponse.json(
      { data: null, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  if (!rule_id || !session_id) {
    return NextResponse.json(
      { data: null, error: "rule_id and session_id are required" },
      { status: 400 },
    );
  }

  // Vérification d'appartenance entité (défense en profondeur)
  // Un admin ne peut tester que les règles de son entité (super_admin peut tout).
  if (profile.role === "admin") {
    const { data: rule } = await supabase
      .from("formation_automation_rules")
      .select("entity_id")
      .eq("id", rule_id)
      .maybeSingle();
    if (!rule) {
      return NextResponse.json(
        { data: null, error: "Règle introuvable" },
        { status: 404 },
      );
    }
    if (rule.entity_id !== profile.entity_id) {
      return NextResponse.json(
        { data: null, error: "Règle hors de l'entité" },
        { status: 403 },
      );
    }
  }

  // Proxy vers run-cron mode=dry-run avec Bearer CRON_SECRET
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.URL ||
    "http://localhost:3000";
  try {
    const res = await fetch(
      `${baseUrl}/api/formations/automation-rules/run-cron`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rule_id, session_id, mode: "dry-run" }),
      },
    );
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
