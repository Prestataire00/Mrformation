import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

export async function GET() {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { data, error } = await auth.supabase
      .from("veille_notes")
      .select("*")
      .eq("entity_id", auth.profile.entity_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "veille notes GET") }, { status: 500 });
    }

    return NextResponse.json({ notes: data ?? [] });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "veille notes GET") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { title, content, source, url } = await request.json();

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Le titre est requis." }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from("veille_notes")
      .insert({
        entity_id: auth.profile.entity_id,
        title: title.trim(),
        content: content || null,
        source: source || null,
        url: url || null,
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "veille notes POST") }, { status: 500 });
    }

    logAudit({
      supabase: auth.supabase,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "create",
      resourceType: "veille_note",
      resourceId: data.id,
      details: { title: title.trim() },
    });

    return NextResponse.json({ note: data });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "veille notes POST") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Le paramètre id est requis." }, { status: 400 });
    }

    const { error } = await auth.supabase
      .from("veille_notes")
      .delete()
      .eq("id", id)
      .eq("entity_id", auth.profile.entity_id);

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "veille notes DELETE") }, { status: 500 });
    }

    logAudit({
      supabase: auth.supabase,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "delete",
      resourceType: "veille_note",
      resourceId: id,
      details: {},
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: sanitizeError(err, "veille notes DELETE") }, { status: 500 });
  }
}
