import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

type Ctx = { params: { id: string } };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const { data: src } = await auth.supabase
      .from("automation_packs")
      .select("*")
      .eq("id", params.id)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (!src) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });
    const { data: created, error: cErr } = await auth.supabase
      .from("automation_packs")
      .insert({
        entity_id: entityId,
        name: `${src.name} (copie)`,
        description: src.description,
        icon: src.icon,
        color: src.color,
        is_default: false,
      })
      .select("id")
      .single();
    if (cErr) return NextResponse.json({ error: sanitizeDbError(cErr, "pack duplicate") }, { status: 500 });
    const { data: steps } = await auth.supabase
      .from("automation_pack_steps")
      .select("*")
      .eq("pack_id", params.id)
      .order("order_index");
    if (steps && steps.length > 0) {
      const rows = steps.map((s) => ({
        pack_id: created.id,
        order_index: s.order_index,
        trigger_type: s.trigger_type,
        days_offset: s.days_offset,
        recipient_type: s.recipient_type,
        document_type: s.document_type,
        template_id: s.template_id,
        condition_subcontracted: s.condition_subcontracted,
        send_email: s.send_email,
        name: s.name,
        description: s.description,
      }));
      await auth.supabase.from("automation_pack_steps").insert(rows);
    }
    return NextResponse.json({ id: created.id });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "pack duplicate") }, { status: 500 });
  }
}
