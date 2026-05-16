/**
 * POST /api/documents/generate-certificats-travail-hauteur-batch
 *
 * Génère 1 certificat par apprenant → ZIP fail-soft. Body : `{ sessionId }`.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import {
  CERTIFICAT_TRAVAIL_HAUTEUR_HTML,
  CERTIFICAT_TRAVAIL_HAUTEUR_FOOTER_TEMPLATE,
} from "@/lib/templates/certificat-travail-hauteur";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import type { Session, Learner, Client } from "@/lib/types";

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
      .from("sessions").select("*, training:trainings(*)")
      .eq("id", body.sessionId).eq("entity_id", profile.entity_id).single();
    if (!session) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    const { data: enrollments, error: enrErr } = await supabase
      .from("enrollments").select("client_id, learner:learners(*)")
      .eq("session_id", body.sessionId);
    if (enrErr) {
      return NextResponse.json({ error: `Lecture enrollments : ${enrErr.message}` }, { status: 500 });
    }

    const enrolled = (enrollments ?? []) as unknown as { client_id: string | null; learner: Learner | null }[];
    const valid = enrolled.filter((e) => e.learner);
    if (valid.length === 0) {
      return NextResponse.json({ error: "Aucun apprenant inscrit" }, { status: 404 });
    }

    const clientIds = [...new Set(valid.map((e) => e.client_id).filter((id): id is string => Boolean(id)))];
    const clientById = new Map<string, Client>();
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from("clients").select("*, contacts(*)").in("id", clientIds);
      ((clients ?? []) as unknown as Client[]).forEach((c) => clientById.set(c.id, c));
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const tasks = valid.map(async (enr) => {
      const learner = enr.learner!;
      const client = enr.client_id ? clientById.get(enr.client_id) ?? null : null;
      const context: ResolveContext = {
        session: session as unknown as Session, learner, client, entity,
      };
      const resolvedHtml = resolveDocumentVariables(CERTIFICAT_TRAVAIL_HAUTEUR_HTML, context);
      const resolvedFooter = resolveDocumentVariables(CERTIFICAT_TRAVAIL_HAUTEUR_FOOTER_TEMPLATE, context);

      const result = await service.generate({
        entityId: profile.entity_id,
        docType: "certificat_travail_hauteur",
        html: resolvedHtml,
        cacheInputs: {
          doc_type: "certificat_travail_hauteur",
          session_id: body.sessionId,
          learner_id: learner.id,
          client_id: enr.client_id ?? null,
          session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
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
      const learner = valid[idx].learner!;
      const name = `${learner.last_name} ${learner.first_name}`;
      if (outcome.status === "fulfilled") {
        zip.file(`certificat-travail-hauteur-${slugify(name)}.pdf`, outcome.value.result.buffer);
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
      totalLearners: valid.length,
      successCount,
      failureCount: errors.length,
      errors,
      totalLatencyMs: Date.now() - t0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating certificats travail hauteur batch") },
      { status: 500 },
    );
  }
}
