/**
 * POST /api/documents/generate-certificat-diplome-mock
 *
 * Mock pour le certificat diplôme (Patrick ATTLAN + formation Managers de
 * Proximité, code 6a0859cd356c0).
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  CERTIFICAT_DIPLOME_HTML,
  CERTIFICAT_DIPLOME_FOOTER_TEMPLATE,
} from "@/lib/templates/certificat-diplome";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import type { Session, Learner } from "@/lib/types";

export async function POST(_request: NextRequest) {
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

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const mockLearner: Learner = {
      id: "mock-learner-attlan",
      first_name: "Patrick",
      last_name: "ATTLAN",
      email: "patrick.attlan@example.fr",
      phone: null,
      client_id: null,
      entity_id: profile.entity_id,
      profile_id: null,
      job_title: null,
      learner_type: "salarie",
      created_at: "2025-01-01T00:00:00Z",
    } as Learner;

    const mockSession: Session = {
      id: "mock-session-id",
      entity_id: profile.entity_id,
      training_id: null,
      title: "Accompagner les Managers de Proximité dans leurs missions auprès de leur équipe",
      start_date: "2025-01-10T09:00:00Z",
      end_date: "2025-01-10T17:00:00Z",
      location: "En présentiel",
      mode: "presentiel",
      status: "completed",
      max_participants: 10,
      trainer_id: null,
      notes: null,
      type: "intra",
      domain: null,
      description: null,
      total_price: 1900,
      planned_hours: 14,
      visio_link: null,
      manager_id: null,
      program_id: null,
      is_planned: true,
      is_completed: true,
      is_dpc: false,
      is_subcontracted: false,
      catalog_pre_registration: false,
      updated_at: "2025-01-10T00:00:00Z",
      created_at: "2024-12-01T00:00:00Z",
      training: null,
      enrollments: [],
      formation_trainers: [],
    } as unknown as Session;

    const context: ResolveContext = {
      session: mockSession,
      learner: mockLearner,
      entity,
      // Code fake matchant l'exemple Loris (sinon déterministe from IDs serait différent)
      certificateCode: "6a0859cd356c0",
    };
    const resolvedHtml = resolveDocumentVariables(CERTIFICAT_DIPLOME_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CERTIFICAT_DIPLOME_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "certificat_diplome_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "certificat_diplome_mock",
        session_updated_at: new Date().toISOString(),
      },
      options: {
        format: "A4",
        margins: { top: "0", right: "0", bottom: "0", left: "0" },
        printBackground: true,
        displayHeaderFooter: false,
        footerTemplate: resolvedFooter,
      },
    });

    return NextResponse.json({
      pdfBase64: result.buffer.toString("base64"),
      cacheHit: result.cacheHit,
      engineUsed: result.engineUsed,
      fileSizeBytes: result.fileSizeBytes,
      latencyMs: result.latencyMs,
      mock: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating mock certificat diplôme") },
      { status: 500 },
    );
  }
}
