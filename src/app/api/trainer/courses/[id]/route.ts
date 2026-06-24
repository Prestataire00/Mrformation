import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { resolveTrainerIds } from "@/lib/auth/trainer-session-access";

/**
 * GET    /api/trainer/courses/[id]  — get one course
 * PUT    /api/trainer/courses/[id]  — update course
 * DELETE /api/trainer/courses/[id]  — delete course
 */

// Multi-entité : toutes les fiches du profil (.single() cassait avec ≥2 fiches).
async function getTrainerIds(supabase: ReturnType<typeof createClient>, userId: string) {
  return resolveTrainerIds(supabase, userId);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const trainerIds = await getTrainerIds(supabase, user.id);
    if (trainerIds.length === 0) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    const { data: course, error } = await supabase
      .from("trainer_courses")
      .select("*")
      .eq("id", params.id)
      .in("trainer_id", trainerIds)
      .single();

    if (error || !course) return NextResponse.json({ error: "Cours non trouvé" }, { status: 404 });
    return NextResponse.json({ data: course });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/courses/[id] GET") }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const trainerIds = await getTrainerIds(supabase, user.id);
    if (trainerIds.length === 0) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    const body = await request.json();
    const { title, description, category, files, status } = body;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (category !== undefined) updates.category = category?.trim() || null;
    if (files !== undefined) updates.files = files;
    if (status !== undefined) updates.status = status;

    const { data: course, error } = await supabase
      .from("trainer_courses")
      .update(updates)
      .eq("id", params.id)
      .in("trainer_id", trainerIds)
      .select()
      .single();

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "trainer/courses/[id] PUT") }, { status: 500 });
    return NextResponse.json({ data: course });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/courses/[id] PUT") }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const trainerIds = await getTrainerIds(supabase, user.id);
    if (trainerIds.length === 0) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    const { error } = await supabase
      .from("trainer_courses")
      .delete()
      .eq("id", params.id)
      .in("trainer_id", trainerIds);

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "trainer/courses/[id] DELETE") }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/courses/[id] DELETE") }, { status: 500 });
  }
}
