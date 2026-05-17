/**
 * POST /api/documents/send-certificats-realisation-batch-email
 *
 * Génère N certificats de réalisation + envoie chacun par email. Story F2.1.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  CERTIFICAT_REALISATION_HTML,
  CERTIFICAT_REALISATION_FOOTER_TEMPLATE,
} from "@/lib/templates/certificat-realisation";
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
import type { Session, Client, Learner } from "@/lib/types";

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

    const { data: enrollments, error: enrErr } = await supabase
      .from("enrollments").select("client_id, learner:learners(*)").eq("session_id", body.sessionId);
    if (enrErr) return NextResponse.json({ error: `Lecture enrollments : ${enrErr.message}` }, { status: 500 });

    const enrolled = (enrollments ?? []) as unknown as { client_id: string | null; learner: Learner | null }[];
    const validEnrolled = enrolled.filter((e) => e.learner);
    if (validEnrolled.length === 0) {
      return NextResponse.json({ error: "Aucun apprenant inscrit" }, { status: 404 });
    }

    const clientIds = [...new Set(validEnrolled.map((e) => e.client_id).filter((id): id is string => Boolean(id)))];
    const clientById = new Map<string, Client>();
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from("clients").select("*, contacts(*)").in("id", clientIds);
      ((clients ?? []) as unknown as Client[]).forEach((c) => clientById.set(c.id, c));
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);
    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });
    const sessionTitle = (session as { title?: string }).title ?? "Formation";

    const tasks: RecipientGenerationTask[] = validEnrolled.map((enr) => {
      const learner = enr.learner!;
      const client = enr.client_id ? clientById.get(enr.client_id) ?? null : null;
      return {
        ownerId: learner.id,
        ownerName: `${learner.last_name} ${learner.first_name}`,
        ownerEmail: learner.email,
        emailSubject: `Certificat de réalisation - ${sessionTitle}`,
        emailHtmlBody: `<p>Bonjour ${learner.first_name ?? ""},</p>
<p>Veuillez trouver ci-joint votre certificat de réalisation pour la formation <strong>${sessionTitle}</strong>.</p>
<p>Cordialement,<br/>L'équipe formation</p>`,
        emailTextBody: `Bonjour ${learner.first_name ?? ""},\n\nVeuillez trouver ci-joint votre certificat de réalisation pour la formation ${sessionTitle}.\n\nCordialement,\nL'équipe formation`,
        attachmentFilename: `certificat-${slugify(`${learner.last_name} ${learner.first_name}`)}.pdf`,
        generatePdf: async () => {
          const context: ResolveContext = { session: session as unknown as Session, learner, client, entity };
          const html = resolveDocumentVariables(CERTIFICAT_REALISATION_HTML, context);
          const footer = resolveDocumentVariables(CERTIFICAT_REALISATION_FOOTER_TEMPLATE, context);
          const result = await service.generate({
            entityId: profile.entity_id,
            docType: "certificat_realisation",
            html,
            cacheInputs: {
              doc_type: "certificat_realisation",
              session_id: body.sessionId,
              learner_id: learner.id,
              client_id: enr.client_id ?? null,
              session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
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
      };
    });

    const outcome = await executeBatchEmailSend(tasks, {
      supabase,
      entityId: profile.entity_id,
      profileId: profile.id,
      sessionId: body.sessionId,
      docType: "certificat_realisation",
      ownerType: "learner",
    });

    return NextResponse.json({ ...outcome, totalLatencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "sending certificats realisation batch email") },
      { status: 500 },
    );
  }
}
