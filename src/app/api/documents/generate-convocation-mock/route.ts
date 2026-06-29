/**
 * POST /api/documents/generate-convocation-mock
 *
 * Génère une convocation apprenant avec DONNÉES FACTICES — reproduit
 * exactement l'exemple Loris (Patrick ATTLAN, formation Managers de
 * Proximité, 10/01/2025, 2 créneaux matin + aprem). Credentials de
 * connexion mockés (email + password factice) à des fins de demo.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  CONVOCATION_APPRENANT_HTML,
  CONVOCATION_APPRENANT_FOOTER_TEMPLATE,
} from "@/lib/templates/convocation-apprenant";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import { generateLoginQrDataUrl } from "@/lib/services/login-qr-code";
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
      client_id: "mock-client",
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
      formation_time_slots: [
        {
          id: "slot-1",
          session_id: "mock-session-id",
          title: "Matin",
          start_time: "2025-01-10T09:00:00Z",
          end_time: "2025-01-10T12:00:00Z",
          slot_order: 1,
          module_title: null,
          module_objectives: null,
          module_themes: null,
          module_exercises: null,
          created_at: "2025-01-10T00:00:00Z",
          updated_at: "2025-01-10T00:00:00Z",
        },
        {
          id: "slot-2",
          session_id: "mock-session-id",
          title: "Après-midi",
          start_time: "2025-01-10T13:00:00Z",
          end_time: "2025-01-10T17:00:00Z",
          slot_order: 2,
          module_title: null,
          module_objectives: null,
          module_themes: null,
          module_exercises: null,
          created_at: "2025-01-10T00:00:00Z",
          updated_at: "2025-01-10T00:00:00Z",
        },
      ],
      // Loris template combine [Lieu] - [Adresse] → on met l'adresse séparée
      // dans session.location pour le mock, pour avoir le bon visuel.
    } as unknown as Session;

    // Mock : credentials factices pour montrer le format dans le PDF (le
    // template affiche {{email_apprenant}} + {{mot_de_passe_apprenant}} à
    // la place de l'ancien QR code magic link).
    const mockCredentials = {
      email: mockLearner.email ?? "patrick.attlan@example.fr",
      tempPassword: "DemoPass2025",
    };

    // Pour le mock, override session.location pour matcher le PDF Loris exactement
    const sessionForRender = { ...mockSession, location: "UNICIL, 11 RUE ARMENY 13006 MARSEILLE" } as Session;
    // Lot H : QR code connexion pour la preview mock. Mock uniquement :
    // slug de l'entité chargée si dispo, sinon "mr-formation" en dur (acceptable
    // car preview) → /login?entity=<slug>.
    const loginQrCodeDataUrl =
      (await generateLoginQrDataUrl(entity?.slug ?? "mr-formation")) ?? undefined;
    const context: ResolveContext = {
      session: sessionForRender,
      learner: mockLearner,
      entity,
      learnerCredentials: mockCredentials,
      loginQrCodeDataUrl,
    };
    const resolvedHtml = resolveDocumentVariables(CONVOCATION_APPRENANT_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CONVOCATION_APPRENANT_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "convocation_apprenant_mock",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "convocation_apprenant_mock",
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
      { error: sanitizeError(err, "generating mock convocation") },
      { status: 500 },
    );
  }
}
