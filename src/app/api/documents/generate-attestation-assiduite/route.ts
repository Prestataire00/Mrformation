/**
 * POST /api/documents/generate-attestation-assiduite
 *
 * Génère une attestation d'assiduité pour 1 apprenant. Body :
 * `{ sessionId, learnerId }`. Lit la table `signatures` pour calculer
 * heures réalisées + taux (MVP : présent = 100%, absent = 0%).
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  ATTESTATION_ASSIDUITE_HTML,
  ATTESTATION_ASSIDUITE_FOOTER_TEMPLATE,
} from "@/lib/templates/attestation-assiduite";
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
  computeAttestationAttendance,
  type SlotSignatureRow,
} from "@/lib/services/learner-attendance";
import type { Session, Learner } from "@/lib/types";

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

    const { data: session } = await supabase
      .from("sessions")
      .select("*, training:trainings(*)")
      .eq("id", body.sessionId)
      .eq("entity_id", profile.entity_id)
      .single();
    if (!session) {
      return NextResponse.json(
        { error: "Session introuvable ou non autorisée" },
        { status: 404 },
      );
    }

    // Enrollment + learner + signatures + créneaux en parallèle
    const [{ data: enrollment }, { data: signatureRows }, { data: slotRows }] =
      await Promise.all([
        supabase
          .from("enrollments")
          .select("id, learner:learners(*)")
          .eq("session_id", body.sessionId)
          .eq("learner_id", body.learnerId)
          .maybeSingle(),
        supabase
          .from("signatures")
          .select("signer_id, time_slot_id")
          .eq("session_id", body.sessionId)
          .eq("signer_type", "learner"),
        supabase
          .from("formation_time_slots")
          .select("id, start_time, end_time")
          .eq("session_id", body.sessionId),
      ]);

    if (!enrollment || !(enrollment as { learner?: unknown }).learner) {
      return NextResponse.json(
        { error: "Apprenant non inscrit à cette session" },
        { status: 404 },
      );
    }
    const learner = (enrollment as unknown as { learner: Learner }).learner;

    const signedLearnerIds = new Set<string>(
      (signatureRows ?? [])
        .map((s) => (s as { signer_id: string | null }).signer_id)
        .filter((id): id is string => Boolean(id)),
    );

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    // Assiduité par créneau (null si session sans créneaux ou apprenant sans
    // signature slot-level → fallback présence intégrale dans le résolveur).
    const slots = (slotRows ?? []) as { id: string; start_time: string; end_time: string }[];
    const learnerAttendance =
      computeAttestationAttendance(
        slots,
        (signatureRows ?? []) as SlotSignatureRow[],
        body.learnerId,
      ) ?? undefined;

    const context: ResolveContext = {
      session: session as unknown as Session,
      learner,
      entity,
      signedLearnerIds,
      learnerAttendance,
    };
    const resolvedHtml = resolveDocumentVariables(ATTESTATION_ASSIDUITE_HTML, context);
    const resolvedFooter = resolveDocumentVariables(ATTESTATION_ASSIDUITE_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "attestation_assiduite",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "attestation_assiduite",
        session_id: body.sessionId,
        learner_id: body.learnerId,
        session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
        custom_variables: {
          present: signedLearnerIds.has(body.learnerId) ? "1" : "0",
          signed_count: String(signedLearnerIds.size),
          ...(learnerAttendance
            ? {
                signed_hours: String(learnerAttendance.signedHours),
                rate_pct: String(learnerAttendance.ratePct),
              }
            : {}),
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
      present: signedLearnerIds.has(body.learnerId),
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating attestation assiduité") },
      { status: 500 },
    );
  }
}
