import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { enqueueEmail, type EmailAttachmentDescriptor } from "@/lib/services/email-queue";

/**
 * POST /api/documents/send-to-recipient
 *
 * Envoie un template document à 1 apprenant OU à tous les apprenants d'une session.
 * L'email est enqueued dans email_history (status='pending') avec le descripteur
 * d'attachment approprié selon le mode du template :
 *   - mode='docx_fidelity' → uploaded_docx (CloudConvert / LibreOffice)
 *   - mode='editable'      → généré via /api/documents/generate (HTML → CloudConvert)
 *
 * Le worker /api/emails/process-scheduled (toutes les 5 min) gère l'envoi
 * réel avec retry exponential.
 *
 * Body :
 * {
 *   template_id: string,
 *   target: { type: "learner", learner_id: string }
 *         | { type: "session", session_id: string },
 *   subject: string,
 *   body: string,
 *   variables?: Record<string, string>,
 * }
 *
 * Réponse : { enqueued: number, errors: string[] }
 */

const PayloadSchema = z.object({
  template_id: z.string().uuid(),
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("learner"), learner_id: z.string().uuid() }),
    z.object({ type: z.literal("session"), session_id: z.string().uuid() }),
  ]),
  subject: z.string().min(1),
  body: z.string().min(1),
  variables: z.record(z.string(), z.string()).optional(),
});

interface LearnerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
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
    return NextResponse.json({ error: sanitizeError(err, "send/payload") }, { status: 400 });
  }

  try {
    // 1. Charge le template (mode + source_docx_url + content)
    const { data: template } = await auth.supabase
      .from("document_templates")
      .select("id, name, mode, source_docx_url, content, type")
      .eq("id", payload.template_id)
      .eq("entity_id", auth.profile.entity_id)
      .single();

    if (!template) {
      return NextResponse.json({ error: "Template introuvable" }, { status: 404 });
    }

    const tplMode = (template.mode as "editable" | "docx_fidelity" | null) ?? "editable";
    const isWordMode = tplMode === "docx_fidelity";
    if (isWordMode && !template.source_docx_url) {
      return NextResponse.json(
        { error: "Template en mode docx_fidelity sans fichier .docx attaché" },
        { status: 400 }
      );
    }

    // 2. Charge la liste des destinataires
    const learners: LearnerRow[] = [];
    let sessionContext: { id: string; title: string } | null = null;

    if (payload.target.type === "learner") {
      const { data } = await auth.supabase
        .from("learners")
        .select("id, first_name, last_name, email")
        .eq("id", payload.target.learner_id)
        .eq("entity_id", auth.profile.entity_id)
        .single();
      if (!data) {
        return NextResponse.json({ error: "Apprenant introuvable" }, { status: 404 });
      }
      learners.push(data);
    } else {
      // Cible session : récupère tous les enrolled
      const { data: session } = await auth.supabase
        .from("sessions")
        .select("id, title")
        .eq("id", payload.target.session_id)
        .eq("entity_id", auth.profile.entity_id)
        .single();
      if (!session) {
        return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
      }
      sessionContext = session;

      const { data: enrollments } = await auth.supabase
        .from("enrollments")
        .select("learner:learners!enrollments_learner_id_fkey(id, first_name, last_name, email)")
        .eq("session_id", payload.target.session_id)
        .in("status", ["registered", "confirmed", "completed"]);

      for (const e of enrollments ?? []) {
        const l = e.learner as unknown as LearnerRow | null;
        if (l) learners.push(l);
      }
    }

    if (learners.length === 0) {
      return NextResponse.json(
        { error: "Aucun destinataire trouvé pour cette cible" },
        { status: 404 }
      );
    }

    // 3. Pour chaque destinataire : enqueue l'email avec attachment approprié
    const errors: string[] = [];
    let enqueued = 0;

    for (const learner of learners) {
      if (!learner.email) {
        errors.push(`${learner.first_name ?? "?"} ${learner.last_name ?? ""} : pas d'email`);
        continue;
      }

      try {
        // Combine variables fournies par l'admin + variables auto-déduites
        const autoVars: Record<string, string> = {
          nom_apprenant: `${learner.first_name ?? ""} ${learner.last_name ?? ""}`.trim(),
          prenom_apprenant: learner.first_name ?? "",
          email_apprenant: learner.email,
        };
        if (sessionContext) {
          autoVars.titre_formation = sessionContext.title;
        }
        const finalVars = { ...autoVars, ...(payload.variables ?? {}) };

        // Construit le descripteur d'attachment selon le mode
        const attachment: EmailAttachmentDescriptor = isWordMode
          ? {
              type: "uploaded_docx",
              filename: `${template.name}.pdf`,
              url: template.source_docx_url!,
              variables: finalVars,
            }
          : {
              // Mode editable : on n'a pas de .docx → on attache un PDF généré
              // depuis le HTML du template via le worker (qui passera par
              // /api/documents/generate quand il résoudra l'attachment).
              // Pour l'instant on utilise file_url avec une URL self qui retourne le PDF.
              // → Limitation MVP : en mode editable l'attachment est désactivé,
              //   le contenu HTML est mis dans le body de l'email à la place.
              type: "file_url",
              filename: `${template.name}.txt`,
              url: "data:text/plain,placeholder", // sera ignoré, fallback texte dans body
            };

        // Subject/body : substitue les variables {{xxx}} avec les valeurs
        const resolveVars = (s: string) =>
          s.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k) => finalVars[k] ?? `{{${k}}}`);

        await enqueueEmail(auth.supabase, {
          to: learner.email,
          subject: resolveVars(payload.subject),
          body: isWordMode
            ? resolveVars(payload.body)
            : `${resolveVars(payload.body)}\n\n---\n${template.content?.replace(/<[^>]*>/g, "") ?? ""}`,
          entity_id: auth.profile.entity_id,
          template_id: template.id,
          session_id: sessionContext?.id ?? null,
          recipient_type: "learner",
          recipient_id: learner.id,
          sent_by: auth.profile.id,
          attachments: isWordMode ? [attachment] : [], // attachments désactivés en mode editable (limitation MVP)
        });

        enqueued++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur inconnue";
        errors.push(`${learner.email}: ${msg}`);
      }
    }

    return NextResponse.json({ enqueued, errors });
  } catch (err) {
    console.error("[documents/send-to-recipient] error:", err);
    return NextResponse.json(
      { error: sanitizeError(err, "documents/send-to-recipient") },
      { status: 500 }
    );
  }
}
