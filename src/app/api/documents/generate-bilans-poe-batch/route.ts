/**
 * POST /api/documents/generate-bilans-poe-batch
 *
 * Génère 1 bilan POE par apprenant → ZIP fail-soft. Body : `{ sessionId }`.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import {
  BILAN_POE_HTML,
  BILAN_POE_FOOTER_TEMPLATE,
} from "@/lib/templates/bilan-poe";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import type { Session, Learner } from "@/lib/types";

interface BatchError {
  learnerId: string;
  learnerName: string;
  error: string;
}

function slugify(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    .toLowerCase().slice(0, 60) || "apprenant";
}

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as { sessionId?: string };
    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId est obligatoire" }, { status: 400 });
    }

    const { data: session } = await supabase
      .from("sessions").select("*, training:trainings(*), program:programs(*)")
      .eq("id", body.sessionId).eq("entity_id", profile.entity_id).single();
    if (!session) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    const [{ data: enrollments, error: enrErr }, { data: signatureRows }] = await Promise.all([
      supabase.from("enrollments").select("learner:learners(*)").eq("session_id", body.sessionId),
      supabase.from("signatures").select("signer_id").eq("session_id", body.sessionId).eq("signer_type", "learner"),
    ]);
    if (enrErr) {
      return NextResponse.json({ error: `Lecture enrollments : ${enrErr.message}` }, { status: 500 });
    }
    const learners = ((enrollments ?? []) as unknown as { learner: Learner | null }[])
      .map((e) => e.learner).filter((l): l is Learner => Boolean(l));
    if (learners.length === 0) {
      return NextResponse.json({ error: "Aucun apprenant inscrit" }, { status: 404 });
    }

    const signedLearnerIds = new Set<string>(
      (signatureRows ?? [])
        .map((s) => (s as { signer_id: string | null }).signer_id)
        .filter((id): id is string => Boolean(id)),
    );

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const tasks = learners.map(async (learner) => {
      const context: ResolveContext = {
        session: session as unknown as Session, learner, entity, signedLearnerIds,
      };
      const resolvedHtml = resolveDocumentVariables(BILAN_POE_HTML, context);
      const resolvedFooter = resolveDocumentVariables(BILAN_POE_FOOTER_TEMPLATE, context);

      const result = await service.generate({
        entityId: profile.entity_id,
        docType: "bilan_poe",
        html: resolvedHtml,
        cacheInputs: {
          doc_type: "bilan_poe",
          session_id: body.sessionId,
          learner_id: learner.id,
          session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
          custom_variables: {
            present: signedLearnerIds.has(learner.id) ? "1" : "0",
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
      return { learner, result };
    });

    const settled = await Promise.allSettled(tasks);
    const zip = new JSZip();
    const errors: BatchError[] = [];
    let successCount = 0;

    settled.forEach((outcome, idx) => {
      const learner = learners[idx];
      const name = `${learner.last_name} ${learner.first_name}`;
      if (outcome.status === "fulfilled") {
        zip.file(`bilan-poe-${slugify(name)}.pdf`, outcome.value.result.buffer);
        successCount += 1;
      } else {
        const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        errors.push({ learnerId: learner.id, learnerName: name, error: msg });
      }
    });

    if (errors.length > 0) {
      zip.file("_erreurs.txt",
        `Échec pour ${errors.length} apprenant(s) :\n\n${errors.map((e) => `- ${e.learnerName} : ${e.error}`).join("\n")}\n`);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return NextResponse.json({
      zipBase64: zipBuffer.toString("base64"),
      totalLearners: learners.length,
      successCount,
      failureCount: errors.length,
      errors,
      totalLatencyMs: Date.now() - t0,
      signedCount: signedLearnerIds.size,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating bilans POE batch") },
      { status: 500 },
    );
  }
}
