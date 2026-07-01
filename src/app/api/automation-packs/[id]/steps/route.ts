import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { packStepsSchema } from "@/lib/validations/automation-pack";

type Ctx = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const { data: owned } = await auth.supabase
      .from("automation_packs")
      .select("id")
      .eq("id", params.id)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });
    const body = await request.json();
    const parsed = packStepsSchema.safeParse(body?.steps);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    // Remplacement complet du gabarit — NE touche PAS session_automation_steps (snapshots figés).
    await auth.supabase.from("automation_pack_steps").delete().eq("pack_id", params.id);
    if (parsed.data.length > 0) {
      const rows = parsed.data.map((s, i) => ({
        pack_id: params.id,
        order_index: i,
        trigger_type: s.trigger_type,
        days_offset: s.days_offset ?? 0,
        recipient_type: s.recipient_type ?? null,
        document_type: s.document_type ?? null,
        template_id: s.template_id ?? null,
        condition_subcontracted: s.condition_subcontracted ?? null,
        send_email: s.send_email ?? true,
        name: s.name ?? null,
        description: s.description ?? null,
      }));
      const { error } = await auth.supabase.from("automation_pack_steps").insert(rows);
      if (error) return NextResponse.json({ error: sanitizeDbError(error, "steps PUT") }, { status: 500 });
    }
    return NextResponse.json({ ok: true, count: parsed.data.length });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "steps PUT") }, { status: 500 });
  }
}
