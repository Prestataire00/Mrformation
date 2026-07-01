import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { packMetaSchema } from "@/lib/validations/automation-pack";

export async function GET() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const { data, error } = await auth.supabase
      .from("automation_packs")
      .select("*")
      .eq("entity_id", entityId)
      .order("name");
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "packs GET") }, { status: 500 });
    return NextResponse.json({ packs: data ?? [] });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "packs GET") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const parsed = packMetaSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { data, error } = await auth.supabase
      .from("automation_packs")
      .insert({ ...parsed.data, entity_id: entityId })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: sanitizeDbError(error, "packs POST") }, { status: 500 });
    return NextResponse.json({ id: data.id });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "packs POST") }, { status: 500 });
  }
}
