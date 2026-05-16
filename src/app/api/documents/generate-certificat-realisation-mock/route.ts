/**
 * POST /api/documents/generate-certificat-realisation-mock
 *
 * Génère un certificat de réalisation avec DONNÉES FACTICES — reproduit
 * l'exemple Loris (Patrick ATTLAN, UNICIL - 13006, formation Managers de
 * Proximité, 10/01/2025, ACQUIS).
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

    const mockClient: Client = {
      id: "mock-client-unicil",
      entity_id: profile.entity_id,
      company_name: "UNICIL - 13006",
      siret: null,
      address: "11 RUE ARMENY",
      postal_code: "13006",
      city: "MARSEILLE",
      website: null,
      sector: null,
      naf_code: null,
      bpf_category: null,
      status: "active",
      notes: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      contacts: [],
    } as Client;

    const mockLearner: Learner = {
      id: "mock-learner-attlan",
      first_name: "Patrick",
      last_name: "ATTLAN",
      email: "patrick.attlan@example.fr",
      phone: null,
      client_id: mockClient.id,
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
      location: "UNICIL, 11 RUE ARMENY 13006 MARSEILLE",
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
      training: {
        id: "mock-training",
        entity_id: profile.entity_id,
        program_id: null,
        title: "Manager de proximité",
        description: null,
        objectives: [
          "Pratiquer l'écoute active avec le gestionnaire pour entendre et voir les signes de difficulté",
          "Développer la confiance et favoriser la parole du gestionnaire",
          "Favoriser la relation gagnant-gagnant tout en restant factuel",
          "Favoriser la parole de groupe et donner un cadre commun clair",
          "Faciliter les relations pour des échanges constructifs : soutenir le gestionnaire dans le respect de la politique tout en satisfaisant le locataire.",
        ].join("\n"),
        duration_hours: 14,
        max_participants: 10,
        price_per_person: 190,
        category: null,
        certification: null,
        prerequisites: null,
        classification: null,
        nsf_code: null,
        nsf_label: null,
        bpf_objective: null,
        bpf_funding_type: null,
        is_active: true,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      },
      enrollments: [],
      formation_trainers: [],
    } as unknown as Session;

    const context: ResolveContext = {
      session: mockSession,
      learner: mockLearner,
      client: mockClient,
      entity,
    };
    const resolvedHtml = resolveDocumentVariables(CERTIFICAT_REALISATION_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CERTIFICAT_REALISATION_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "certificat_realisation_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "certificat_realisation_mock",
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
      { error: sanitizeError(err, "generating mock certificat") },
      { status: 500 },
    );
  }
}
