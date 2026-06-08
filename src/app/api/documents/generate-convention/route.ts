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
import {
  CONVENTION_ENTREPRISE_HTML,
  CONVENTION_FOOTER_TEMPLATE,
} from "@/lib/templates/convention-entreprise";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import { buildCredentialsSectionHtml } from "@/lib/services/credentials-qr";
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

    // ── Charge la session (strict : entity_id check — gate sécurité) ──────
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

    // ── Vérifie que le client est bien rattaché à cette session via
    // formation_companies. C'est la VRAIE preuve d'accès — pas un check
    // direct sur client.entity_id qui peut diverger sur des données legacy
    // (rattachement multi-tenant historique cassé).
    const { data: link } = await supabase
      .from("formation_companies")
      .select("client_id")
      .eq("session_id", body.sessionId)
      .eq("client_id", body.clientId)
      .maybeSingle();

    if (!link) {
      return NextResponse.json(
        {
          error:
            "Client non rattaché à cette session (vérifier formation_companies)",
        },
        { status: 404 },
      );
    }

    // ── Charge client + entity en parallèle (sans filtre entity_id sur
    // client : le lien formation_companies suffit comme preuve d'accès)
    const [{ data: client }, entity] = await Promise.all([
      supabase
        .from("clients")
        .select("*, contacts(*)")
        .eq("id", body.clientId)
        .single(),
      loadEntitySettings(supabase, profile.entity_id),
    ]);

    if (!client) {
      return NextResponse.json(
        { error: "Client introuvable (FK cassée ?)" },
        { status: 404 },
      );
    }

    // ── Résolution du template ────────────────────────────────────────────
    const context: ResolveContext = {
      session: session as unknown as Session,
      client: client as unknown as Client,
      entity,
    };
    let resolvedHtml = resolveDocumentVariables(CONVENTION_ENTREPRISE_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CONVENTION_FOOTER_TEMPLATE, context);

    // ── P3 Credentials : embed username + temp_password + QR code ────────
    // Filtrer les apprenants de ce client dans la session
    const clientEnrollments = ((session as Record<string, unknown>).enrollments as Array<{
      client_id?: string;
      learner?: {
        first_name?: string;
        last_name?: string;
        username?: string | null;
        temp_password?: string | null;
        profile_id?: string | null;
        first_login_at?: string | null;
      };
    }>) || [];
    const clientLearners = clientEnrollments
      .filter((e) => e.client_id === body.clientId && e.learner)
      .map((e) => e.learner!);

    const entitySlug = entity?.slug ?? undefined;
    const credentialsHtml = await buildCredentialsSectionHtml(clientLearners, entitySlug);

    if (credentialsHtml) {
      // Inject after Article 2 (effectif formé) — before Article 3
      const article3Marker = '<h2>Article 3';
      const insertIdx = resolvedHtml.indexOf(article3Marker);
      if (insertIdx > -1) {
        resolvedHtml = resolvedHtml.slice(0, insertIdx) + credentialsHtml + "\n\n  " + resolvedHtml.slice(insertIdx);
      } else {
        // Fallback: append before signature block
        const sigMarker = '<div class="signature-block">';
        const sigIdx = resolvedHtml.indexOf(sigMarker);
        if (sigIdx > -1) {
          resolvedHtml = resolvedHtml.slice(0, sigIdx) + credentialsHtml + "\n\n  " + resolvedHtml.slice(sigIdx);
        }
      }
    }

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
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating convention") },
      { status: 500 },
    );
  }
}
