/**
 * POST /api/documents/send-conventions-batch-email
 *
 * Génère N conventions entreprise (1 par client rattaché) + envoie chacune
 * par email au contact primaire (ou 1er contact email valide). Story F2.3.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  CONVENTION_ENTREPRISE_HTML,
  CONVENTION_FOOTER_TEMPLATE,
} from "@/lib/templates/convention-entreprise";
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
import { loadClientsWithContacts } from "@/lib/services/load-client";
import type { Session, Client, Contact } from "@/lib/types";

function slugify(name: string): string {
  return (
    name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "entreprise"
  );
}

/** Email primaire = contact `is_primary=true` avec email, sinon 1er contact avec email. */
function pickClientEmail(client: Client): string | null {
  const contacts = (client.contacts ?? []) as Contact[];
  const withEmail = contacts.filter((c) => c.email);
  const primary = withEmail.find((c) => c.is_primary);
  return primary?.email ?? withEmail[0]?.email ?? null;
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
      .select("*, training:trainings(*), enrollments:enrollments(*, learner:learners(*), client_id), program:programs(*), formation_trainers:formation_trainers(trainer:trainers(*))")
      .eq("id", body.sessionId).eq("entity_id", profile.entity_id).single();
    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    const { data: links, error: linksError } = await supabase
      .from("formation_companies")
      .select("client_id")
      .eq("session_id", body.sessionId);
    if (linksError) {
      return NextResponse.json({ error: `Lecture formation_companies : ${linksError.message}` }, { status: 500 });
    }
    if (!links || links.length === 0) {
      return NextResponse.json({ error: "Aucune entreprise rattachée à cette session" }, { status: 404 });
    }

    // Charge clients + contacts en 2 queries séparées (contourne PGRST201)
    const clientIds = (links as Array<{ client_id: string | null }>)
      .map((l) => l.client_id)
      .filter((id): id is string => Boolean(id));
    const clientsMap = await loadClientsWithContacts(supabase, clientIds);
    const clients = Array.from(clientsMap.values());

    const entity = await loadEntitySettings(supabase, profile.entity_id);
    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });
    const sessionTitle = (session as { title?: string }).title ?? "Formation";

    const tasks: RecipientGenerationTask[] = clients.map((client) => ({
      ownerId: client.id,
      ownerName: client.company_name ?? client.id,
      ownerEmail: pickClientEmail(client),
      emailSubject: `Convention de formation - ${sessionTitle}`,
      emailHtmlBody: `<p>Bonjour,</p>
<p>Veuillez trouver ci-joint la convention de formation pour <strong>${sessionTitle}</strong>.</p>
<p>Merci de la retourner signée à notre attention.</p>
<p>Cordialement,<br/>L'équipe formation</p>`,
      emailTextBody: `Bonjour,\n\nVeuillez trouver ci-joint la convention de formation pour ${sessionTitle}.\n\nMerci de la retourner signée à notre attention.\n\nCordialement,\nL'équipe formation`,
      attachmentFilename: `convention-${slugify(client.company_name ?? "entreprise")}.pdf`,
      generatePdf: async () => {
        const context: ResolveContext = {
          session: session as unknown as Session,
          client,
          entity,
        };
        const html = resolveDocumentVariables(CONVENTION_ENTREPRISE_HTML, context);
        const footer = resolveDocumentVariables(CONVENTION_FOOTER_TEMPLATE, context);
        const result = await service.generate({
          entityId: profile.entity_id,
          docType: "convention_entreprise",
          html,
          cacheInputs: {
            doc_type: "convention_entreprise",
            session_id: body.sessionId,
            client_id: client.id,
            session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
            client_updated_at: (client as { updated_at?: string }).updated_at ?? null,
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
      docType: "convention_entreprise",
      ownerType: "company",
    });

    return NextResponse.json({ ...outcome, totalLatencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "sending conventions batch email") },
      { status: 500 },
    );
  }
}
