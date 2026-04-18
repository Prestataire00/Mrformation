import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireRole(["super_admin", "admin"]);
    if (auth.error) return auth.error;

    const sessionId = context.params.id;
    const { data, error } = await auth.supabase
      .from("session_automation_overrides")
      .select("*")
      .eq("session_id", sessionId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ overrides: data || [] });
  } catch (err) {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireRole(["super_admin", "admin"]);
    if (auth.error) return auth.error;

    const sessionId = context.params.id;
    const { rule_id, is_enabled, days_offset_override, template_id_override } = await request.json();

    if (!rule_id) return NextResponse.json({ error: "rule_id requis" }, { status: 400 });

    const { data, error } = await auth.supabase
      .from("session_automation_overrides")
      .upsert({
        session_id: sessionId,
        rule_id,
        is_enabled: is_enabled ?? true,
        days_offset_override: days_offset_override ?? null,
        template_id_override: template_id_override ?? null,
      }, { onConflict: "session_id,rule_id" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ override: data });
  } catch (err) {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireRole(["super_admin", "admin"]);
    if (auth.error) return auth.error;

    const sessionId = context.params.id;
    const { rule_id } = await request.json();

    const { error } = await auth.supabase
      .from("session_automation_overrides")
      .delete()
      .eq("session_id", sessionId)
      .eq("rule_id", rule_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
