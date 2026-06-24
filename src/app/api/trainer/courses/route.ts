import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { resolveTrainerIds } from "@/lib/auth/trainer-session-access";

/**
 * GET  /api/trainer/courses        — list current trainer's courses
 * POST /api/trainer/courses        — create a new course
 */

export async function GET(_request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    // Multi-entité : toutes les fiches du profil (cf resolveTrainerIds) — .single()
    // cassait pour un formateur présent dans 2 entités.
    const trainerIds = await resolveTrainerIds(supabase, user.id);
    if (trainerIds.length === 0) return NextResponse.json({ error: "Formateur non trouvé" }, { status: 403 });

    const { data: courses, error } = await supabase
      .from("trainer_courses")
      .select("*")
      .in("trainer_id", trainerIds)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: sanitizeDbError(error, "trainer/courses GET") }, { status: 500 });

    // Nombre de sessions auxquelles chaque support est partagé (badge UI).
    const courseRows = (courses as Array<{ id: string }> | null) ?? [];
    let sharedCounts: Record<string, number> = {};
    if (courseRows.length > 0) {
      const { data: links } = await supabase
        .from("trainer_course_sessions")
        .select("trainer_course_id")
        .in("trainer_course_id", courseRows.map((c) => c.id));
      sharedCounts = ((links as Array<{ trainer_course_id: string }> | null) ?? []).reduce(
        (acc, l) => {
          acc[l.trainer_course_id] = (acc[l.trainer_course_id] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
    }
    const withCounts = courseRows.map((c) => ({
      ...c,
      shared_session_count: sharedCounts[c.id] ?? 0,
    }));

    return NextResponse.json({ data: withCounts });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/courses GET") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    // Multi-entité : toutes les fiches du profil (.single() cassait à ≥2). Un
    // support n'est pas lié à une session → on l'attribue à la 1ʳᵉ fiche.
    const { data: trainerRows } = await supabase
      .from("trainers")
      .select("id, entity_id")
      .eq("profile_id", user.id);
    const trainer = ((trainerRows ?? []) as Array<{ id: string; entity_id: string | null }>)[0];
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
