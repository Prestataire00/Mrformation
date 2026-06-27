import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveVariables } from "@/lib/utils/resolve-variables";
import { enqueueEmail, type EmailAttachmentDescriptor } from "@/lib/services/email-queue";
import type { Session, Learner, Trainer } from "@/lib/types";
import { ensureQuestionnaireToken, buildPublicQuestionnaireUrl } from "@/lib/automation/questionnaire-token-helper";

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
  questionnaire_positionnement: "Questionnaire de positionnement",
  questionnaire_autoevaluation: "Auto-évaluation de fin de formation",
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
  // P1 : si false, la règle attribue (assignment + visibilité in-app) SANS
  // envoyer d'email. undefined/true ⇒ comportement historique (email envoyé).
  send_email?: boolean | null;
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
 * + questionnaire_autoevaluation (auto-éval post sur objectifs, spec auto-attribution).
 */
export const QUESTIONNAIRE_DOCUMENT_TYPES = new Set<string>([
  "questionnaire_positionnement",
  "questionnaire_autoevaluation",
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
  /** quality_indicator_type du questionnaire default d'entité (auto-attribution). */
  qualityIndicator: string;
}> = {
  questionnaire_positionnement: {
    table: "formation_evaluation_assignments",
    typeColumn: "evaluation_type",
    typeValue: "auto_eval_pre",
    qualityIndicator: "auto_eval_pre",
  },
  questionnaire_autoevaluation: {
    table: "formation_evaluation_assignments",
    typeColumn: "evaluation_type",
    typeValue: "auto_eval_post",
    qualityIndicator: "auto_eval_post",
  },
  questionnaire_satisfaction: {
    table: "formation_satisfaction_assignments",
    typeColumn: "satisfaction_type",
    typeValue: "satisfaction_chaud",
    qualityIndicator: "satisfaction_chaud",
  },
  questionnaire_satisfaction_froid: {
    table: "formation_satisfaction_assignments",
    typeColumn: "satisfaction_type",
    typeValue: "satisfaction_froid",
    qualityIndicator: "satisfaction_froid",
  },
};

/**
 * Résout le questionnaire concret à envoyer pour une règle questionnaire.
 *
 * 1. Si un assignment explicite existe déjà pour la session → priorité (comportement
 *    historique : l'admin a attribué manuellement un questionnaire à la session).
 * 2. Sinon, AUTO-ATTRIBUTION (spec auto-attribution) : à condition de connaître
 *    `entityId`, on résout le questionnaire actif par défaut de l'entité pour
 *    l'indicateur qualité de la règle, et on crée l'assignment correspondant
 *    (lazy, traçabilité Qualiopi). L'assignment naît ainsi au déclenchement du
 *    trigger, sans hook à la création de session.
 *
 * Retourne null si : document_type hors mapping, aucun questionnaire default
 * pour l'entité, ou `entityId` absent (impossible de résoudre l'auto-attribution).
 */
export async function resolveQuestionnaireIdForRule(
  supabase: SupabaseClient,
  rule: RuleInfo,
  sessionId: string,
  entityId?: string,
): Promise<string | null> {
  const config = QUESTIONNAIRE_TYPE_TO_ASSIGNMENT[rule.document_type];
  if (!config) return null;

  // 1. Assignment explicite déjà présent → priorité.
  const { data: existing } = await supabase
    .from(config.table)
    .select("questionnaire_id")
    .eq("session_id", sessionId)
    .eq(config.typeColumn, config.typeValue)
    .limit(1)
    .maybeSingle();
  if (existing?.questionnaire_id) return existing.questionnaire_id as string;

  // 2. Auto-attribution : sans entité, on ne peut pas résoudre le questionnaire default.
  if (!entityId) return null;

  const { data: defaultQ } = await supabase
    .from("questionnaires")
    .select("id")
    .eq("entity_id", entityId)
    .eq("quality_indicator_type", config.qualityIndicator)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const questionnaireId = defaultQ?.id as string | undefined;
  if (!questionnaireId) {
    console.warn(
      `[execute-rule] aucun questionnaire actif '${config.qualityIndicator}' pour l'entité ${entityId} — règle ${rule.document_type} ignorée`,
    );
    return null;
  }

  // 3. Création lazy de l'assignment (en masse : learner_id/target_id = null).
  const insertRow = config.table === "formation_evaluation_assignments"
    ? { session_id: sessionId, questionnaire_id: questionnaireId, evaluation_type: config.typeValue, learner_id: null }
    : { session_id: sessionId, questionnaire_id: questionnaireId, satisfaction_type: config.typeValue, target_type: "learner", target_id: null };
  const { error: insErr } = await supabase.from(config.table).insert(insertRow);
  // Violation d'unicité = l'assignment masse existe déjà (créé en concurrence) :
  // bénin, l'index unique partiel garantit l'idempotence (cf. migration seed).
  const isDuplicate = !!insErr && (
    (insErr as { code?: string }).code === "23505" ||
    /duplicate|unique/i.test(insErr.message ?? "")
  );
  if (insErr && !isDuplicate) {
    // Ne bloque pas l'envoi : le questionnaire est résolu, l'assignment est best-effort.
    console.error(`[execute-rule] création assignment ${config.table} échouée:`, insErr.message);
  }

  // Visibilité in-app drift-proof : l'espace apprenant liste les questionnaires
  // via `questionnaire_sessions` (pas via les assignments). On garantit le
  // miroir explicitement — sans dépendre du trigger SQL de mirroring qui peut
  // ne pas être déployé en prod (cf. P3). Idempotent via onConflict.
  const { error: mirrorErr } = await supabase
    .from("questionnaire_sessions")
    .upsert(
      { questionnaire_id: questionnaireId, session_id: sessionId },
      { onConflict: "questionnaire_id,session_id" },
    );
  if (mirrorErr) {
    console.error(`[execute-rule] miroir questionnaire_sessions échoué:`, mirrorErr.message);
  }

  return questionnaireId;
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

    // Cas 2 : type système — routing par recipient scope
    // em-c-8 — Extension à ~22 doc_types présents dans SYSTEM_TEMPLATES_BY_DOC_TYPE
    // (registry.ts). Classification par scope du destinataire :

    if (LEARNER_DOC_TYPES.has(docType)) {
      if (recipient.type === "learner") {
        descriptors.push({
          type: docType,
          payload: { session_id: session.id, learner_id: recipient.id },
        } as EmailAttachmentDescriptor);
      }
      continue;
    }

    if (COMPANY_DOC_TYPES.has(docType)) {
      if (recipientType === "companies") {
        descriptors.push({
          type: docType,
          payload: { session_id: session.id, client_id: recipient.id },
        } as EmailAttachmentDescriptor);
      }
      continue;
    }

    if (TRAINER_DOC_TYPES.has(docType)) {
      if (recipient.type === "trainer") {
        descriptors.push({
          type: docType,
          payload: { session_id: session.id, trainer_id: recipient.id },
        } as EmailAttachmentDescriptor);
      }
      continue;
    }

    if (SESSION_DOC_TYPES.has(docType)) {
      descriptors.push({
        type: docType,
        payload: { session_id: session.id },
      } as EmailAttachmentDescriptor);
      continue;
    }

    // Doc type non classifié = silencieusement skip (n'attache rien).
    // Concerne notamment : attestation_assiduite, cgv, politique_confidentialite,
    // reglement_interieur, feuille_emargement_vierge, planning_hebdo_signe
    // (présents dans registry mais ABSENTS du UNION EmailAttachmentDescriptor
    // — ne peuvent pas être routés depuis ce helper). Cleanup futur si besoin.
  }
  return descriptors;
}

// em-c-8 — Classification des doc_types par scope destinataire.
// Source : SYSTEM_TEMPLATES_BY_DOC_TYPE dans src/lib/templates/registry.ts.
// Seuls les doc_types présents dans le registry sont listés ici (ceux absents
// retourneraient null à la génération côté resolver → cleanup UI dans page.tsx).

// Source de vérité : union EmailAttachmentDescriptor dans email-queue.ts.
// Tout doc_type listé ici DOIT exister dans ce union, sinon le push descriptor
// échoue runtime (le cast `as EmailAttachmentDescriptor` masque le bug TS).

/** Documents personnels d'apprenant : convocation, certificats, attestations, etc. */
const LEARNER_DOC_TYPES = new Set<string>([
  "convocation",
  "certificat_realisation",
  "feuille_emargement",
  "attestation_aipr",
  "attestation_competences",
  "attestation_abandon_formation",
  "certificat_travail_hauteur",
  "certificat_diplome",
  "autorisation_image",
  "decharge_responsabilite",
  "lettre_decharge_responsabilite",
  "contrat_engagement_stagiaire",
  // 9 variants avis_hab_elec_* (tous présents dans EmailAttachmentDescriptor)
  "avis_hab_elec_generique",
  "avis_hab_elec_b0_bf_bs",
  "avis_hab_elec_b1v_b2v_br",
  "avis_hab_elec_bf_hf",
  "avis_hab_elec_bt",
  "avis_hab_elec_bt_ht",
  "avis_hab_elec_h0_b0",
  "avis_hab_elec_h0_b0_bf_hf_bs",
  "avis_hab_elec_h0_b0_initial",
]);

/** Documents adressés à l'entreprise cliente. */
const COMPANY_DOC_TYPES = new Set<string>([
  "convention_entreprise",
  "feuille_emargement_collectif",
]);

/** Documents adressés au formateur. */
const TRAINER_DOC_TYPES = new Set<string>([
  "convention_intervention",
  "charte_formateur",
]);

/** Documents session-only (sans recipient_id). */
const SESSION_DOC_TYPES = new Set<string>([
  "programme_formation",
  "bilan_poe",
  "reponses_evaluations",
  "reponses_satisfaction_session",
  "resultats_evaluations",
]);

/** Exporté pour tests guardrail. */
export const ATTACHMENT_DOC_TYPE_SETS = {
  LEARNER: LEARNER_DOC_TYPES,
  COMPANY: COMPANY_DOC_TYPES,
  TRAINER: TRAINER_DOC_TYPES,
  SESSION: SESSION_DOC_TYPES,
} as const;

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

/**
 * Résout les destinataires d'une session selon le recipient_type de la règle.
 *
 * @param opts.onlyLearnerId — si fourni, restreint les recipients de type
 *   "learner" à ce learner_id uniquement (pas d'effet sur trainers/companies).
 *   Cas d'usage : trigger `on_enrollment` aut-d-1, où l'on veut notifier
 *   seulement le nouvel apprenant inscrit, pas tous les apprenants existants.
 */
export async function resolveRecipients(
  supabase: SupabaseClient,
  sessionId: string,
  recipientType: string,
  opts?: { onlyLearnerId?: string },
): Promise<RecipientInfo[]> {
  const recipients: RecipientInfo[] = [];

  if (recipientType === "learners" || recipientType === "all") {
    let query = supabase
      .from("enrollments")
      .select("learner:learners!enrollments_learner_id_fkey(id, email, first_name, last_name)")
      .eq("session_id", sessionId)
      .in("status", ["registered", "confirmed", "completed"]);
    if (opts?.onlyLearnerId) {
      query = query.eq("learner_id", opts.onlyLearnerId);
    }
    const { data: enrollments } = await query;
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
 * @param args.onlyLearnerId - optionnel. Quand fourni, restreint les destinataires
 *   de type "learner" à cet apprenant uniquement (cas trigger `on_enrollment`).
 */
export async function executeRuleForSession(
  supabase: SupabaseClient,
  args: {
    rule: RuleInfo;
    session: SessionInfo;
    template: TemplateInfo | null;
    customTemplatesById: Record<string, CustomTemplateInfo>;
    dedupAgainstHistoryFromDate?: string;
    onlyLearnerId?: string;
  },
): Promise<{ enqueued: number; skipped: number; failed: number }> {
  const { rule, session, template, customTemplatesById, dedupAgainstHistoryFromDate, onlyLearnerId } = args;
  const recipientType = rule.recipient_type || "learners";
  const recipients = await resolveRecipients(supabase, session.id, recipientType, { onlyLearnerId });

  // P1 : règle questionnaire en mode « in-app only » (send_email=false). On crée
  // l'assignment (attribution) + le miroir `questionnaire_sessions` (visibilité
  // dans l'espace apprenant), puis on s'arrête SANS générer de token ni d'email.
  // Attention : resolveQuestionnaireIdForRule est sinon appelé DANS le bloc email
  // ci-dessous — d'où cette branche dédiée pour ne pas perdre l'attribution.
  // send_email undefined/true ⇒ on ne passe pas ici ⇒ comportement historique.
  if (isQuestionnaireRule(rule) && rule.send_email === false) {
    await resolveQuestionnaireIdForRule(supabase, rule, session.id, session.entity_id);
    return { enqueued: 0, skipped: recipients.length, failed: 0 };
  }

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

    // NEW : Injection token questionnaire (Chantier 2c P0-5)
    if (isQuestionnaireRule(rule) && recipient.type === "learner") {
      const questionnaireId = await resolveQuestionnaireIdForRule(supabase, rule, session.id, session.entity_id);
      if (questionnaireId) {
        try {
          const tokenResult = await ensureQuestionnaireToken(
            supabase, session.id, questionnaireId, recipient.id, session.entity_id,
          );
          const questionnaireLink = buildPublicQuestionnaireUrl(tokenResult.token);

          // Si {{questionnaire_link}} présent dans le body, remplacer (templates customs avancés)
          if (body.includes("{{questionnaire_link}}")) {
            body = body.replaceAll("{{questionnaire_link}}", questionnaireLink);
          } else {
            // Sinon auto-append en fin de body (templates customs basiques + fallback)
            body += `\n\n📝 Lien direct vers le questionnaire :\n${questionnaireLink}`;
          }
        } catch (err) {
          // En cas d'erreur (token impossible à générer), on log mais on envoie
          // l'email quand même (sans lien). Pas de régression par rapport à l'existant.
          console.error("[execute-rule] questionnaire token generation failed:", err);
        }
      }
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
