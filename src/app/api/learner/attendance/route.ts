import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import {
  computeLearnerAttendance,
  type AttendanceSessionInput,
  type AttendanceSlot,
} from "@/lib/services/learner-attendance";

/**
 * GET /api/learner/attendance
 *
 * Assiduité de l'apprenant connecté : présence (créneaux émargés) par session.
 *
 * Pourquoi service_role : les signatures apprenant portent `signer_id = learners.id`
 * et la policy RLS `signatures_learner_read` filtre sur `auth.uid()` (= profile_id) →
 * l'apprenant ne peut PAS lire ses propres signatures côté client. On lit donc en
 * service_role MAIS en bornant STRICTEMENT aux fiches `learners` de l'utilisateur
 * authentifié (résolues depuis `auth.uid()`), donc aucune fuite cross-apprenant.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const empty = { sessions: [], overall_rate_pct: 0, total_signed_hours: 0 };

    // Fiche(s) apprenant de l'utilisateur (multi-fiche défensif)
    const { data: learners } = await admin
      .from("learners")
      .select("id")
      .eq("profile_id", user.id);
    const learnerIds = ((learners as Array<{ id: string }> | null) ?? []).map((l) => l.id);
    if (learnerIds.length === 0) return NextResponse.json({ data: empty });

    // Sessions inscrites (non annulées)
    const { data: enr } = await admin
      .from("enrollments")
      .select("status, session:sessions(id, title)")
      .in("learner_id", learnerIds)
      .neq("status", "cancelled");
    const titleBySession = new Map<string, string>();
    for (const e of (enr as Array<{ session: { id: string; title: string } | null }> | null) ?? []) {
      if (e.session) titleBySession.set(e.session.id, e.session.title);
    }
    const sessionIds = [...titleBySession.keys()];
    if (sessionIds.length === 0) return NextResponse.json({ data: empty });

    // Créneaux + signatures de l'apprenant (bornées à ses fiches)
    const [{ data: slots }, { data: sigs }] = await Promise.all([
      admin
        .from("formation_time_slots")
        .select("id, session_id, start_time, end_time")
        .in("session_id", sessionIds),
      admin
        .from("signatures")
        .select("session_id, time_slot_id")
        .in("session_id", sessionIds)
        .in("signer_id", learnerIds)
        .eq("signer_type", "learner"),
    ]);

    const slotsBySession = new Map<string, AttendanceSlot[]>();
    for (const sl of (slots as Array<{ id: string; session_id: string; start_time: string; end_time: string }> | null) ?? []) {
      const arr = slotsBySession.get(sl.session_id) ?? [];
      arr.push({ id: sl.id, start_time: sl.start_time, end_time: sl.end_time });
      slotsBySession.set(sl.session_id, arr);
    }

    const signedBySession = new Map<string, string[]>();
    for (const sg of (sigs as Array<{ session_id: string; time_slot_id: string | null }> | null) ?? []) {
      if (!sg.time_slot_id) continue;
      const arr = signedBySession.get(sg.session_id) ?? [];
      arr.push(sg.time_slot_id);
      signedBySession.set(sg.session_id, arr);
    }

    const inputs: AttendanceSessionInput[] = sessionIds
      .map((sid) => ({
        session_id: sid,
        title: titleBySession.get(sid) ?? "Session",
        slots: slotsBySession.get(sid) ?? [],
        signedSlotIds: signedBySession.get(sid) ?? [],
      }))
      // Une session sans créneau n'a pas d'assiduité mesurable → on l'omet.
      .filter((s) => s.slots.length > 0);

    return NextResponse.json({ data: computeLearnerAttendance(inputs) });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "learner/attendance GET") }, { status: 500 });
  }
}
