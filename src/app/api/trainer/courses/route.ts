import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

/**
 * GET  /api/trainer/courses        — list current trainer's courses
 * POST /api/trainer/courses        — create a new course
 */

export async function GET(_request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (!trainer) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    const { data: courses, error } = await supabase
      .from("trainer_courses")
      .select("*")
      .eq("trainer_id", trainer.id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "trainer/courses GET") }, { status: 500 });

    return NextResponse.json({ data: courses || [] });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/courses GET") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: trainer } = await supabase
      .from("trainers")
      .select("id, entity_id")
      .eq("profile_id", user.id)
      .single();

    if (!trainer) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    const body = await request.json();
    const { title, description, category, files } = body;

    if (!title?.trim()) return NextResponse.json({ error: "Titre requis" }, { status: 400 });

    const { data: course, error } = await supabase
      .from("trainer_courses")
      .insert({
        trainer_id: trainer.id,
        entity_id: trainer.entity_id || null,
        title: title.trim(),
        description: description?.trim() || null,
        category: category?.trim() || null,
        files: files || [],
        status: "draft",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "trainer/courses POST") }, { status: 500 });

    return NextResponse.json({ data: course }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/courses POST") }, { status: 500 });
  }
}
