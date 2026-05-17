/**
 * POST /api/documents/send-attestations-assiduite-batch-email
 *
 * Génère N attestations d'assiduité + envoie chacune par email. Story F2.2.
 * Récupère les signatures pour calculer le flag `present` per learner.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  ATTESTATION_ASSIDUITE_HTML,
  ATTESTATION_ASSIDUITE_FOOTER_TEMPLATE,
} from "@/lib/templates/attestation-assiduite";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
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
      .from("sessions").select("*, training:trainings(*)")
      .eq("id", body.sessionId).eq("entity_id", profile.entity_id).single();
    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    const [{ data: enrollments, error: enrErr }, { data: signatureRows }] = await Promise.all([
      supabase.from("enrollments").select("learner:learners(*)").eq("session_id", body.sessionId),
      supabase.from("signatures").select("signer_id")
        .eq("session_id", body.sessionId).eq("signer_type", "learner"),
    ]);
    if (enrErr) return NextResponse.json({ error: `Lecture enrollments : ${enrErr.message}` }, { status: 500 });

    const learners = ((enrollments ?? []) as unknown as { learner: Learner | null }[])
      .map((e) => e.learner).filter((l): l is Learner => Boolean(l));
    if (learners.length === 0) {
      return NextResponse.json({ error: "Aucun apprenant inscrit" }, { status: 404 });
    }

    const signedLearnerIds = new Set<string>(
      (signatureRows ?? [])
        .map((s) => (s as { signer_id: string | null }).signer_id)
        .filter((id): id is string => Boolean(id)),
    );

    const entity = await loadEntitySettings(supabase, profile.entity_id);
    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });
    const sessionTitle = (session as { title?: string }).title ?? "Formation";

    const tasks: RecipientGenerationTask[] = learners.map((learner) => ({
      ownerId: learner.id,
      ownerName: `${learner.last_name} ${learner.first_name}`,
      ownerEmail: learner.email,
      emailSubject: `Attestation d'assiduité - ${sessionTitle}`,
      emailHtmlBody: `<p>Bonjour ${learner.first_name ?? ""},</p>
<p>Veuillez trouver ci-joint votre attestation d'assiduité pour la formation <strong>${sessionTitle}</strong>.</p>
<p>Cordialement,<br/>L'équipe formation</p>`,
      emailTextBody: `Bonjour ${learner.first_name ?? ""},\n\nVeuillez trouver ci-joint votre attestation d'assiduité pour la formation ${sessionTitle}.\n\nCordialement,\nL'équipe formation`,
      attachmentFilename: `attestation-${slugify(`${learner.last_name} ${learner.first_name}`)}.pdf`,
      generatePdf: async () => {
        const context: ResolveContext = {
          session: session as unknown as Session,
          learner,
          entity,
          signedLearnerIds,
        };
        const html = resolveDocumentVariables(ATTESTATION_ASSIDUITE_HTML, context);
        const footer = resolveDocumentVariables(ATTESTATION_ASSIDUITE_FOOTER_TEMPLATE, context);
        const result = await service.generate({
          entityId: profile.entity_id,
          docType: "attestation_assiduite",
          html,
          cacheInputs: {
            doc_type: "attestation_assiduite",
            session_id: body.sessionId,
            learner_id: learner.id,
            session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
            custom_variables: { present: signedLearnerIds.has(learner.id) ? "1" : "0" },
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
      docType: "attestation_assiduite",
      ownerType: "learner",
    });

    return NextResponse.json({ ...outcome, totalLatencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "sending attestations assiduite batch email") },
      { status: 500 },
    );
  }
}
