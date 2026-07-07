/**
 * POST /api/documents/generate-certificat-realisation
 *
 * Génère un certificat de réalisation pour 1 apprenant d'une session.
 * Body : `{ sessionId: UUID, learnerId: UUID }`. Vérifie enrollment.
 *
 * Le client (= entreprise présentatrice) est récupéré via
 * `enrollment.client_id` → `clients`.
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
import type { Session, Client, Learner } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("entity_id, role")
      .eq("id", user.id)
      .single();
    if (!profile?.entity_id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const body = (await request.json()) as { sessionId?: string; learnerId?: string };
    if (!body.sessionId || !body.learnerId) {
      return NextResponse.json(
        { error: "sessionId et learnerId sont obligatoires" },
        { status: 400 },
      );
    }

    // Session (gate entity_id) + training + program. `program:programs(*)` est
    // requis pour la balise objectifs (fallback liste_objectifs_pedagogiques →
    // program.objectives, priorité 2), sinon la balise tombe vide.
    const { data: session } = await supabase
      .from("sessions")
      .select("*, training:trainings(*), program:programs(*)")
      .eq("id", body.sessionId)
      .eq("entity_id", profile.entity_id)
      .single();
    if (!session) {
      return NextResponse.json(
        { error: "Session introuvable ou non autorisée" },
        { status: 404 },
      );
    }

    // Enrollment + learner + client (entreprise présentatrice)
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id, client_id, learner:learners(*)")
      .eq("session_id", body.sessionId)
      .eq("learner_id", body.learnerId)
      .maybeSingle();
    if (!enrollment || !(enrollment as { learner?: unknown }).learner) {
      return NextResponse.json(
        { error: "Apprenant non inscrit à cette session" },
        { status: 404 },
      );
    }
    const enrTyped = enrollment as unknown as { client_id: string | null; learner: Learner };
    const learner = enrTyped.learner;

    let client: Client | null = null;
    if (enrTyped.client_id) {
      const { data: c } = await supabase
        .from("clients")
        .select("*, contacts(*)")
        .eq("id", enrTyped.client_id)
        .maybeSingle();
      client = (c as unknown as Client) ?? null;
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const context: ResolveContext = {
      session: session as unknown as Session,
      learner,
      client,
      entity,
    };
    const resolvedHtml = resolveDocumentVariables(CERTIFICAT_REALISATION_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CERTIFICAT_REALISATION_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "certificat_realisation",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "certificat_realisation",
        session_id: body.sessionId,
        learner_id: body.learnerId,
        client_id: enrTyped.client_id ?? null,
        session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
      },
      options: {
        format: "A4",
        margins: { top: "18mm", right: "16mm", bottom: "22mm", left: "16mm" },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: resolvedFooter,
      },
    });

    return NextResponse.json({
      pdfBase64: result.buffer.toString("base64"),
      cacheHit: result.cacheHit,
      engineUsed: result.engineUsed,
      fileSizeBytes: result.fileSizeBytes,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating certificat") },
      { status: 500 },
    );
  }
}
