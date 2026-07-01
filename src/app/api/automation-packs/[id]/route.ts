import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { packMetaSchema } from "@/lib/validations/automation-pack";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const { data: pack, error } = await auth.supabase
      .from("automation_packs")
      .select("*")
      .eq("id", params.id)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "pack GET") }, { status: 500 });
    if (!pack) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });
    const { data: steps } = await auth.supabase
      .from("automation_pack_steps")
      .select("*")
      .eq("pack_id", params.id)
      .order("order_index");
    return NextResponse.json({ pack, steps: steps ?? [] });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "pack GET") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const parsed = packMetaSchema.partial().safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    // Verify ownership
    const { data: owned } = await auth.supabase
      .from("automation_packs")
      .select("id, entity_id")
      .eq("id", params.id)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });
    // is_default unique par entité : si on promeut ce pack, retirer le flag des autres.
    if (parsed.data.is_default === true) {
      await auth.supabase
        .from("automation_packs")
        .update({ is_default: false })
        .eq("entity_id", entityId)
        .neq("id", params.id);
    }
    const { error } = await auth.supabase
      .from("automation_packs")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("entity_id", entityId);
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "pack PATCH") }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "pack PATCH") }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    // Verify ownership
    const { data: owned } = await auth.supabase
      .from("automation_packs")
      .select("id, entity_id")
      .eq("id", params.id)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });
    // Garde : refuser si des formations référencent ce pack.
    const { count } = await auth.supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("automation_pack_id", params.id);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `Pack utilisé par ${count} formation(s) — suppression refusée.` },
        { status: 409 }
      );
    }
    const { error } = await auth.supabase
      .from("automation_packs")
      .delete()
      .eq("id", params.id)
      .eq("entity_id", entityId);
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "pack DELETE") }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "pack DELETE") }, { status: 500 });
  }
}
