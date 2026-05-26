import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveVariables } from "@/lib/utils/resolve-variables";
import { enqueueEmail, type EmailAttachmentDescriptor } from "@/lib/services/email-queue";
import type { Session, Learner, Trainer } from "@/lib/types";

/**
 * Cœur d'exécution du moteur d'automatisation, partagé par les 3 modes de
 * run-cron (global / ciblé-trigger / ciblé-règle). Cf. spec §3.
 */

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DOCUMENT_TYPE_SUBJECTS: Record<string, string> = {
  convention_entreprise: "Convention de formation",
  convocation: "Convocation à la formation",
  certificat_realisation: "Certificat de réalisation",
  questionnaire_satisfaction: "Questionnaire de satisfaction",
};

export interface CustomTemplateInfo {
  id: string;
  name: string;
  mode: "editable" | "docx_fidelity" | null;
  source_docx_url: string | null;
}

export interface RecipientInfo {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  type: "learner" | "trainer";
}

export interface SessionInfo {
  id: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  entity_id: string;
  is_subcontracted?: boolean;
}

export interface RuleInfo {
  id: string;
  trigger_type: string;
  document_type: string;
  days_offset: number | null;
  recipient_type: string | null;
  template_id: string | null;
  condition_subcontracted: boolean | null;
  name: string | null;
}

export interface TemplateInfo {
  subject: string;
  body: string;
  attachment_doc_types: string[] | null;
}

/**
 * Document types correspondant à des questionnaires Qualiopi.
 * Pour ces règles, executeRuleForSession injecte un lien token public
 * (via ensureQuestionnaireToken) dans le body de l'email.
 *
 * Liste confirmée par Task 0 du Chantier 2c (grep default-packs.ts).
 *
 * Source : docs/superpowers/specs/2026-05-26-questionnaires-p0-5-auto-qualiopi-design.md §6.2
 */
export const QUESTIONNAIRE_DOCUMENT_TYPES = new Set<string>([
  "questionnaire_positionnement",
  "questionnaire_satisfaction",
  "questionnaire_satisfaction_froid",
  "questionnaire_satisfaction_client", // companies — pas dans mapping ci-dessous (learner_id NOT NULL)
]);

export function isQuestionnaireRule(rule: RuleInfo): boolean {
  return QUESTIONNAIRE_DOCUMENT_TYPES.has(rule.document_type);
}

/**
 * Mapping document_type → (table, colonne, valeur) pour résoudre
 * le questionnaire concret attribué à la session pour une règle donnée.
 *
 * Note : ne couvre que les 3 types `recipient_type: "learners"`. Le type
 * `questionnaire_satisfaction_client` (recipient_type: "companies") n'a pas
 * d'entry car la table questionnaire_tokens.learner_id est NOT NULL — donc
 * pas de token généré pour les destinataires entreprise. Limitation
 * documentée en spec §3.1.
 *
 * Limitation : si plusieurs questionnaires de même type sont attribués
 * à la session (rare), on prend le premier (LIMIT 1).
 */
const QUESTIONNAIRE_TYPE_TO_ASSIGNMENT: Record<string, {
  table: "formation_evaluation_assignments" | "formation_satisfaction_assignments";
  typeColumn: "evaluation_type" | "satisfaction_type";
  typeValue: string;
}> = {
  questionnaire_positionnement: {
    table: "formation_evaluation_assignments",
    typeColumn: "evaluation_type",
    typeValue: "eval_preformation",
  },
  questionnaire_satisfaction: {
    table: "formation_satisfaction_assignments",
    typeColumn: "satisfaction_type",
    typeValue: "satisfaction_chaud",
  },
  questionnaire_satisfaction_froid: {
    table: "formation_satisfaction_assignments",
    typeColumn: "satisfaction_type",
    typeValue: "satisfaction_froid",
  },
};

export async function resolveQuestionnaireIdForRule(
  supabase: SupabaseClient,
  rule: RuleInfo,
  sessionId: string,
): Promise<string | null> {
  const config = QUESTIONNAIRE_TYPE_TO_ASSIGNMENT[rule.document_type];
  if (!config) return null;

  const { data } = await supabase
    .from(config.table)
    .select("questionnaire_id")
    .eq("session_id", sessionId)
    .eq(config.typeColumn, config.typeValue)
    .limit(1)
    .maybeSingle();

  return (data?.questionnaire_id as string | undefined) ?? null;
}

/**
 * Pure — construit les descripteurs d'attachements d'un destinataire.
 * 2 sources : types système (string lisible) et templates Word custom (UUID).
 */
export function buildAttachmentsForRecipient(
  attachmentDocTypes: string[] | null | undefined,
  session: SessionInfo,
  recipient: RecipientInfo,
  recipientType: string,
  customTemplatesById: Record<string, CustomTemplateInfo>,
): EmailAttachmentDescriptor[] {
  if (!attachmentDocTypes || attachmentDocTypes.length === 0) return [];

  const descriptors: EmailAttachmentDescriptor[] = [];

  for (const docType of attachmentDocTypes) {
    // Cas 1 : UUID → template Word custom
    if (UUID_REGEX.test(docType)) {
      const tpl = customTemplatesById[docType];
      if (!tpl || tpl.mode !== "docx_fidelity" || !tpl.source_docx_url) continue;
      descriptors.push({
        type: "uploaded_docx",
        filename: `${tpl.name}.pdf`,
        url: tpl.source_docx_url,
        variables: {
          nom_apprenant: `${recipient.first_name ?? ""} ${recipient.last_name ?? ""}`.trim(),
          prenom_apprenant: recipient.first_name ?? "",
          email_apprenant: recipient.email ?? "",
          titre_formation: session.title ?? "",
          date_debut: session.start_date ?? "",
          date_fin: session.end_date ?? "",
          lieu: session.location ?? "",
          date_today: new Date().toLocaleDateString("fr-FR"),
        },
      });
      continue;
    }

    // Cas 2 : type système
    switch (docType) {
      case "convocation":
      case "certificat_realisation":
        if (recipient.type === "learner") {
          descriptors.push({ type: docType, payload: { session_id: session.id, learner_id: recipient.id } });
        }
        break;
      case "convention_entreprise":
        if (recipientType === "companies") {
          descriptors.push({ type: "convention_entreprise", payload: { session_id: session.id, client_id: recipient.id } });
        }
        break;
      case "convention_intervention":
        if (recipient.type === "trainer") {
          descriptors.push({ type: docType, payload: { session_id: session.id, trainer_id: recipient.id } });
        }
        break;
      case "programme_formation":
        descriptors.push({ type: "programme_formation", payload: { session_id: session.id } });
        break;
      case "feuille_emargement":
        if (recipient.type === "learner") {
          descriptors.push({ type: docType, payload: { session_id: session.id, learner_id: recipient.id } });
        }
        break;
      case "feuille_emargement_collectif":
        // ownerType "company" du registry — la collective est portée par le client.
        if (recipientType === "companies") {
          descriptors.push({ type: "feuille_emargement_collectif", payload: { session_id: session.id, client_id: recipient.id } });
        }
        break;
    }
  }
  return descriptors;
}

/** Pure — sujet + corps de repli quand la règle n'a pas de template email. */
export function buildFallbackEmail(
  rule: RuleInfo,
  session: SessionInfo,
  recipient: RecipientInfo,
): { subject: string; body: string } {
  const docLabel = DOCUMENT_TYPE_SUBJECTS[rule.document_type] ?? rule.document_type;
  return {
    subject: `${docLabel} — ${session.title}`,
    body: `Bonjour ${recipient.first_name} ${recipient.last_name},\n\nVeuillez trouver ci-joint votre document : ${docLabel}.\n\nFormation : ${session.title}\n\nCordialement,\nL'équipe de formation`,
  };
}

/** Résout les destinataires d'une session selon le recipient_type de la règle. */
export async function resolveRecipients(
  supabase: SupabaseClient,
  sessionId: string,
  recipientType: string,
): Promise<RecipientInfo[]> {
  const recipients: RecipientInfo[] = [];

  if (recipientType === "learners" || recipientType === "all") {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("learner:learners!enrollments_learner_id_fkey(id, email, first_name, last_name)")
      .eq("session_id", sessionId)
      .in("status", ["registered", "confirmed", "completed"]);
    for (const e of enrollments ?? []) {
      const l = e.learner as unknown as { id: string; email: string | null; first_name: string; last_name: string } | null;
      if (l?.email) recipients.push({ id: l.id, email: l.email, first_name: l.first_name, last_name: l.last_name, type: "learner" });
    }
  }

  if (recipientType === "trainers" || recipientType === "all") {
    const { data: trainerLinks } = await supabase
      .from("formation_trainers")
      .select("trainer:trainers!formation_trainers_trainer_id_fkey(id, email, first_name, last_name)")
      .eq("session_id", sessionId);
    for (const tl of trainerLinks ?? []) {
      const t = tl.trainer as unknown as { id: string; email: string | null; first_name: string; last_name: string } | null;
      if (t?.email) recipients.push({ id: t.id, email: t.email, first_name: t.first_name, last_name: t.last_name, type: "trainer" });
    }
  }

  if (recipientType === "companies") {
    const { data: companyLinks } = await supabase
      .from("formation_companies")
      .select("email, client:clients!formation_companies_client_id_fkey(id, company_name)")
      .eq("session_id", sessionId);
    for (const cl of companyLinks ?? []) {
      const c = cl.client as unknown as { id: string; company_name: string } | null;
      const companyEmail = (cl as { email: string | null }).email;
      // Les entreprises sont portées en type "learner" : les attachements
      // d'entreprise sont aiguillés par recipientType ("companies"), pas par recipient.type.
      if (c && companyEmail) recipients.push({ id: c.id, email: companyEmail, first_name: c.company_name, last_name: "", type: "learner" });
    }
  }

  return recipients;
}

/**
 * Exécute une règle pour une session : résout les destinataires, construit
 * sujet/corps (template ou repli) + attachements, enqueue chaque email.
 * Renvoie le nombre d'emails enqueués et ignorés (anti-doublon).
 * Une erreur d'enqueue par destinataire est journalisée sans interrompre les autres.
 *
 * @param args.dedupAgainstHistoryFromDate - YYYY-MM-DD optionnel. Quand fourni, les
 *   destinataires qui ont déjà reçu un email correspondant depuis cette date sont
 *   ignorés (anti-doublon pour le mode global cron quotidien). Omettre pour les
 *   modes ciblé-trigger et ciblé-règle (exécutions volontaires).
 */
export async function executeRuleForSession(
  supabase: SupabaseClient,
  args: {
    rule: RuleInfo;
    session: SessionInfo;
    template: TemplateInfo | null;
    customTemplatesById: Record<string, CustomTemplateInfo>;
    dedupAgainstHistoryFromDate?: string;
  },
): Promise<{ enqueued: number; skipped: number; failed: number }> {
  const { rule, session, template, customTemplatesById, dedupAgainstHistoryFromDate } = args;
  const recipientType = rule.recipient_type || "learners";
  const recipients = await resolveRecipients(supabase, session.id, recipientType);

  // Calculée une seule fois : la clé de matching anti-doublon dépend uniquement de la règle.
  const matchKey = dedupAgainstHistoryFromDate
    ? (rule.name || DOCUMENT_TYPE_SUBJECTS[rule.document_type] || rule.document_type)
    : "";

  let enqueued = 0;
  let skipped = 0;
  let failed = 0;
  for (const recipient of recipients) {
    // Anti-doublon : si une date de référence est fournie, on vérifie que le destinataire
    // n'a pas déjà reçu un email correspondant à cette règle depuis cette date.
    if (dedupAgainstHistoryFromDate) {
      const { count } = await supabase
        .from("email_history")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id)
        .eq("recipient_id", recipient.id)
        .eq("recipient_type", recipient.type)
        .ilike("subject", `%${matchKey}%`)
        .gte("sent_at", dedupAgainstHistoryFromDate);
      if (count && count > 0) { skipped++; continue; }
    }

    let subject: string;
    let body: string;
    if (template) {
      const ctx = {
        session: session as unknown as Session,
        learner: recipient.type === "learner" ? (recipient as unknown as Learner) : null,
        trainer: recipient.type === "trainer" ? (recipient as unknown as Trainer) : null,
      };
      subject = resolveVariables(template.subject, ctx);
      body = resolveVariables(template.body, ctx);
    } else {
      const fb = buildFallbackEmail(rule, session, recipient);
      subject = fb.subject;
      body = fb.body;
    }

    // Source des attachements :
    //   1. Le template email (s'il a un attachment_doc_types configuré) — priorité haute,
    //      l'admin a explicitement choisi quoi joindre.
    //   2. Sinon, on dérive [rule.document_type] — une règle de type sémantique
    //      (convocation, certificat_realisation, etc.) doit toujours envoyer le doc
    //      portant ce nom, même sans template. Évite le piège « règle créée par
    //      défaut → envoie un mail sans PJ ».
    //   3. Le type "email" est exclu : il désigne un message personnalisé sans doc
    //      à joindre (cas des règles avec template custom porteur des attachements).
    const effectiveAttachmentTypes =
      (template?.attachment_doc_types?.length ?? 0) > 0
        ? template!.attachment_doc_types
        : (rule.document_type && rule.document_type !== "email"
            ? [rule.document_type]
            : null);

    try {
      await enqueueEmail(supabase, {
        to: recipient.email,
        subject,
        body,
        entity_id: session.entity_id,
        session_id: session.id,
        recipient_type: recipient.type,
        recipient_id: recipient.id,
        attachments: buildAttachmentsForRecipient(
          effectiveAttachmentTypes,
          session,
          recipient,
          recipientType,
          customTemplatesById,
        ),
      });
      enqueued++;
    } catch (err) {
      console.error(`[automation] enqueue failed for ${recipient.email}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }
  return { enqueued, skipped, failed };
}
