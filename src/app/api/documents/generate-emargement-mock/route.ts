/**
 * POST /api/documents/generate-emargement-mock
 *
 * Génère une feuille d'émargement collectif avec DONNÉES FACTICES — pour
 * tester uniquement le rendu visuel sans dépendre de vraies sessions/clients
 * en base.
 *
 * Mock = 1 session sur 1 jour (10/01/2025), 2 créneaux (matin + après-midi),
 * 1 client ACME FORMATION SAS, 3 apprenants tous "Présent". L'entity (logo +
 * adresse + NDA) vient quand même de l'entité réelle de l'utilisateur.
 *
 * Pas de body. Retourne `{ pdfBase64, cacheHit, engineUsed, latencyMs, ... }`.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  EMARGEMENT_COLLECTIF_HTML,
  EMARGEMENT_FOOTER_TEMPLATE,
} from "@/lib/templates/emargement-collectif";
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
      id: "mock-client-id",
      entity_id: profile.entity_id,
      company_name: "ACME FORMATION SAS",
      siret: "12345678901234",
      address: "10 Boulevard Haussmann",
      postal_code: "75009",
      city: "Paris",
      website: null,
      sector: null,
      naf_code: null,
      bpf_category: null,
      status: "active",
      notes: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      contacts: [],
    } as Client;

    const mockLearners: Learner[] = [
      {
        id: "mock-learner-1",
        first_name: "Pierre",
        last_name: "MARTIN",
        email: "pierre.martin@acme.fr",
        phone: null,
        client_id: "mock-client-id",
        entity_id: profile.entity_id,
        profile_id: null,
        job_title: null,
        learner_type: "salarie",
        created_at: "2026-01-01T00:00:00Z",
      } as Learner,
      {
        id: "mock-learner-2",
        first_name: "Sophie",
        last_name: "BERNARD",
        email: "sophie.bernard@acme.fr",
        phone: null,
        client_id: "mock-client-id",
        entity_id: profile.entity_id,
        profile_id: null,
        job_title: null,
        learner_type: "salarie",
        created_at: "2026-01-01T00:00:00Z",
      } as Learner,
      {
        id: "mock-learner-3",
        first_name: "Thomas",
        last_name: "PETIT",
        email: "thomas.petit@acme.fr",
        phone: null,
        client_id: "mock-client-id",
        entity_id: profile.entity_id,
        profile_id: null,
        job_title: null,
        learner_type: "salarie",
        created_at: "2026-01-01T00:00:00Z",
      } as Learner,
    ];

    // 1 jour de formation, mock formateur "MARTINEAU Brigitte"
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
      max_participants: 12,
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
        objectives: null,
        duration_hours: 14,
        max_participants: 12,
        price_per_person: 158,
        category: null,
        certification: null,
        prerequisites: null,
        classification: null,
        nsf_code: null,
        nsf_label: null,
        bpf_objective: null,
        bpf_funding_type: null,
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      enrollments: mockLearners.map((l, i) => ({
        id: `mock-enrollment-${i}`,
        session_id: "mock-session-id",
        learner_id: l.id,
        client_id: "mock-client-id",
        status: "registered",
        completion_rate: 1,
        enrolled_at: "2024-12-15T00:00:00Z",
        learner: l,
      })),
      formation_trainers: [
        {
          trainer: {
            id: "mock-trainer-1",
            first_name: "Brigitte",
            last_name: "MARTINEAU",
            email: "brigitte.martineau@example.fr",
            entity_id: profile.entity_id,
          },
        },
      ],
      formation_convention_documents: [],
      formation_evaluation_assignments: [],
      formation_satisfaction_assignments: [],
      formation_elearning_assignments: [],
    } as unknown as Session;

    // Fake signature SVG inline (encodée base64) pour montrer le visuel
    // signature dans le mock (vs texte "Présent" sans image).
    const fakeSigSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120" height="40"><path d="M5 30 Q 20 5, 35 25 T 65 20 Q 80 30, 95 15 T 115 22" stroke="#1e3a8a" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
    const fakeSigDataUrl = `data:image/svg+xml;base64,${Buffer.from(fakeSigSvg).toString("base64")}`;
    const signaturesById = new Map<string, string>([
      ["mock-learner-1", fakeSigDataUrl],
      ["mock-learner-2", fakeSigDataUrl],
      ["mock-learner-3", fakeSigDataUrl],
    ]);

    const context: ResolveContext = {
      session: mockSession,
      client: mockClient,
      entity,
      signaturesById,
      // Pas de signedLearnerIds → renderUnsignedCell : cellule vide si session future,
      // "Non signé" si passée (cf src/lib/utils/resolve-variables.ts:renderUnsignedCell)
    };
    const resolvedHtml = resolveDocumentVariables(EMARGEMENT_COLLECTIF_HTML, context);
    const resolvedFooter = resolveDocumentVariables(EMARGEMENT_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "emargement_collectif_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "emargement_collectif_mock",
        // Pas de cache effectif — on veut toujours frais en mode test.
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
      { error: sanitizeError(err, "generating mock émargement") },
      { status: 500 },
    );
  }
}
