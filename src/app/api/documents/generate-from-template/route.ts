import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { convertDocxToPdfWithVariables } from "@/lib/services/docx-converter";
import { generatePdfFromFragment } from "@/lib/services/pdf-generator";

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

const PayloadSchema = z.object({
  template_id: z.string().uuid(),
  context: z.object({
    session_id: z.string().uuid().optional(),
    learner_id: z.string().uuid().optional(),
    client_id: z.string().uuid().optional(),
    trainer_id: z.string().uuid().optional(),
  }),
  custom_variables: z.record(z.string(), z.string()).optional(),
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
    // 1. Charge le template
    const { data: template } = await auth.supabase
      .from("document_templates")
      .select("id, name, mode, source_docx_url, content")
      .eq("id", payload.template_id)
      .eq("entity_id", auth.profile.entity_id)
      .single();

    if (!template) {
      return NextResponse.json({ error: "Template introuvable" }, { status: 404 });
    }

    // 2. Construit les variables auto-déduites depuis le contexte
    const autoVars: Record<string, string> = {};

    if (payload.context.session_id) {
      const { data: session } = await auth.supabase
        .from("sessions")
        .select("title, start_date, end_date, location")
        .eq("id", payload.context.session_id)
        .single();
      if (session) {
        autoVars.titre_formation = session.title ?? "";
        autoVars.date_debut = session.start_date ?? "";
        autoVars.date_fin = session.end_date ?? "";
        autoVars.lieu = session.location ?? "";
      }
    }

    if (payload.context.learner_id) {
      const { data: learner } = await auth.supabase
        .from("learners")
        .select("first_name, last_name, email, phone")
        .eq("id", payload.context.learner_id)
        .single();
      if (learner) {
        autoVars.nom_apprenant = `${learner.first_name ?? ""} ${learner.last_name ?? ""}`.trim();
        autoVars.prenom_apprenant = learner.first_name ?? "";
        autoVars.email_apprenant = learner.email ?? "";
        autoVars.telephone_apprenant = learner.phone ?? "";
      }
    }

    if (payload.context.client_id) {
      const { data: client } = await auth.supabase
        .from("clients")
        .select("company_name")
        .eq("id", payload.context.client_id)
        .single();
      if (client) {
        autoVars.nom_client = client.company_name ?? "";
      }
    }

    if (payload.context.trainer_id) {
      const { data: trainer } = await auth.supabase
        .from("trainers")
        .select("first_name, last_name")
        .eq("id", payload.context.trainer_id)
        .single();
      if (trainer) {
        autoVars.nom_formateur = `${trainer.first_name ?? ""} ${trainer.last_name ?? ""}`.trim();
      }
    }

    autoVars.date_today = new Date().toLocaleDateString("fr-FR");

    // Custom variables override les auto-déduites
    const finalVars = { ...autoVars, ...(payload.custom_variables ?? {}) };

    // 3. Génération PDF selon le mode
    const tplMode = (template.mode as "editable" | "docx_fidelity" | null) ?? "editable";
    let pdfBase64: string;
    let sizeBytes: number;

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

    const filename = `${template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;

    return NextResponse.json({
      base64: pdfBase64,
      filename,
      sizeBytes,
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
