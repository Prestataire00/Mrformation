/**
 * POST /api/documents/generate-emargements-batch
 *
 * Génère N feuilles d'émargement collectif (une par entreprise rattachée à la
 * session via `formation_companies`) et les empaquette dans un ZIP.
 *
 * Body : `{ sessionId: UUID }`. Réutilise le cache PDF par `(session, client,
 * signed_count)` — pas de re-rendu si rien n'a changé.
 *
 * Stratégie : **fail-soft** (même schéma que generate-conventions-batch). Une
 * entreprise qui échoue est listée dans `_erreurs.txt` à la racine du ZIP,
 * les autres sont incluses normalement.
 *
 * Retour : `{ zipBase64, totalCompanies, successCount, failureCount, errors,
 * totalLatencyMs }`.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
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
import type { Session, Client } from "@/lib/types";

interface BatchError {
  clientId: string;
  companyName: string;
  error: string;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60) || "entreprise";
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
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

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId est obligatoire" }, { status: 400 });
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

    // ── Entreprises rattachées ────────────────────────────────────────────
    const { data: links, error: linksError } = await supabase
      .from("formation_companies")
      .select("client_id, client:clients(*, contacts(*))")
      .eq("session_id", body.sessionId);

    if (linksError) {
      return NextResponse.json(
        { error: `Lecture formation_companies : ${linksError.message}` },
        { status: 500 },
      );
    }
    if (!links || links.length === 0) {
      return NextResponse.json(
        { error: "Aucune entreprise rattachée à cette session" },
        { status: 404 },
      );
    }

    // ── Signatures + entity en parallèle (chargés 1 fois pour le batch) ──
    const [entity, { data: signatureRows }] = await Promise.all([
      loadEntitySettings(supabase, profile.entity_id),
      supabase
        .from("signatures")
        .select("signer_id, signer_type")
        .eq("session_id", body.sessionId)
        .eq("signer_type", "learner"),
    ]);

    const signedLearnerIds = new Set<string>(
      (signatureRows ?? [])
        .map((s) => (s as { signer_id: string | null }).signer_id)
        .filter((id): id is string => Boolean(id)),
    );

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const tasks = links.map(async (link) => {
      const client = (link as unknown as { client: Client | null }).client;
      if (!client) {
        throw new Error("Client introuvable (FK cassée formation_companies → clients)");
      }
      const context: ResolveContext = {
        session: session as unknown as Session,
        client,
        entity,
        signedLearnerIds,
      };
      const resolvedHtml = resolveDocumentVariables(EMARGEMENT_COLLECTIF_HTML, context);
      const resolvedFooter = resolveDocumentVariables(EMARGEMENT_FOOTER_TEMPLATE, context);

      const result = await service.generate({
        entityId: profile.entity_id,
        docType: "emargement_collectif",
        html: resolvedHtml,
        cacheInputs: {
          doc_type: "emargement_collectif",
          session_id: body.sessionId,
          client_id: client.id,
          session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
          client_updated_at: (client as { updated_at?: string }).updated_at ?? null,
          custom_variables: { signed_count: String(signedLearnerIds.size) },
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
      return { client, result };
    });

    const settled = await Promise.allSettled(tasks);

    const zip = new JSZip();
    const errors: BatchError[] = [];
    let successCount = 0;

    settled.forEach((outcome, idx) => {
      const link = links[idx];
      const client = (link as unknown as { client: Client | null }).client;
      const companyName = client?.company_name ?? `Entreprise inconnue ${idx + 1}`;
      const clientId = (link as { client_id: string }).client_id;

      if (outcome.status === "fulfilled") {
        const filename = `emargement-${slugify(companyName)}.pdf`;
        zip.file(filename, outcome.value.result.buffer);
        successCount += 1;
      } else {
        const errMsg = outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);
        errors.push({ clientId, companyName, error: errMsg });
      }
    });

    if (errors.length > 0) {
      const report = errors
        .map((e) => `- ${e.companyName} (id=${e.clientId}) : ${e.error}`)
        .join("\n");
      zip.file(
        "_erreurs.txt",
        `Échec de génération pour ${errors.length} entreprise(s) sur ${links.length} :\n\n${report}\n`,
      );
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return NextResponse.json({
      zipBase64: zipBuffer.toString("base64"),
      totalCompanies: links.length,
      successCount,
      failureCount: errors.length,
      errors,
      totalLatencyMs: Date.now() - t0,
      signedCount: signedLearnerIds.size,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating émargements batch") },
      { status: 500 },
    );
  }
}
