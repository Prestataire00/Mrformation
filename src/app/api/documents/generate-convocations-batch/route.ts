/**
 * POST /api/documents/generate-convocations-batch
 *
 * Génère N convocations (1 par apprenant inscrit à la session) et empaquette
 * dans un ZIP. Fail-soft : si un apprenant n'a pas d'email/nom, son PDF est
 * quand même généré avec [Placeholder].
 *
 * Body : `{ sessionId: UUID }`.
 *
 * Note QR : le QR pointe vers la MÊME url pour tous les apprenants
 * (`/learner/sessions/{sessionId}`) — l'extranet auth-protégé fera la
 * distinction par apprenant via le login.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import QRCode from "qrcode";
import {
  CONVOCATION_APPRENANT_HTML,
  CONVOCATION_APPRENANT_FOOTER_TEMPLATE,
} from "@/lib/templates/convocation-apprenant";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import { getOrCreateConvocationMagicLink } from "@/lib/services/convocation-magic-link";
import type { Session, Learner } from "@/lib/types";

interface BatchError {
  learnerId: string;
  learnerName: string;
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
    .slice(0, 60) || "apprenant";
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

    const { data: session } = await supabase
      .from("sessions")
      .select(
        "*, training:trainings(*), formation_time_slots:formation_time_slots(*)",
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

    // Apprenants inscrits
    const { data: enrollments, error: enrErr } = await supabase
      .from("enrollments")
      .select("learner:learners(*)")
      .eq("session_id", body.sessionId);

    if (enrErr) {
      return NextResponse.json(
        { error: `Lecture enrollments : ${enrErr.message}` },
        { status: 500 },
      );
    }
    const learners = ((enrollments ?? []) as unknown as { learner: Learner | null }[])
      .map((e) => e.learner)
      .filter((l): l is Learner => Boolean(l));

    if (learners.length === 0) {
      return NextResponse.json(
        { error: "Aucun apprenant inscrit à cette session" },
        { status: 404 },
      );
    }

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    // Magic link PAR apprenant (chaque QR unique → auto-login vers sa session)
    const tasks = learners.map(async (learner) => {
      const magicLink = await getOrCreateConvocationMagicLink({
        supabase,
        learnerId: learner.id,
        sessionId: body.sessionId!,
        entityId: profile.entity_id,
        createdByUserId: user.id,
      });
      const qrDataUrl = await QRCode.toDataURL(magicLink.url, {
        width: 400,
        margin: 1,
        errorCorrectionLevel: "M",
      });

      const context: ResolveContext = {
        session: session as unknown as Session,
        learner,
        entity,
        extranetQrDataUrl: qrDataUrl,
      };
      const resolvedHtml = resolveDocumentVariables(CONVOCATION_APPRENANT_HTML, context);
      const resolvedFooter = resolveDocumentVariables(CONVOCATION_APPRENANT_FOOTER_TEMPLATE, context);

      const result = await service.generate({
        entityId: profile.entity_id,
        docType: "convocation_apprenant",
        html: resolvedHtml,
        cacheInputs: {
          doc_type: "convocation_apprenant",
          session_id: body.sessionId,
          learner_id: learner.id,
          session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
          custom_variables: { magic_token: magicLink.token },
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
        zip.file(`convocation-${slugify(name)}.pdf`, outcome.value.result.buffer);
        successCount += 1;
      } else {
        const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        errors.push({ learnerId: learner.id, learnerName: name, error: msg });
      }
    });

    if (errors.length > 0) {
      const report = errors
        .map((e) => `- ${e.learnerName} (id=${e.learnerId}) : ${e.error}`)
        .join("\n");
      zip.file(
        "_erreurs.txt",
        `Échec de génération pour ${errors.length} apprenant(s) sur ${learners.length} :\n\n${report}\n`,
      );
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return NextResponse.json({
      zipBase64: zipBuffer.toString("base64"),
      totalLearners: learners.length,
      successCount,
      failureCount: errors.length,
      errors,
      totalLatencyMs: Date.now() - t0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating convocations batch") },
      { status: 500 },
    );
  }
}
