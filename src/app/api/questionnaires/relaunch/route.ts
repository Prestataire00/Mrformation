import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { enqueueEmails } from "@/lib/services/email-queue";

export async function POST(req: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { session_id, learner_ids } = await req.json();

    if (!session_id || !Array.isArray(learner_ids) || learner_ids.length === 0) {
      return NextResponse.json({ error: "session_id et learner_ids requis" }, { status: 400 });
    }

    const { data: session } = await auth.supabase
      .from("sessions")
      .select("id, title, entity_id")
      .eq("id", session_id)
      .single();

    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    const { data: learners } = await auth.supabase
      .from("learners")
      .select("id, first_name, email")
      .in("id", learner_ids);

    if (!learners?.length) {
      return NextResponse.json({ error: "Aucun apprenant trouvé" }, { status: 404 });
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app").replace(/\/+$/, "");
    const accessUrl = `${baseUrl}/learner/questionnaires?session=${session_id}`;

    const payloads = learners
      .filter((l) => !!l.email)
      .map((l) => ({
        to: l.email!,
        subject: `Rappel : Questionnaire à compléter — ${session.title}`,
        body: `Bonjour ${l.first_name},\n\nVous avez un questionnaire à compléter pour la formation "${session.title}".\n\nAccéder au questionnaire : ${accessUrl}\n\nCordialement,\nL'équipe formation`,
        entity_id: session.entity_id,
        session_id: session.id,
        recipient_type: "learner" as const,
        recipient_id: l.id,
        sent_by: auth.profile.id,
      }));

    const skipped = learners.length - payloads.length;
    const { inserted } = await enqueueEmails(auth.supabase, payloads);

    return NextResponse.json({ enqueued: inserted, skipped });
  } catch (err) {
    console.error("[relaunch]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
