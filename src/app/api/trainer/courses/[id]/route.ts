import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET    /api/trainer/courses/[id]  — get one course
 * PUT    /api/trainer/courses/[id]  — update course
 * DELETE /api/trainer/courses/[id]  — delete course
 */

async function getTrainerId(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from("trainers").select("id").eq("profile_id", userId).single();
  return data?.id || null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const trainerId = await getTrainerId(supabase, user.id);
    if (!trainerId) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    const { data: course, error } = await supabase
      .from("trainer_courses")
      .select("*")
      .eq("id", params.id)
      .eq("trainer_id", trainerId)
      .single();

    if (error || !course) return NextResponse.json({ error: "Cours non trouvé" }, { status: 404 });
    return NextResponse.json({ data: course });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur interne" }, { status: 500 });
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

    const trainerId = await getTrainerId(supabase, user.id);
    if (!trainerId) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

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
      .eq("trainer_id", trainerId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: course });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur interne" }, { status: 500 });
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

    const trainerId = await getTrainerId(supabase, user.id);
    if (!trainerId) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    const { error } = await supabase
      .from("trainer_courses")
      .delete()
      .eq("id", params.id)
      .eq("trainer_id", trainerId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur interne" }, { status: 500 });
  }
}
