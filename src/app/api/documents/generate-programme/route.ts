/**
 * POST /api/documents/generate-programme
 *
 * Génère le Programme de formation d'une session : titre, objectifs, profil,
 * prérequis, progression pédagogique (modules par jour/créneau), moyens
 * pédagogiques, évaluation, taux satisfaction, etc.
 *
 * Body : `{ sessionId: UUID }`. Le programme vient de `session.program_id`
 * (table programs avec content JSONB structuré). Fallback partiel sur
 * `session.training` si pas de programme attaché.
 *
 * Pas de notion d'entreprise (le programme est le même pour toutes les
 * entreprises de la session), donc pas de batch — 1 PDF par session.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  PROGRAMME_FORMATION_HTML,
  PROGRAMME_FORMATION_FOOTER_TEMPLATE,
} from "@/lib/templates/programme-formation";
import { PROGRAMME_FORMATION_V2_HTML } from "@/lib/templates/programme-formation-v2";
import { isEnrichedProgramContent } from "@/lib/utils/program-content";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import type { Session } from "@/lib/types";

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

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId est obligatoire" }, { status: 400 });
    }

    // Session avec program + training (gate entity_id côté admin/trainer).
    // Pour client/learner, on doit faire un check d'accessibilité plus fin
    // mais pour le scope actuel (admin test page surtout), on garde le gate
    // strict par entity_id sauf si le rôle est client/learner.
    let query = supabase
      .from("sessions")
      .select(
        "*, training:trainings(*), program:programs(*), enrollments:enrollments(*, learner:learners(*), client_id), formation_trainers:formation_trainers(trainer:trainers(*))",
      )
      .eq("id", body.sessionId);

    if (["admin", "super_admin", "trainer"].includes(profile.role)) {
      query = query.eq("entity_id", profile.entity_id);
    }

    const { data: session } = await query.single();
    if (!session) {
      return NextResponse.json(
        { error: "Session introuvable ou non autorisée" },
        { status: 404 },
      );
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const context: ResolveContext = {
      session: session as unknown as Session,
      entity,
    };
    // Lot A2 : programme enrichi → template v2 (format exemples client) ;
    // sinon template legacy (aucune régression).
    const programContent = (session as { program?: { content?: unknown } }).program?.content;
    const isEnriched = isEnrichedProgramContent(programContent);
    const tpl = isEnriched ? PROGRAMME_FORMATION_V2_HTML : PROGRAMME_FORMATION_HTML;
    const resolvedHtml = resolveDocumentVariables(tpl, context);
    const resolvedFooter = resolveDocumentVariables(PROGRAMME_FORMATION_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "programme_formation",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "programme_formation",
        session_id: body.sessionId,
        session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
        // Cache aussi invalidé si le programme est modifié
        custom_variables: {
          program_id: (session as { program_id?: string }).program_id ?? "",
          program_updated_at:
            ((session as { program?: { updated_at?: string } }).program?.updated_at) ?? "",
          // Invalide le cache au changement de template (v1 ↔ v2).
          template_version: isEnriched ? "v2" : "v1",
        },
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
      { error: sanitizeError(err, "generating programme") },
      { status: 500 },
    );
  }
}
