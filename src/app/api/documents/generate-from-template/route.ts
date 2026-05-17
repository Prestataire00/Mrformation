import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { convertDocxToPdfWithVariables } from "@/lib/services/docx-converter";
import { generatePdfFromFragment } from "@/lib/services/pdf-generator";
import { computeCacheKey, getCachedPdf, setCachedPdf } from "@/lib/services/pdf-cache";
import { getSystemTemplate, renderSystemTemplate } from "@/lib/templates/registry";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import { validateDocumentVariables, type MissingByEntity } from "@/lib/validation/document-vars-validator";
import { getOrCreateConvocationMagicLink } from "@/lib/services/convocation-magic-link";
import { loadSignaturesBySessionId } from "@/lib/services/load-signatures";
import { loadClientWithContacts } from "@/lib/services/load-client";
import QRCode from "qrcode";
import type { Session, Learner, Client, Trainer } from "@/lib/types";

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
          enrollments(id, client_id, learner:learners(id, first_name, last_name, email)),
          formation_companies(id, client_id, amount, email, reference, created_at),
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
    let validationWarnings: { missingByEntity: MissingByEntity } | null = null;

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
      // ─── Bascule sur le BEAU template système si dispo (registry) ───
      // Avant : on appelait getDefaultTemplate() qui retournait des templates
      // basiques sans style (le bouton "Voir" produisait des PDFs moches).
      // Après : on cherche d'abord dans registry.ts (templates Loris avec
      // header, logo, footer SIRET/NDA). Fallback sur getDefaultTemplate
      // si pas de beau template pour ce doc_type.
      const systemTemplate = getSystemTemplate(payload.doc_type);
      const session = sessionDataForFallback;

      if (systemTemplate) {
        // Charge le context enrichi pour resolveDocumentVariables (resolver
        // unifié [%Var%]) : entity full + learner/client/trainer + signatures
        // si applicable + magic link convocation si applicable.
        const learnerData = payload.context.learner_id
          ? (await auth.supabase.from("learners").select("*").eq("id", payload.context.learner_id).single()).data as Learner | null
          : null;

        // Fetch client avec ses contacts via helper (2 queries séparées pour
        // contourner PGRST201 quand plusieurs FK clients↔contacts existent).
        let clientData: Client | null = null;
        if (payload.context.client_id) {
          clientData = await loadClientWithContacts(auth.supabase, payload.context.client_id);
          if (!clientData) {
            console.warn(
              `[generate-from-template] client NOT FOUND for id=${payload.context.client_id}`,
            );
          }
        } else if (payload.doc_type === "convention_entreprise") {
          console.warn(
            `[generate-from-template] doc_type=convention_entreprise but NO client_id in payload`,
          );
        }

        const trainerData = payload.context.trainer_id
          ? (await auth.supabase.from("trainers").select("*").eq("id", payload.context.trainer_id).single()).data as Trainer | null
          : null;
        const entity = await loadEntitySettings(auth.supabase, auth.profile.entity_id);

        // Magic link convocation : créé si doc_type=convocation + learner_id
        let extranetQrDataUrl: string | undefined;
        let magicToken: string | null = null;
        if (payload.doc_type === "convocation" && learnerData?.id && payload.context.session_id) {
          try {
            const magicLink = await getOrCreateConvocationMagicLink({
              supabase: auth.supabase,
              learnerId: learnerData.id,
              sessionId: payload.context.session_id,
              entityId: auth.profile.entity_id,
              createdByUserId: auth.user.id,
            });
            extranetQrDataUrl = await QRCode.toDataURL(magicLink.url, {
              width: 400, margin: 1, errorCorrectionLevel: "M",
            });
            magicToken = magicLink.token;
          } catch (err) {
            console.warn("[generate-from-template] magic link creation failed:", err);
          }
        }

        // Signatures : pour attestation_assiduite + feuille_emargement
        let signedLearnerIds: Set<string> | undefined;
        let signaturesById: Map<string, unknown> | undefined;
        let signaturesBySlotPerson: Map<string, unknown> | undefined;
        if (
          ["attestation_assiduite", "feuille_emargement", "feuille_emargement_collectif"].includes(payload.doc_type ?? "")
          && payload.context.session_id
        ) {
          try {
            const sigData = await loadSignaturesBySessionId(auth.supabase, payload.context.session_id);
            signedLearnerIds = sigData.signedLearnerIds;
            signaturesById = sigData.signaturesById;
            signaturesBySlotPerson = sigData.signaturesBySlotPerson;
          } catch (err) {
            console.warn("[generate-from-template] signatures load failed:", err);
          }
        }

        const ctx: ResolveContext = {
          session: session as unknown as Session,
          learner: learnerData ?? undefined,
          client: clientData ?? undefined,
          trainer: trainerData ?? undefined,
          entity,
          extranetQrDataUrl,
          signedLearnerIds,
          signaturesById: signaturesById as ResolveContext["signaturesById"],
          signaturesBySlotPerson: signaturesBySlotPerson as ResolveContext["signaturesBySlotPerson"],
        };

        const resolvedHtml = resolveDocumentVariables(systemTemplate.html, ctx);
        const resolvedFooter = resolveDocumentVariables(systemTemplate.footer, ctx);

        // Validation pré-génération : refuse de générer un PDF Qualiopi avec
        // des placeholders [Xxx] visibles. Cf spec
        // docs/superpowers/specs/2026-05-17-document-vars-validation-design.md
        const validation = validateDocumentVariables(systemTemplate.html, ctx);
        if (!validation.valid && systemTemplate.qualiopiBlocking) {
          return NextResponse.json(
            {
              error: "INCOMPLETE_DATA",
              docType: payload.doc_type,
              missingByEntity: validation.missingByEntity,
              entityIds: validation.entityIds,
            },
            { status: 422 },
          );
        }
        if (!validation.valid) {
          // Non-bloquant : on génère mais on prévient le client via le payload.
          validationWarnings = { missingByEntity: validation.missingByEntity };
        }

        // Utilise DocumentGenerationService (Puppeteer + footer template) plutôt
        // que generatePdfFromFragment (CloudConvert sans footer). Cohérent avec
        // les batch endpoints F1/F2.x qui passent par DGS.
        const engine = createDefaultEngine();
        const service = new DocumentGenerationService({ engine, supabase: auth.supabase });
        const useLandscape = payload.doc_type === "planning_semaine";
        const dgsResult = await service.generate({
          entityId: auth.profile.entity_id,
          docType: payload.doc_type,
          html: resolvedHtml,
          cacheInputs: {
            doc_type: payload.doc_type,
            session_id: payload.context.session_id ?? null,
            learner_id: payload.context.learner_id ?? null,
            client_id: payload.context.client_id ?? null,
            trainer_id: payload.context.trainer_id ?? null,
            session_updated_at: sessionUpdatedAt,
            custom_variables: magicToken ? { magic_token: magicToken } : null,
          },
          options: {
            format: "A4",
            landscape: useLandscape,
            margins: useLandscape
              ? { top: "12mm", right: "10mm", bottom: "14mm", left: "10mm" }
              : { top: "18mm", right: "16mm", bottom: "22mm", left: "16mm" },
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: "<span></span>",
            footerTemplate: resolvedFooter,
          },
        });
        pdfBase64 = dgsResult.buffer.toString("base64");
        sizeBytes = dgsResult.fileSizeBytes;
        pdfNameBase = payload.doc_type;
        if (magicToken) console.log(`[generate-from-template] Magic link convocation : ${magicToken.slice(0, 8)}...`);
      } else {
        // Pas de beau template registry pour ce doc_type → 404 explicite.
        // (Le fichier legacy document-templates-defaults.ts a été drop avec
        // ce refactor : plus de double système. Si un nouveau doc_type est
        // ajouté, créer son beau template dans src/lib/templates/ + l'ajouter
        // au registry. Cf. /admin/documents/how-to pour la procédure.)
        return NextResponse.json(
          { error: `Pas de template système disponible pour "${payload.doc_type}". Créez un template custom via /admin/documents/import ou ajoutez un beau template au registry.` },
          { status: 404 }
        );
      }
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
      ...(validationWarnings && { warnings: validationWarnings }),
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
