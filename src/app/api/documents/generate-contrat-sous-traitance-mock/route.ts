/**
 * POST /api/documents/generate-contrat-sous-traitance-mock
 *
 * Génère un contrat de sous-traitance (version Qualiopi étendue, 8 articles)
 * avec DONNÉES FACTICES — formation "Habilitation Électrique B1V" + formateur
 * "Patrick ATTLAN" (OF Sécurité Formation 13, Marseille) + 3 stagiaires fictifs.
 * Permet de valider le rendu visuel sans dépendre de données prod.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  CONTRAT_SOUS_TRAITANCE_HTML,
  CONTRAT_SOUS_TRAITANCE_FOOTER_TEMPLATE,
} from "@/lib/templates/contrat-sous-traitance";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import type { Session, Trainer } from "@/lib/types";

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

    const mockTrainer = {
      id: "mock-trainer-cst-id",
      profile_id: null,
      entity_id: profile.entity_id,
      first_name: "Patrick",
      last_name: "ATTLAN",
      email: "p.attlan@securite-formation13.fr",
      phone: "06 11 22 33 44",
      type: "external",
      bio: null,
      hourly_rate: 85,
      availability_notes: null,
      created_at: "2025-01-01T00:00:00Z",
      address: "12 avenue du Prado, 13008 Marseille",
      postal_code: "13008",
      city: "Marseille",
      siret: "45678901234567",
      nda: "93131012345",
      extranet_link: null,
      signature_url: null,
      _agreed_cost_ht: null,
    } as unknown as Trainer;

    const mockSession: Session = {
      id: "mock-session-cst-id",
      entity_id: profile.entity_id,
      training_id: null,
      title: "Habilitation Électrique B1V — Initiale",
      start_date: "2026-07-10T08:00:00Z",
      end_date: "2026-07-11T17:00:00Z",
      location: "Plateau technique MR, 12 rue Saint-Ferréol, 13001 Marseille",
      mode: "presentiel",
      status: "upcoming",
      max_participants: 8,
      trainer_id: null,
      notes: null,
      type: "intra",
      domain: null,
      description: null,
      total_price: 2400,
      planned_hours: 14,
      visio_link: null,
      manager_id: null,
      program_id: null,
      is_planned: true,
      is_completed: false,
      is_dpc: false,
      is_subcontracted: true,
      catalog_pre_registration: false,
      updated_at: "2026-06-01T00:00:00Z",
      created_at: "2026-05-15T00:00:00Z",
      training: null,
      enrollments: [
        {
          id: "mock-enroll-1",
          learner: { id: "l1", first_name: "Sophie", last_name: "MARTIN", email: null },
        },
        {
          id: "mock-enroll-2",
          learner: { id: "l2", first_name: "Jean-Pierre", last_name: "DUPONT", email: null },
        },
        {
          id: "mock-enroll-3",
          learner: { id: "l3", first_name: "Amina", last_name: "BENALI", email: null },
        },
      ],
      formation_trainers: [{ trainer: mockTrainer }],
    } as unknown as Session;

    const context: ResolveContext = {
      session: mockSession,
      trainer: mockTrainer,
      entity,
    };
    const resolvedHtml = resolveDocumentVariables(CONTRAT_SOUS_TRAITANCE_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CONTRAT_SOUS_TRAITANCE_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "contrat_sous_traitance_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "contrat_sous_traitance_mock",
        session_updated_at: new Date().toISOString(),
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
      mock: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating mock contrat sous-traitance") },
      { status: 500 },
    );
  }
}
