import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { convertDocxToPdfWithVariables } from "@/lib/services/docx-converter";
import { generatePdfFromFragment } from "@/lib/services/pdf-generator";
import { getDefaultTemplate } from "@/lib/document-templates-defaults";
import { computeCacheKey, getCachedPdf, setCachedPdf } from "@/lib/services/pdf-cache";
import type { Session } from "@/lib/types";

/**
 * POST /api/documents/generate-from-template
 *
 * Génère un PDF à partir d'un template (custom ou système) avec variables
 * résolues depuis le contexte (session, learner, etc.).
 *
 * Gère les 2 modes de templates :
 *   - mode='docx_fidelity' → docxtemplater (variables) + CloudConvert (PDF)
 *   - mode='editable'      → HTML edited + résolution variables + CloudConvert
 *
 * Body :
 * {
 *   template_id: string,
 *   context: { session_id?, learner_id?, client_id?, trainer_id? },
 *   custom_variables?: Record<string, string>
 * }
 *
 * Réponse : { base64: string, filename: string, sizeBytes: number }
 *
 * Utilisé par TabConventionDocs (génération PDF côté admin) et autres
 * call sites qui doivent générer un PDF depuis un template DB.
 */

// Soit template_id (template explicite), soit doc_type (résolu via override default
// ou fallback sur template système hardcodé). Au moins un des deux requis.
const PayloadSchema = z
  .object({
    template_id: z.string().uuid().optional(),
    doc_type: z.string().min(1).optional(),
    context: z.object({
      session_id: z.string().uuid().optional(),
      learner_id: z.string().uuid().optional(),
      client_id: z.string().uuid().optional(),
      trainer_id: z.string().uuid().optional(),
    }),
    custom_variables: z.record(z.string(), z.string()).optional(),
  })
  .refine((d) => !!d.template_id || !!d.doc_type, {
    message: "template_id ou doc_type requis",
  });

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "trainer"]);
  if (auth.error) return auth.error;

  let payload: z.infer<typeof PayloadSchema>;
  try {
    const body = await request.json();
    const parsed = PayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload invalide", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    payload = parsed.data;
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, "generate-from-template/payload") }, { status: 400 });
  }

  try {
    // 1. Charge le template selon le payload :
    //    - template_id explicite : on charge ce template
    //    - doc_type : on cherche un template Word custom marqué default_for_doc_type
    //                 (override admin) ; sinon on prendra le template système hardcodé
    let template: { id: string; name: string; mode: string | null; source_docx_url: string | null; content: string | null; updated_at?: string | null } | null = null;
    let isSystemFallback = false;

    if (payload.template_id) {
      const { data } = await auth.supabase
        .from("document_templates")
        .select("id, name, mode, source_docx_url, content, created_at")
        .eq("id", payload.template_id)
        .eq("entity_id", auth.profile.entity_id)
        .single();
      template = data ? { ...data, updated_at: data.created_at } : null;
      if (!template) {
        return NextResponse.json({ error: "Template introuvable" }, { status: 404 });
      }
    } else if (payload.doc_type) {
      // Cherche un override "modèle par défaut" pour ce type
      const { data: overrideTpl } = await auth.supabase
        .from("document_templates")
        .select("id, name, mode, source_docx_url, content, created_at")
        .eq("entity_id", auth.profile.entity_id)
        .eq("default_for_doc_type", payload.doc_type)
        .eq("mode", "docx_fidelity")
        .maybeSingle();

      if (overrideTpl) {
        template = { ...overrideTpl, updated_at: overrideTpl.created_at };
      } else {
        // Pas d'override → on basculera sur le template système hardcodé après
        // avoir construit les variables (cf. plus bas)
        isSystemFallback = true;
      }
    }

    // 2. Construit les variables auto-déduites depuis le contexte
    // (on capture aussi updated_at pour le cache key)
    const autoVars: Record<string, string> = {};
    let sessionUpdatedAt: string | null = null;
    let learnerUpdatedAt: string | null = null;
    let clientUpdatedAt: string | null = null;
    let trainerUpdatedAt: string | null = null;
    let sessionDataForFallback: Record<string, unknown> | null = null;

    if (payload.context.session_id) {
      // On charge enrollments + formation_trainers + formation_time_slots + signatures
      // pour les templates qui en ont besoin (ex: planning_semaine, feuille_emargement).
      // Ces relations sont ignorées par les autres templates (cost ~minimal).
      const { data: session } = await auth.supabase
        .from("sessions")
        .select(`
          *,
          training:trainings(*),
          enrollments(learner:learners(id, first_name, last_name, email)),
          formation_trainers(trainer:trainers(id, first_name, last_name, email)),
          formation_time_slots(id, start_time, end_time, title),
          signatures(id, time_slot_id, signer_id, signer_type, signature_data, signed_at)
        `)
        .eq("id", payload.context.session_id)
        .single();
      if (session) {
        autoVars.titre_formation = (session.title as string) ?? "";
        autoVars.date_debut = (session.start_date as string) ?? "";
        autoVars.date_fin = (session.end_date as string) ?? "";
        autoVars.lieu = (session.location as string) ?? "";
        sessionUpdatedAt = (session.updated_at as string) ?? (session.created_at as string) ?? null;
        sessionDataForFallback = session as Record<string, unknown>;
      }
    }

    if (payload.context.learner_id) {
      const { data: learner } = await auth.supabase
        .from("learners")
        .select("first_name, last_name, email, phone, updated_at, created_at")
        .eq("id", payload.context.learner_id)
        .single();
      if (learner) {
        autoVars.nom_apprenant = `${learner.first_name ?? ""} ${learner.last_name ?? ""}`.trim();
        autoVars.prenom_apprenant = learner.first_name ?? "";
        autoVars.email_apprenant = learner.email ?? "";
        autoVars.telephone_apprenant = learner.phone ?? "";
        learnerUpdatedAt = (learner.updated_at as string | null) ?? (learner.created_at as string | null) ?? null;
      }
    }

    if (payload.context.client_id) {
      const { data: client } = await auth.supabase
        .from("clients")
        .select("company_name, updated_at, created_at")
        .eq("id", payload.context.client_id)
        .single();
      if (client) {
        autoVars.nom_client = client.company_name ?? "";
        clientUpdatedAt = (client.updated_at as string | null) ?? (client.created_at as string | null) ?? null;
      }
    }

    if (payload.context.trainer_id) {
      const { data: trainer } = await auth.supabase
        .from("trainers")
        .select("first_name, last_name, updated_at, created_at")
        .eq("id", payload.context.trainer_id)
        .single();
      if (trainer) {
        autoVars.nom_formateur = `${trainer.first_name ?? ""} ${trainer.last_name ?? ""}`.trim();
        trainerUpdatedAt = (trainer.updated_at as string | null) ?? (trainer.created_at as string | null) ?? null;
      }
    }

    autoVars.date_today = new Date().toLocaleDateString("fr-FR");

    // Custom variables override les auto-déduites
    const finalVars = { ...autoVars, ...(payload.custom_variables ?? {}) };

    // 2.5 — Cache lookup : si on a déjà généré ce PDF avec ce contexte → réutilise
    // (économise 1 conversion CloudConvert par hit ; invalidation auto si template
    // ou entité modifié grâce aux updated_at dans le hash).
    // Note : on n'inclut PAS date_today dans le hash pour ne pas invalider chaque
    // jour. Si tu veux date_today dynamique, passe-la en custom_variables.
    const cacheKey = computeCacheKey({
      entity_id: auth.profile.entity_id,
      template_id: template?.id ?? null,
      doc_type: payload.doc_type ?? null,
      session_id: payload.context.session_id ?? null,
      learner_id: payload.context.learner_id ?? null,
      client_id: payload.context.client_id ?? null,
      trainer_id: payload.context.trainer_id ?? null,
      template_updated_at: template?.updated_at ?? null,
      session_updated_at: sessionUpdatedAt,
      learner_updated_at: learnerUpdatedAt,
      client_updated_at: clientUpdatedAt,
      trainer_updated_at: trainerUpdatedAt,
      custom_variables: payload.custom_variables ?? null,
    });

    const cachedBuffer = await getCachedPdf(auth.supabase, auth.profile.entity_id, cacheKey);
    if (cachedBuffer) {
      const pdfNameBase = template?.name ?? payload.doc_type ?? "document";
      const filename = `${pdfNameBase.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
      console.log(`[generate-from-template] Cache HIT (${cacheKey.slice(0, 8)})`);
      return NextResponse.json({
        base64: cachedBuffer.toString("base64"),
        filename,
        sizeBytes: cachedBuffer.byteLength,
        cached: true,
      });
    }
    console.log(`[generate-from-template] Cache MISS (${cacheKey.slice(0, 8)}) — generating`);

    // 3. Génération PDF — 3 cas :
    //    a) Cas template (custom OU override default) en mode docx_fidelity → CloudConvert LibreOffice
    //    b) Cas template en mode editable → HTML résolu + CloudConvert Chrome
    //    c) Cas isSystemFallback (doc_type sans override) → getDefaultTemplate(HTML système hardcodé) + CloudConvert
    let pdfBase64: string;
    let sizeBytes: number;
    let pdfNameBase: string;

    if (template) {
      const tplMode = (template.mode as "editable" | "docx_fidelity" | null) ?? "editable";
      pdfNameBase = template.name;

      if (tplMode === "docx_fidelity") {
        if (!template.source_docx_url) {
          return NextResponse.json(
            { error: "Template en mode docx_fidelity sans fichier .docx attaché" },
            { status: 400 }
          );
        }
        const result = await convertDocxToPdfWithVariables(template.source_docx_url, finalVars);
        pdfBase64 = result.base64;
        sizeBytes = result.sizeBytes;
      } else {
        // Mode editable : résolution simple des {{xxx}} dans le HTML
        const rawHtml = template.content ?? "";
        if (!rawHtml.trim()) {
          return NextResponse.json(
            { error: "Template editable sans contenu HTML" },
            { status: 400 }
          );
        }
        const resolvedHtml = rawHtml.replace(
          /\{\{\s*([\w]+)\s*\}\}/g,
          (_match: string, k: string) => finalVars[k] ?? `{{${k}}}`
        );
        const result = await generatePdfFromFragment(resolvedHtml, template.name);
        pdfBase64 = result.base64;
        sizeBytes = result.sizeBytes;
      }
    } else if (isSystemFallback && payload.doc_type) {
      // Réutilise les données déjà fetchées plus haut + fetch les manquantes
      const session = sessionDataForFallback;
      const learnerData = payload.context.learner_id
        ? (await auth.supabase.from("learners").select("id, first_name, last_name, email").eq("id", payload.context.learner_id).single()).data
        : null;
      const companyData = payload.context.client_id
        ? (await auth.supabase.from("clients").select("company_name, address, siret").eq("id", payload.context.client_id).single()).data
        : null;
      const trainerData = payload.context.trainer_id
        ? (await auth.supabase.from("trainers").select("first_name, last_name").eq("id", payload.context.trainer_id).single()).data
        : null;
      const { data: entity } = session?.entity_id
        ? await auth.supabase.from("entities").select("name").eq("id", session.entity_id as string).single()
        : { data: null };

      const html = getDefaultTemplate(payload.doc_type, {
        formation: session as unknown as Session,
        learner: learnerData ?? undefined,
        company: companyData ?? undefined,
        trainer: trainerData ?? undefined,
        entityName: entity?.name ?? "MR FORMATION",
      });

      if (!html) {
        return NextResponse.json(
          { error: `Pas de template système disponible pour "${payload.doc_type}"` },
          { status: 404 }
        );
      }

      // Format paysage A4 pour les docs type planning (grille calendrier large)
      const useLandscape = payload.doc_type === "planning_semaine";
      const result = await generatePdfFromFragment(html, payload.doc_type, useLandscape ? { landscape: true } : undefined);
      pdfBase64 = result.base64;
      sizeBytes = result.sizeBytes;
      pdfNameBase = payload.doc_type;
    } else {
      return NextResponse.json({ error: "Aucun template ni doc_type valide fourni" }, { status: 400 });
    }

    // Sauvegarde dans le cache pour économiser CloudConvert sur les prochaines requêtes
    // identiques (best effort — un échec d'upload ne bloque pas la réponse).
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    setCachedPdf(auth.supabase, auth.profile.entity_id, cacheKey, pdfBuffer).catch(() => { /* silent */ });

    const filename = `${pdfNameBase.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;

    return NextResponse.json({
      base64: pdfBase64,
      filename,
      sizeBytes,
      cached: false,
    });
  } catch (err) {
    console.error("[documents/generate-from-template] error:", err);
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json(
      { error: `Échec génération PDF : ${message}` },
      { status: 500 }
    );
  }
}
