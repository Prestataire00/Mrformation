import { NextRequest, NextResponse } from "next/server";
import { requireElearningEnrollment } from "@/lib/auth/elearning-access";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { enrollment_id, chapter_id, is_completed, time_spent_seconds } = body;

    if (!enrollment_id || !chapter_id) {
      return NextResponse.json({ error: "enrollment_id et chapter_id requis" }, { status: 400 });
    }

    const access = await requireElearningEnrollment(enrollment_id, ["admin", "super_admin", "learner"]);
    if (!access.ok) return access.error;
    const { supabase } = access;

    // Upsert chapter progress
    const { data, error } = await supabase
      .from("elearning_chapter_progress")
      .upsert(
        {
          enrollment_id,
          chapter_id,
          is_completed: is_completed ?? false,
          completed_at: is_completed ? new Date().toISOString() : null,
          time_spent_seconds: time_spent_seconds ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "enrollment_id,chapter_id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: sanitizeDbError(error, "updating chapter progress") }, { status: 500 });
    }

    const { error: rpcErr } = await supabase.rpc("elearning_recompute_progress", {
      p_enrollment_id: enrollment_id,
    });
    if (rpcErr) {
      // La progression du chapitre est déjà enregistrée ; seul le recalcul a échoué — le client peut réessayer sans risque.
      return NextResponse.json({ error: "Erreur de recalcul de progression" }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "updating chapter progress") }, { status: 500 });
  }
}
