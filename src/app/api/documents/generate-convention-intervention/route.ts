/**
 * POST /api/documents/generate-convention-intervention
 *
 * Génère un contrat de sous-traitance pour 1 formateur d'une session.
 *
 * Body : `{ sessionId: UUID, trainerId: UUID }`. Le formateur doit être
 * rattaché à la session via `formation_trainers` (gate d'accès).
 *
 * Le coût HT vient de `formation_trainers.agreed_cost_ht` du lien
 * (session, trainer). Fallback : `hourly_rate × hours_done` puis
 * `daily_rate × dates_done.split(',').length`.
 *
 * NB : ce contrat nécessite la migration SQL
 * `add_trainer_subcontracting_fields.sql` (champs trainers.address/siret/nda/
 * extranet_link/signature_url et formation_trainers.agreed_cost_ht). Sans
 * cette migration, les valeurs apparaîtront en `[Placeholder]`.
 */

import { createClient } from "@/lib/supabase/server";
import { sanitizeError } from "@/lib/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  CONVENTION_INTERVENTION_HTML,
  CONVENTION_INTERVENTION_FOOTER_TEMPLATE,
} from "@/lib/templates/convention-intervention";
import {
  resolveDocumentVariables,
  loadEntitySettings,
  type ResolveContext,
} from "@/lib/utils/resolve-variables";
import {
  DocumentGenerationService,
  createDefaultEngine,
} from "@/lib/services/document-generation";
import type { Session, Trainer } from "@/lib/types";

/** Calcule le coût HT depuis formation_trainers : agreed_cost_ht > hourly × hours > daily × jours */
function computeAgreedCost(ft: {
  agreed_cost_ht?: number | null;
  hourly_rate?: number | null;
  hours_done?: number | null;
  daily_rate?: number | null;
  dates_done?: string | null;
}): number | null {
  if (typeof ft.agreed_cost_ht === "number" && ft.agreed_cost_ht > 0) {
    return ft.agreed_cost_ht;
  }
  if (typeof ft.hourly_rate === "number" && typeof ft.hours_done === "number") {
    return ft.hourly_rate * ft.hours_done;
  }
  if (typeof ft.daily_rate === "number" && ft.dates_done) {
    const days = ft.dates_done.split(",").filter(Boolean).length;
    if (days > 0) return ft.daily_rate * days;
  }
  return null;
}

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as { sessionId?: string; trainerId?: string };
    if (!body.sessionId || !body.trainerId) {
      return NextResponse.json(
        { error: "sessionId et trainerId sont obligatoires" },
        { status: 400 },
      );
    }

    // Session (gate entity_id)
    const { data: session } = await supabase
      .from("sessions")
      .select("*, training:trainings(*)")
      .eq("id", body.sessionId)
      .eq("entity_id", profile.entity_id)
      .single();
    if (!session) {
      return NextResponse.json(
        { error: "Session introuvable ou non autorisée" },
        { status: 404 },
      );
    }

    // Lien formation_trainers + trainer + coût HT
    const { data: ft } = await supabase
      .from("formation_trainers")
      .select(
        "agreed_cost_ht, hourly_rate, hours_done, daily_rate, dates_done, trainer:trainers(*)",
      )
      .eq("session_id", body.sessionId)
      .eq("trainer_id", body.trainerId)
      .maybeSingle();
    if (!ft || !(ft as { trainer?: unknown }).trainer) {
      return NextResponse.json(
        { error: "Formateur non rattaché à cette session" },
        { status: 404 },
      );
    }

    const ftTyped = ft as unknown as {
      agreed_cost_ht: number | null;
      hourly_rate: number | null;
      hours_done: number | null;
      daily_rate: number | null;
      dates_done: string | null;
      trainer: Trainer;
    };

    const costHt = computeAgreedCost(ftTyped);
    const trainerWithCost = {
      ...ftTyped.trainer,
      _agreed_cost_ht: costHt,
    } as Trainer & { _agreed_cost_ht: number | null };

    const entity = await loadEntitySettings(supabase, profile.entity_id);

    const context: ResolveContext = {
      session: session as unknown as Session,
      trainer: trainerWithCost,
      entity,
    };
    const resolvedHtml = resolveDocumentVariables(CONVENTION_INTERVENTION_HTML, context);
    const resolvedFooter = resolveDocumentVariables(CONVENTION_INTERVENTION_FOOTER_TEMPLATE, context);

    const engine = createDefaultEngine();
    const service = new DocumentGenerationService({ engine, supabase });

    const result = await service.generate({
      entityId: profile.entity_id,
      docType: "convention_intervention",
      html: resolvedHtml,
      cacheInputs: {
        doc_type: "convention_intervention",
        session_id: body.sessionId,
        trainer_id: body.trainerId,
        session_updated_at: (session as { updated_at?: string }).updated_at ?? null,
        custom_variables: {
          cost_ht: String(costHt ?? ""),
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

    return NextResponse.json({
      pdfBase64: result.buffer.toString("base64"),
      cacheHit: result.cacheHit,
      engineUsed: result.engineUsed,
      fileSizeBytes: result.fileSizeBytes,
      latencyMs: result.latencyMs,
      costHt,
    });
  } catch (err) {
    return NextResponse.json(
      { error: sanitizeError(err, "generating convention intervention") },
      { status: 500 },
    );
  }
}
