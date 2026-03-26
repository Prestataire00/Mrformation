import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit-log";

interface RouteContext {
  params: { id: string };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  const sessionId = context.params.id;

  try {
    // 1. Verify session exists and belongs to the same entity
    const { data: session, error: sessionError } = await auth.supabase
      .from("sessions")
      .select("id, title, entity_id")
      .eq("id", sessionId)
      .eq("entity_id", auth.profile.entity_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session introuvable." },
        { status: 404 }
      );
    }

    // 2. Get all time slots for this session
    const { data: slots, error: slotsError } = await auth.supabase
      .from("formation_time_slots")
      .select("id, start_time")
      .eq("session_id", sessionId)
      .order("slot_order", { ascending: true });

    if (slotsError) {
      return NextResponse.json(
        { error: sanitizeDbError(slotsError, "auto-absences slots") },
        { status: 500 }
      );
    }

    if (!slots || slots.length === 0) {
      return NextResponse.json(
        { error: "Aucun créneau trouvé pour cette session." },
        { status: 400 }
      );
    }

    // 3. Get all enrolled learners for this session
    const { data: enrollments, error: enrollmentsError } = await auth.supabase
      .from("enrollments")
      .select("learner_id")
      .eq("session_id", sessionId)
      .in("status", ["registered", "confirmed", "completed"]);

    if (enrollmentsError) {
      return NextResponse.json(
        { error: sanitizeDbError(enrollmentsError, "auto-absences enrollments") },
        { status: 500 }
      );
    }

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json(
        { error: "Aucun apprenant inscrit à cette session." },
        { status: 400 }
      );
    }

    const learnerIds = enrollments.map((e) => e.learner_id);

    // 4. Get all existing signatures for this session (learners only, slot-aware)
    const { data: signatures, error: signaturesError } = await auth.supabase
      .from("signatures")
      .select("signer_id, time_slot_id")
      .eq("session_id", sessionId)
      .eq("signer_type", "learner")
      .in("signer_id", learnerIds);

    if (signaturesError) {
      return NextResponse.json(
        { error: sanitizeDbError(signaturesError, "auto-absences signatures") },
        { status: 500 }
      );
    }

    // Build a Set of "learnerId::slotId" for O(1) lookup
    const signedSet = new Set(
      (signatures ?? []).map((s) => `${s.signer_id}::${s.time_slot_id}`)
    );

    // 5. Get all existing absences for this session to avoid duplicates
    const { data: existingAbsences, error: absencesError } = await auth.supabase
      .from("formation_absences")
      .select("learner_id, time_slot_id")
      .eq("session_id", sessionId);

    if (absencesError) {
      return NextResponse.json(
        { error: sanitizeDbError(absencesError, "auto-absences existing") },
        { status: 500 }
      );
    }

    const absenceSet = new Set(
      (existingAbsences ?? []).map((a) => `${a.learner_id}::${a.time_slot_id}`)
    );

    // 6. Build the list of absences to insert
    const absencesToInsert: {
      session_id: string;
      learner_id: string;
      time_slot_id: string;
      date: string;
      status: string;
      reason: string;
    }[] = [];

    let skipped = 0;

    for (const slot of slots) {
      const slotDate = slot.start_time.split("T")[0]; // Extract YYYY-MM-DD

      for (const learnerId of learnerIds) {
        const key = `${learnerId}::${slot.id}`;

        // Skip if already signed
        if (signedSet.has(key)) {
          skipped++;
          continue;
        }

        // Skip if absence already exists
        if (absenceSet.has(key)) {
          skipped++;
          continue;
        }

        absencesToInsert.push({
          session_id: sessionId,
          learner_id: learnerId,
          time_slot_id: slot.id,
          date: slotDate,
          status: "unjustified",
          reason: "Absence détectée automatiquement",
        });
      }
    }

    // 7. Bulk insert absences
    let created = 0;

    if (absencesToInsert.length > 0) {
      const { error: insertError } = await auth.supabase
        .from("formation_absences")
        .insert(absencesToInsert);

      if (insertError) {
        return NextResponse.json(
          { error: sanitizeDbError(insertError, "auto-absences insert") },
          { status: 500 }
        );
      }

      created = absencesToInsert.length;
    }

    // 8. Audit log
    logAudit({
      supabase: auth.supabase,
      entityId: auth.profile.entity_id,
      userId: auth.user.id,
      action: "create",
      resourceType: "auto_absences",
      resourceId: sessionId,
      details: {
        created,
        skipped,
        total_slots: slots.length,
        total_learners: learnerIds.length,
      },
    });

    return NextResponse.json({
      success: true,
      created,
      skipped,
      total_slots: slots.length,
      total_learners: learnerIds.length,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: sanitizeError(err, "auto-absences POST") },
      { status: 500 }
    );
  }
}
