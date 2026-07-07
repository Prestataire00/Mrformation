/**
 * POST /api/documents/generate-conventions-batch
 *
 * Génère N conventions entreprise (une par entreprise rattachée à la session
 * via `formation_companies`) et les empaquette dans un ZIP.
 *
 * Body : `{ sessionId: UUID }`. Réutilise la même infra que la route single
 * (`/api/documents/generate-convention`) : template HTML + resolver unifié +
 * DocumentGenerationService — donc cache PDF partagé, pas de re-rendu si déjà
 * en cache pour `(session, client)` inchangés.
 *
 * Stratégie d'erreur : **fail-soft**. Une entreprise qui échoue (SIRET
 * manquant, FK cassée, etc.) n'arrête pas le batch — son erreur est listée
 * dans `_erreurs.txt` à la racine du ZIP, et le ZIP retourné contient les
 * PDF des entreprises qui ont réussi. L'utilisateur peut télécharger ce qui
 * marche et corriger les autres.
 *
 * Retour : `{ zipBase64, totalCompanies, successCount, failureCount, errors,
 * totalLatencyMs }`.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
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
import { loadClientsWithContacts } from "@/lib/services/load-client";
import type { Session, Client } from "@/lib/types";

interface BatchError {
  clientId: string;
  companyName: string;
  error: string;
}

/** Slugify un nom d'entreprise pour un nom de fichier sûr (sans accents, espaces, /, etc.). */
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
    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) {
      return NextResponse.json(
        { error: "sessionId est obligatoire" },
        { status: 400 },
      );
    }

    // ── Charge la session (gate sécurité entity_id) ──────────────────────
    const { data: session } = await supabase
      .from("sessions")
      .select(
        "*, training:trainings(*), enrollments:enrollments(*, learner:learners(*), client_id), program:programs(*), formation_companies(id, client_id, amount, email, reference, created_at), formation_trainers:formation_trainers(trainer:trainers(*))",
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

    // ── Liste les entreprises rattachées via formation_companies ─────────
    // Note : on ne joinpas contacts(*) ici (PGRST201 si 2+ FK), on les charge
    // séparément via loadClientsWithContacts après.
    const { data: links, error: linksError } = await supabase
      .from("formation_companies")
      .select("client_id")
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

    // Charge les clients + contacts en 2 queries séparées (contourne PGRST201)
    const clientIds = (links as Array<{ client_id: string | null }>)
      .map((l) => l.client_id)
      .filter((id): id is string => Boolean(id));
    const clientsMap = await loadClientsWithContacts(supabase, clientIds);

    // ── Charge l'entity une seule fois (partagée pour toutes les conventions) ─
    const entity = await loadEntitySettings(supabase, profile.entity_id);

    // ── Génération parallèle, fail-soft via Promise.allSettled ───────────
    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const tasks = links.map(async (link) => {
      const clientId = (link as { client_id: string | null }).client_id;
      const client = clientId ? clientsMap.get(clientId) ?? null : null;
      if (!client) {
        throw new Error("Client introuvable (FK cassée formation_companies → clients)");
      }
      const context: ResolveContext = {
        session: session as unknown as Session,
        client,
        entity,
      };
      const resolvedHtml = resolveDocumentVariables(CONVENTION_ENTREPRISE_HTML, context);
      const resolvedFooter = resolveDocumentVariables(CONVENTION_FOOTER_TEMPLATE, context);

      const result = await service.generate({
        entityId: profile.entity_id,
        docType: "convention_entreprise",
        html: resolvedHtml,
        cacheInputs: {
          doc_type: "convention_entreprise",
          session_id: body.sessionId,
          client_id: client.id,
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
        const filename = `convention-${slugify(companyName)}.pdf`;
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
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating conventions batch") },
      { status: 500 },
    );
  }
}
