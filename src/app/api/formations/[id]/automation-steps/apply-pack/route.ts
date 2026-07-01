import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { instantiatePackForSession } from "@/lib/automation/instantiate-pack";

type Ctx = { params: { id: string } };

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;
  try {
    const entityId = resolveActiveEntityId(auth.profile);
    const body = await request.json();
    const packId = typeof body?.pack_id === "string" ? body.pack_id : null;
    if (!packId) return NextResponse.json({ error: "pack_id requis" }, { status: 400 });

    // La session doit appartenir à l'entité active.
    const { data: session } = await auth.supabase
      .from("sessions")
      .select("id")
      .eq("id", params.id)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (!session) return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });

    // Le pack doit appartenir à la même entité (instantiatePackForSession le revérifie aussi).
    const { data: pack } = await auth.supabase
      .from("automation_packs")
      .select("id")
      .eq("id", packId)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (!pack) return NextResponse.json({ error: "Pack introuvable" }, { status: 404 });

    // 1) mémorise le pack choisi sur la session
    const { error: upErr } = await auth.supabase
      .from("sessions")
      .update({ automation_pack_id: packId })
      .eq("id", params.id);
    if (upErr) {
      return NextResponse.json(
        { error: sanitizeDbError(upErr, "apply-pack update") },
        { status: 500 },
      );
    }

    // 2) (ré)instancie le snapshot
    const snap = await instantiatePackForSession(auth.supabase, packId, params.id);
    if (!snap.ok) return NextResponse.json({ error: snap.error }, { status: 500 });
    return NextResponse.json({ ok: true, count: snap.count });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "apply-pack POST") },
      { status: 500 },
    );
  }
}
