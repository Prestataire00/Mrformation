/**
 * POST /api/documents/send-emargements-individuels-batch-email
 *
 * Génère N feuilles d'émargement individuelles + envoie chacune par email.
 * Story F2.4.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  EMARGEMENT_INDIVIDUEL_HTML,
  EMARGEMENT_INDIVIDUEL_FOOTER_TEMPLATE,
} from "@/lib/templates/emargement-individuel";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import { loadSignaturesBySessionId } from "@/lib/services/load-signatures";
import {
  executeBatchEmailSend,
  type RecipientGenerationTask,
} from "@/lib/services/batch-email-handler";
import type { Session, Learner } from "@/lib/types";

function slugify(name: string): string {
  return (
    name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "apprenant"
  );
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles").select("id, entity_id, role").eq("id", user.id).single();
    if (!profile?.entity_id) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) return NextResponse.json({ error: "sessionId est obligatoire" }, { status: 400 });

    const { data: session } = await supabase
      .from("sessions")
      .select("*, training:trainings(*), formation_time_slots:formation_time_slots(*), formation_trainers:formation_trainers(trainer:trainers(*))")
      .eq("id", body.sessionId).eq("entity_id", profile.entity_id).single();
    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    const [{ data: enrollments, error: enrErr }, sigData] = await Promise.all([
      supabase.from("enrollments").select("learner:learners(*)").eq("session_id", body.sessionId),
      loadSignaturesBySessionId(supabase, body.sessionId),
    ]);
    if (enrErr) return NextResponse.json({ error: `Lecture enrollments : ${enrErr.message}` }, { status: 500 });

    const learners = ((enrollments ?? []) as unknown as { learner: Learner | null }[])
      .map((e) => e.learner).filter((l): l is Learner => Boolean(l));
    if (learners.length === 0) {
      return NextResponse.json({ error: "Aucun apprenant inscrit" }, { status: 404 });
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);
    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });
    const sessionTitle = (session as { title?: string }).title ?? "Formation";

    const tasks: RecipientGenerationTask[] = learners.map((learner) => ({
      ownerId: learner.id,
      ownerName: `${learner.last_name} ${learner.first_name}`,
      ownerEmail: learner.email,
      emailSubject: `Feuille d'émargement - ${sessionTitle}`,
      emailHtmlBody: `<p>Bonjour ${learner.first_name ?? ""},</p>
<p>Veuillez trouver ci-joint votre feuille d'émargement pour la formation <strong>${sessionTitle}</strong>.</p>
<p>Cordialement,<br/>L'équipe formation</p>`,
      emailTextBody: `Bonjour ${learner.first_name ?? ""},\n\nVeuillez trouver ci-joint votre feuille d'émargement pour la formation ${sessionTitle}.\n\nCordialement,\nL'équipe formation`,
      attachmentFilename: `emargement-${slugify(`${learner.last_name} ${learner.first_name}`)}.pdf`,
      generatePdf: async () => {
        const context: ResolveContext = {
          session: session as unknown as Session,
          learner,
          entity,
          signedLearnerIds: sigData.signedLearnerIds,
          signaturesById: sigData.signaturesById,
        };
        const html = resolveDocumentVariables(EMARGEMENT_INDIVIDUEL_HTML, context);
        const footer = resolveDocumentVariables(EMARGEMENT_INDIVIDUEL_FOOTER_TEMPLATE, context);
        const result = await service.generate({
          entityId: profile.entity_id,
          docType: "emargement_individuel",
          html,
          cacheInputs: {
            doc_type: "emargement_individuel",
            session_id: body.sessionId,
            learner_id: learner.id,
            session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
            custom_variables: { present: sigData.signedLearnerIds.has(learner.id) ? "1" : "0" },
          },
          options: {
            format: "A4",
            margins: { top: "18mm", right: "16mm", bottom: "22mm", left: "16mm" },
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: "<span></span>",
            footerTemplate: footer,
          },
        });
        return result.buffer;
      },
    }));

    const outcome = await executeBatchEmailSend(tasks, {
      supabase,
      entityId: profile.entity_id,
      profileId: profile.id,
      sessionId: body.sessionId,
      docType: "feuille_emargement",
      ownerType: "learner",
    });

    return NextResponse.json({ ...outcome, totalLatencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "sending emargements individuels batch email") },
      { status: 500 },
    );
  }
}
