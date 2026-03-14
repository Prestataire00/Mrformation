import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Check role is learner
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, entity_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "learner") {
      return NextResponse.json(
        { error: "Seuls les apprenants peuvent s'inscrire" },
        { status: 403 }
      );
    }

    const { session_id } = await request.json();

    if (!session_id) {
      return NextResponse.json(
        { error: "session_id requis" },
        { status: 400 }
      );
    }

    // Get the learner record
    const { data: learner } = await supabase
      .from("learners")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (!learner) {
      return NextResponse.json(
        { error: "Profil apprenant introuvable" },
        { status: 404 }
      );
    }

    // Check session is public and in same entity
    const { data: session } = await supabase
      .from("sessions")
      .select("id, is_public, max_participants, entity_id, status")
      .eq("id", session_id)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: "Session introuvable" },
        { status: 404 }
      );
    }

    if (!session.is_public) {
      return NextResponse.json(
        { error: "Cette session n'est pas ouverte aux inscriptions" },
        { status: 403 }
      );
    }

    if (session.status === "cancelled" || session.status === "completed") {
      return NextResponse.json(
        { error: "Cette session n'accepte plus d'inscriptions" },
        { status: 400 }
      );
    }

    // Check not already enrolled
    const { data: existing } = await supabase
      .from("enrollments")
      .select("id")
      .eq("session_id", session_id)
      .eq("learner_id", learner.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Vous êtes déjà inscrit à cette session" },
        { status: 409 }
      );
    }

    // Check capacity
    if (session.max_participants) {
      const { count } = await supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session_id)
        .neq("status", "cancelled");

      if (count !== null && count >= session.max_participants) {
        return NextResponse.json(
          { error: "Cette session est complète" },
          { status: 400 }
        );
      }
    }

    // Create enrollment
    const { data: enrollment, error: insertError } = await supabase
      .from("enrollments")
      .insert({
        session_id,
        learner_id: learner.id,
        status: "registered",
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: sanitizeDbError(insertError, "self-enroll insert") },
        { status: 500 }
      );
    }

    logAudit({
      supabase,
      entityId: profile.entity_id,
      userId: user.id,
      action: "create",
      resourceType: "enrollment",
      resourceId: enrollment.id,
      details: { name: `Inscription session ${session_id}` },
    });

    return NextResponse.json({
      data: enrollment,
      message: "Inscription réussie",
    });
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, "self-enroll") }, { status: 500 });
  }
}
