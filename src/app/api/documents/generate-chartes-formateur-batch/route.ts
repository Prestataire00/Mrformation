/**
 * POST /api/documents/generate-chartes-formateur-batch
 *
 * Génère 1 charte par formateur de l'entité → ZIP fail-soft.
 * Body : `{}` (pas de paramètre — tous les formateurs de l'entité).
 *
 * Utile pour envoyer la charte à tous les formateurs d'un coup (onboarding,
 * mise à jour de la charte, etc.).
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import {
  CHARTE_FORMATEUR_HTML,
  CHARTE_FORMATEUR_FOOTER_TEMPLATE,
} from "@/lib/templates/charte-formateur";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import type { Trainer } from "@/lib/types";

interface BatchError {
  trainerId: string;
  trainerName: string;
  error: string;
}

function slugify(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    .toLowerCase().slice(0, 60) || "formateur";
}

export async function POST(_request: NextRequest) {
  const t0 = Date.now();
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: profile } = await supabase
      .from("profiles").select("entity_id, role").eq("id", user.id).single();
    if (!profile?.entity_id) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    if (!["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const { data: trainers, error: trainersErr } = await supabase
      .from("trainers")
      .select("*")
      .eq("entity_id", profile.entity_id);
    if (trainersErr) {
      return NextResponse.json({ error: `Lecture trainers : ${trainersErr.message}` }, { status: 500 });
    }
    const trainersTyped = (trainers ?? []) as unknown as Trainer[];
    if (trainersTyped.length === 0) {
      return NextResponse.json({ error: "Aucun formateur dans cette entité" }, { status: 404 });
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const tasks = trainersTyped.map(async (trainer) => {
      const context: ResolveContext = {
        entity,
        trainer,
      };
      const resolvedHtml = resolveDocumentVariables(CHARTE_FORMATEUR_HTML, context);
      const resolvedFooter = resolveDocumentVariables(CHARTE_FORMATEUR_FOOTER_TEMPLATE, context);

      const result = await service.generate({
        entityId: profile.entity_id,
        docType: "charte_formateur",
        html: resolvedHtml,
        cacheInputs: {
          doc_type: "charte_formateur",
          trainer_id: trainer.id,
          custom_variables: {
            has_signature: (trainer as unknown as { signature_url?: string }).signature_url ? "1" : "0",
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
      return { trainer, result };
    });

    const settled = await Promise.allSettled(tasks);
    const zip = new JSZip();
    const errors: BatchError[] = [];
    let successCount = 0;

    settled.forEach((outcome, idx) => {
      const trainer = trainersTyped[idx];
      const name = `${trainer.last_name} ${trainer.first_name}`;
      if (outcome.status === "fulfilled") {
        zip.file(`charte-${slugify(name)}.pdf`, outcome.value.result.buffer);
        successCount += 1;
      } else {
        const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        errors.push({ trainerId: trainer.id, trainerName: name, error: msg });
      }
    });

    if (errors.length > 0) {
      zip.file("_erreurs.txt",
        `Échec pour ${errors.length} formateur(s) :\n\n${errors.map((e) => `- ${e.trainerName} : ${e.error}`).join("\n")}\n`);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return NextResponse.json({
      zipBase64: zipBuffer.toString("base64"),
      totalTrainers: trainersTyped.length,
      successCount,
      failureCount: errors.length,
      errors,
      totalLatencyMs: Date.now() - t0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating chartes formateur batch") },
      { status: 500 },
    );
  }
}
