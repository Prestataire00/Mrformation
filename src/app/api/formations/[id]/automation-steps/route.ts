import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = { params: { id: string } };

// Vérifie que la session appartient à l'entité active.
// Reçoit supabase directement (après le guard auth.error du caller) pour éviter
// tout problème de narrowing TypeScript sur le type union de requireRole.
async function sessionInEntity(
  supabase: SupabaseClient,
  sessionId: string,
  entityId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("entity_id", entityId)
    .maybeSingle();
  return !!data;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    if (!(await sessionInEntity(auth.supabase, params.id, entityId))) {
      return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
    }
    const { data: session } = await auth.supabase
      .from("sessions")
      .select("automation_pack_id")
      .eq("id", params.id)
      .maybeSingle();
    const { data: steps, error } = await auth.supabase
      .from("session_automation_steps")
      .select("*")
      .eq("session_id", params.id)
      .order("order_index");
    if (error) {
      return NextResponse.json(
        { error: sanitizeDbError(error, "automation-steps GET") },
        { status: 500 },
      );
    }
    return NextResponse.json({
      steps: steps ?? [],
      automation_pack_id: session?.automation_pack_id ?? null,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "automation-steps GET") },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    if (!(await sessionInEntity(auth.supabase, params.id, entityId))) {
      return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
    }
    const body = await request.json();
    const stepId = typeof body?.step_id === "string" ? body.step_id : null;
    const isEnabled = typeof body?.is_enabled === "boolean" ? body.is_enabled : null;
    if (!stepId || isEnabled === null) {
      return NextResponse.json({ error: "step_id et is_enabled requis" }, { status: 400 });
    }
    const { error } = await auth.supabase
      .from("session_automation_steps")
      .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
      .eq("id", stepId)
      .eq("session_id", params.id); // double filtre : étape DE cette session
    if (error) {
      return NextResponse.json(
        { error: sanitizeDbError(error, "automation-steps PATCH") },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "automation-steps PATCH") },
      { status: 500 },
    );
  }
}
