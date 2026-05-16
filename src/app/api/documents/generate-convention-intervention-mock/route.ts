/**
 * POST /api/documents/generate-convention-intervention-mock
 *
 * Génère un contrat de sous-traitance formateur avec DONNÉES FACTICES —
 * formation "Habilitation Électrique B1V" + formateur "Brigitte MARTINEAU"
 * avec adresse, SIRET, NDA, extranet link et coût 1200€ HT. Permet de
 * valider le rendu visuel sans dépendre de la migration SQL prod
 * (`add_trainer_subcontracting_fields.sql`).
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  CONVENTION_INTERVENTION_HTML,
  CONVENTION_INTERVENTION_FOOTER_TEMPLATE,
} from "@/lib/templates/convention-intervention";
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
      id: "mock-trainer-id",
      profile_id: null,
      entity_id: profile.entity_id,
      first_name: "Brigitte",
      last_name: "MARTINEAU",
      email: "brigitte.martineau@example.fr",
      phone: "06 12 34 56 78",
      type: "external",
      bio: null,
      hourly_rate: 75,
      availability_notes: null,
      created_at: "2025-01-01T00:00:00Z",
      address: "5 rue de la République",
      postal_code: "13001",
      city: "Marseille",
      siret: "98765432109876",
      nda: "93132099999",
      extranet_link: "https://extranet.brigitte-formation.fr/programme/habilitation-b1v",
      signature_url: null,
      // champ ad-hoc injecté pour le resolver
      _agreed_cost_ht: 1200,
    } as unknown as Trainer;

    const mockSession: Session = {
      id: "mock-session-id",
      entity_id: profile.entity_id,
      training_id: null,
      title: "Habilitation Électrique B1V — Recyclage",
      start_date: "2026-06-15T09:00:00Z",
      end_date: "2026-06-16T17:00:00Z",
      location: "Centre de formation MR, 12 rue Saint-Ferréol, 13001 Marseille",
      mode: "presentiel",
      status: "upcoming",
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
      is_completed: false,
      is_dpc: false,
      is_subcontracted: true,
      catalog_pre_registration: false,
      updated_at: "2026-05-15T00:00:00Z",
      created_at: "2026-05-01T00:00:00Z",
      training: null,
      enrollments: [],
      formation_trainers: [{ trainer: mockTrainer }],
    } as unknown as Session;

    const context: ResolveContext = {
      session: mockSession,
      trainer: mockTrainer,
      entity,
    };
    const resolvedHtml = resolveDocumentVariables(CONVENTION_INTERVENTION_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CONVENTION_INTERVENTION_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "convention_intervention_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "convention_intervention_mock",
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
      { error: sanitizeError(err, "generating mock convention intervention") },
      { status: 500 },
    );
  }
}
