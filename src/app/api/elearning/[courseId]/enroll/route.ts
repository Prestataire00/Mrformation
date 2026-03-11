import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!["admin", "learner"].includes(profile?.role)) {
      return NextResponse.json({ data: null, error: "Accès non autorisé" }, { status: 403 });
    }

    const body = await request.json();
    const { learner_ids } = body;

    if (!Array.isArray(learner_ids) || learner_ids.length === 0) {
      return NextResponse.json({ error: "learner_ids requis" }, { status: 400 });
    }

    const enrollments = learner_ids.map((learnerId: string) => ({
      course_id: params.courseId,
      learner_id: learnerId,
      status: "enrolled",
    }));

    const { data, error } = await supabase
      .from("elearning_enrollments")
      .upsert(enrollments, { onConflict: "course_id,learner_id", ignoreDuplicates: true })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, enrolled: data?.length ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
