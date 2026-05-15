/**
 * POST /api/documents/generate-convention-mock
 *
 * Génère une convention entreprise avec des DONNÉES FACTICES — pour tester
 * uniquement le rendu visuel de la nouvelle infra sans dépendre de vraies
 * sessions/clients en base.
 *
 * Utilisé par `/admin/test-convention` quand l'utilisateur clique sur
 * "Générer avec données factices".
 *
 * Pas de body — tout est mocké côté serveur. Retourne le même format que
 * /api/documents/generate-convention (pdfBase64 + metrics).
 *
 * Sécurité : reste auth admin/super_admin (pas d'endpoint public).
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import { CONVENTION_ENTREPRISE_HTML } from "@/lib/templates/convention-entreprise";
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

    // ── Auth ──────────────────────────────────────────────────────────────
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

    // ── Données factices ─────────────────────────────────────────────────
    // Charge l'entity réelle pour avoir le vrai logo + signature organisme,
    // tout le reste est mocké pour valider le rendu uniquement.
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
      contacts: [
        {
          id: "mock-contact-1",
          client_id: "mock-client-id",
          first_name: "Marie",
          last_name: "DUPONT",
          email: "marie.dupont@acme-formation.fr",
          phone: null,
          job_title: "Directrice RH",
          is_primary: true,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
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
      total_price: 1500,
      planned_hours: 14,
      visio_link: null,
      manager_id: null,
      program_id: null,
      is_planned: true,
      is_completed: false,
      is_dpc: false,
      is_subcontracted: false,
      catalog_pre_registration: false,
      updated_at: "2026-05-15T00:00:00Z",
      created_at: "2026-05-01T00:00:00Z",
      training: {
        id: "mock-training",
        entity_id: profile.entity_id,
        program_id: null,
        title: "Habilitation Électrique B1V",
        description: null,
        objectives: null,
        duration_hours: 14,
        max_participants: 10,
        price_per_person: 500,
        category: null,
        certification: "Attestation de formation à l'habilitation électrique",
        prerequisites: null,
        classification: "reglementaire",
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
        completion_rate: 0,
        enrolled_at: "2026-05-01T00:00:00Z",
        learner: l,
      })),
      formation_convention_documents: [],
      formation_evaluation_assignments: [],
      formation_satisfaction_assignments: [],
      formation_elearning_assignments: [],
    } as unknown as Session;

    // ── Résolution + génération ───────────────────────────────────────────
    const context: ResolveContext = {
      session: mockSession,
      client: mockClient,
      entity,
    };
    const resolvedHtml = resolveDocumentVariables(CONVENTION_ENTREPRISE_HTML, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "convention_entreprise_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "convention_entreprise_mock",
        // Pas de cache pour le mock — on veut toujours générer frais.
        session_updated_at: new Date().toISOString(),
      },
      options: {
        format: "A4",
        margins: { top: "20mm", right: "18mm", bottom: "20mm", left: "18mm" },
        printBackground: true,
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
      { error: sanitizeError(err, "generating mock convention") },
      { status: 500 },
    );
  }
}
