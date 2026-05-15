/**
 * POST /api/documents/generate-convention
 *
 * Génère une convention entreprise via la nouvelle infra : template HTML +
 * resolver unifié + DocumentGenerationService (Puppeteer + cache + events).
 *
 * Story B-Convention — première story type du Lot B. Cf
 * `bmad_output/planning-artifacts/epics-documents.md`.
 *
 * Body : `{ sessionId: UUID, clientId: UUID }`. Génère 1 convention pour 1
 * entreprise (client) d'une session — adapté pour INTRA et INTER.
 *
 * Retourne : `{ pdfBase64, cacheHit, engineUsed, latencyMs }` pour permettre
 * preview/download immédiat côté UI (la table `documents` est wirée dans une
 * story ultérieure).
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
import type { Session, Client } from "@/lib/types";

export async function POST(request: NextRequest) {
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

    // ── Parse body ────────────────────────────────────────────────────────
    const body = (await request.json()) as {
      sessionId?: string;
      clientId?: string;
    };
    if (!body.sessionId || !body.clientId) {
      return NextResponse.json(
        { error: "sessionId et clientId sont obligatoires" },
        { status: 400 },
      );
    }

    // ── Charge le contexte de résolution (session + client + entity) ──────
    const [
      { data: session },
      { data: client },
      entity,
    ] = await Promise.all([
      supabase
        .from("sessions")
        .select(
          "*, training:trainings(*), enrollments:enrollments(*, learner:learners(*), client_id), program:programs(*), formation_trainers:formation_trainers(trainer:trainers(*))",
        )
        .eq("id", body.sessionId)
        .eq("entity_id", profile.entity_id)
        .single(),
      supabase
        .from("clients")
        .select("*, contacts(*)")
        .eq("id", body.clientId)
        .eq("entity_id", profile.entity_id)
        .single(),
      loadEntitySettings(supabase, profile.entity_id),
    ]);

    if (!session) {
      return NextResponse.json(
        { error: "Session introuvable ou non autorisée" },
        { status: 404 },
      );
    }
    if (!client) {
      return NextResponse.json(
        { error: "Client introuvable ou non autorisé" },
        { status: 404 },
      );
    }

    // ── Résolution du template ────────────────────────────────────────────
    const context: ResolveContext = {
      session: session as unknown as Session,
      client: client as unknown as Client,
      entity,
    };
    const resolvedHtml = resolveDocumentVariables(CONVENTION_ENTREPRISE_HTML, context);

    // ── Génération PDF via nouvelle infra ─────────────────────────────────
    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "convention_entreprise",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "convention_entreprise",
        session_id: body.sessionId,
        client_id: body.clientId,
        // updated_at composite : cache invalidé si session/client/entity bouge
        session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
        client_updated_at: (client as { updated_at?: string }).updated_at ?? null,
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
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating convention") },
      { status: 500 },
    );
  }
}
