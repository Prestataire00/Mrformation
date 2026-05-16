/**
 * POST /api/documents/generate-emargement
 *
 * Génère une feuille d'émargement collectif pour 1 entreprise d'une session.
 *
 * Body : `{ sessionId: UUID, clientId: UUID }`. Filtre les apprenants par
 * `client_id` (cf helpers PR #13 multi-entreprises) et lit la table
 * `signatures` pour déterminer le statut Présent/Absent de chaque learner.
 *
 * Retour : `{ pdfBase64, cacheHit, engineUsed, latencyMs, signedCount,
 * totalLearners }`.
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
import { loadSignaturesBySessionId } from "@/lib/services/load-signatures";
import type { Session, Client } from "@/lib/types";

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

    const body = (await request.json()) as { sessionId?: string; clientId?: string };
    if (!body.sessionId || !body.clientId) {
      return NextResponse.json(
        { error: "sessionId et clientId sont obligatoires" },
        { status: 400 },
      );
    }

    // ── Session (gate entity_id) ──────────────────────────────────────────
    const { data: session } = await supabase
      .from("sessions")
      .select(
        "*, training:trainings(*), enrollments:enrollments(*, learner:learners(*), client_id), program:programs(*), formation_trainers:formation_trainers(trainer:trainers(*))",
      )
      .eq("id", body.sessionId)
      .eq("entity_id", profile.entity_id)
      .single();

    if (!session) {
      return NextResponse.json(
        { error: "Session introuvable ou non autorisée" },
        { status: 404 },
      );
    }

    // ── Lien formation_companies (preuve d'accès) ─────────────────────────
    const { data: link } = await supabase
      .from("formation_companies")
      .select("client_id")
      .eq("session_id", body.sessionId)
      .eq("client_id", body.clientId)
      .maybeSingle();

    if (!link) {
      return NextResponse.json(
        { error: "Client non rattaché à cette session (vérifier formation_companies)" },
        { status: 404 },
      );
    }

    // ── Charge client + entity + signatures en parallèle ─────────────────
    const [{ data: client }, entity, sigData] = await Promise.all([
      supabase.from("clients").select("*, contacts(*)").eq("id", body.clientId).single(),
      loadEntitySettings(supabase, profile.entity_id),
      loadSignaturesBySessionId(supabase, body.sessionId),
    ]);

    if (!client) {
      return NextResponse.json(
        { error: "Client introuvable (FK cassée ?)" },
        { status: 404 },
      );
    }

    const context: ResolveContext = {
      session: session as unknown as Session,
      client: client as unknown as Client,
      entity,
      signedLearnerIds: sigData.signedLearnerIds,
      signaturesById: sigData.signaturesById,
    };
    const resolvedHtml = resolveDocumentVariables(EMARGEMENT_COLLECTIF_HTML, context);
    const resolvedFooter = resolveDocumentVariables(EMARGEMENT_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "emargement_collectif",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "emargement_collectif",
        session_id: body.sessionId,
        client_id: body.clientId,
        session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
        client_updated_at: (client as { updated_at?: string }).updated_at ?? null,
        // Cache invalidé si signatures bougent
        custom_variables: { signed_count: String(sigData.signedLearnerIds.size) },
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
      signedCount: sigData.signedLearnerIds.size,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating émargement") },
      { status: 500 },
    );
  }
}
