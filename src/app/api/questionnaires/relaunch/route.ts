import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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

    const { data: entity } = await auth.supabase
      .from("entities")
      .select("name")
      .eq("id", session.entity_id)
      .single();

    const entityName = entity?.name || "MR FORMATION";

    const { data: learners } = await auth.supabase
      .from("learners")
      .select("id, first_name, last_name, email")
      .in("id", learner_ids);

    if (!learners?.length) {
      return NextResponse.json({ error: "Aucun apprenant trouvé" }, { status: 404 });
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app").replace(/\/+$/, "");
    const fromAddress = entityName.toLowerCase().includes("c3v")
      ? "C3V Formation <noreply@c3vformation.fr>"
      : "MR Formation <noreply@mrformation.fr>";

    let sent = 0;
    let failed = 0;

    for (const learner of learners) {
      if (!learner.email) { failed++; continue; }

      const accessUrl = `${baseUrl}/learner/questionnaires?session=${session_id}`;

      try {
        if (resend) {
          await resend.emails.send({
            from: fromAddress,
            to: [learner.email],
            subject: `Rappel : Questionnaire à compléter — ${session.title}`,
            html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#374151;">
              <p>Bonjour ${learner.first_name},</p>
              <p>Vous avez un questionnaire à compléter pour la formation <strong>${session.title}</strong>.</p>
              <p style="margin:20px 0;"><a href="${accessUrl}" style="display:inline-block;background:#374151;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Accéder au questionnaire</a></p>
              <p>Cordialement,<br>L'équipe ${entityName}</p>
            </div>`,
          });
        }
        sent++;
      } catch (err) {
        console.error("[relaunch] email failed", learner.id, err);
        failed++;
      }
    }

    return NextResponse.json({ sent, failed });
  } catch (err) {
    console.error("[relaunch]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
