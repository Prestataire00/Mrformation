import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate } from "@/lib/utils";
import { addDays, getISOWeek, startOfISOWeek, endOfISOWeek, format } from "date-fns";
import type { Session, Client, Learner, Trainer } from "@/lib/types";
import { getLearnersForCompany, getAmountForCompany } from "@/lib/utils/formation-companies";
import { formatTimeParis, getHourParis } from "@/lib/utils/paris-time";
import { isSyntheticEmail } from "@/lib/utils/learner-email-synthetic";

export interface ResolveContext {
  session?: Session | null;
  client?: Client | null;
  learner?: Learner | null;
  trainer?: Trainer | null;
  profile?: { first_name: string; last_name: string } | null;
  /**
   * IDs d'apprenants ayant signé pour la session (table `signatures`).
   * Utilisé par `{{tableau_signature_compact}}` pour afficher Présent/Absent.
   * Si `undefined` → fallback "tous Présent" (mode mock).
   */
  signedLearnerIds?: Set<string>;
  /**
   * Credentials de connexion de l'apprenant pour la convocation
   * (cf src/lib/services/learner-account.ts:ensureLearnerAccount).
   * Si undefined → fallback "[Mot de passe apprenant]" dans le template.
   */
  learnerCredentials?: { email: string; tempPassword: string };
  /**
   * Lot H : QR code data URL (data:image/png;base64,...) pointant vers
   * la page de connexion. Pré-calculé côté API via `qrcode` (toDataURL
   * async, impossible côté builder sync). Utilisé par
   * `{{qr_code_connexion}}` dans le template convocation.
   */
  loginQrCodeDataUrl?: string;
  /**
   * Signature SVG du document courant (table `documents.signature_data`)
   * pour insérer la signature du signataire (client, formateur, etc.) dans
   * le PDF du document signé. Cf h-2 Epic H : Story C n'avait jamais
   * branché cette variable, donc les conventions signées affichaient un
   * PDF sans signature.
   */
  documentSignature?: string;
  /**
   * Map signer_id → signature_data URL (depuis table signatures).
   * Inclut apprenants ET formateurs. Si présente, les builders
   * `{{tableau_signature_compact}}` et `{{tableau_signature_individuel}}`
   * affichent l'image de signature à la place du texte "Présent (A signé...)".
   * Si signer_id absent du Map → fallback texte "Présent" (mode mock /
   * compat ancien comportement).
   */
  signaturesById?: Map<string, string>;
  /**
   * Map "slotId|signerId|signerType" → signature_data, pour lookup slot-aware
   * (utilisé par {{tableau_planning_hebdo}}). Si undefined, le resolver tombe
   * back sur des cellules vides.
   */
  signaturesBySlotPerson?: Map<string, string>;
  /**
   * Code d'identification unique du certificat (diplôme). Calculé via
   * `generateCertificateCode(learnerId, sessionId)` côté API. Utilisé par
   * `{{code_certificat}}` dans le template certificat-diplome.
   */
  certificateCode?: string;
  /**
   * Résultat de l'examen AIPR : "success" → "a réussi", "echec" → "a échoué".
   * Défaut "success" si non défini. Utilisé par `{{resultat_examen_aipr}}`.
   */
  aiprExamResult?: "success" | "echec";
  /**
   * Résultats d'évaluations de l'apprenant pour la session. Pré-chargés
   * côté API depuis questionnaire_responses (avec score calculé). Utilisé
   * par `{{tableau_resultats_evaluations}}` dans le doc résultats-evaluations.
   * Si vide → message "Aucune évaluation complétée".
   */
  evaluationResults?: Array<{
    title: string;
    completedAt: string | null;
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
    status: "acquis" | "non_acquis" | "complete" | "non_complete";
  }>;
  /**
   * Agrégats session (vue admin) pour le doc "Réponses satisfaction apprenants".
   * Pré-chargés côté API via `loadSessionAggregates`.
   */
  sessionAggregates?: {
    satisfaction: Array<{
      questionText: string;
      questionType: string;
      averageRating: number | null;
      distribution: { value: string; count: number }[];
      responseCount: number;
    }>;
    qualiopi: {
      totalLearners: number;
      signedLearnersCount: number;
      completionRate: number;
      satisfactionRate: number | null;
      satisfactionResponses: number;
      acquisitionRate: number | null;
      evaluationCount: number;
    };
    evaluations: Array<{
      title: string;
      responseCount: number;
      totalEnrolled: number;
      averageScorePct: number | null;
      acquisRate: number | null;
    }>;
  };
  entity?: {
    name?: string | null;  // ajouté Story B-Convention : utilisé par `{{nom_organisme}}`
    siret?: string | null;
    nda?: string | null;
    address?: string | null;
    postal_code?: string | null;
    city?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    president_name?: string | null;
    president_title?: string | null;
    signature_text?: string | null;
    stamp_url?: string | null;
    signature_url?: string | null;
    logo_url?: string | null;
  } | null;
}

const MODE_LABELS: Record<string, string> = {
  presentiel: "En présentiel",
  distanciel: "À distance",
  hybride: "Hybride (présentiel et distanciel)",
};

/**
 * Rendu d'une cellule d'émargement non signée, comportement date-aware.
 *
 * Spec : docs/superpowers/specs/2026-05-17-emargement-collectif-fix-default-status-design.md
 * Bug initial : le fallback hardcodé "Présent (A signé en présentiel)" était
 * affiché pour tous les apprenants même sans signature → trompeur pour Qualiopi.
 *
 * Nouvelle logique :
 * - Session passée (end_date < now)   → "Non signé" rouge italique
 * - Session à venir / end_date inconnu → cellule vide (prête pour signature manuscrite)
 */
export function renderUnsignedCell(sessionEndDate: string | null | undefined): string {
  if (!sessionEndDate) return "";
  const isPastSession = new Date(sessionEndDate) < new Date();
  if (isPastSession) {
    return `<span class="person-status status-unsigned">Non signé</span>`;
  }
  return "";
}

/**
 * Replaces {{variable}} placeholders in content with actual data.
 * Shared between document generation and email sending.
 */
export function resolveVariables(content: string, data: ResolveContext): string {
  const now = new Date();
  const trainerName = data.trainer
    ? `${data.trainer.first_name} ${data.trainer.last_name}`
    : data.session?.trainer
      ? `${data.session.trainer.first_name} ${data.session.trainer.last_name}`
      : "[Nom formateur]";

  // Build client address from components (format français : "rue, CP ville")
  const clientAddress = (() => {
    const c = data.client;
    if (!c) return "[Adresse client]";
    const street = c.address;
    const cityLine = [c.postal_code, c.city].filter(Boolean).join(" ");
    const parts = [street, cityLine].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "[Adresse client]";
  })();

  // Client representative: contact primary > 1er contact > fallback "Représentant légal" (vs placeholder visible)
  const clientRepresentant = (() => {
    const c = data.client;
    if (!c) return "Représentant légal";
    if (c.contacts && c.contacts.length > 0) {
      const primary = c.contacts.find((ct) => ct.is_primary) || c.contacts[0];
      const last = primary.last_name?.toUpperCase() ?? "";
      const first = primary.first_name ?? "";
      const full = `${last} ${first}`.trim();
      if (full) return full;
    }
    // Pas de contact rattaché → "Représentant légal" plutôt que "[Représentant]"
    // qui ressemble à une variable non résolue dans le PDF rendu.
    return "Représentant légal";
  })();

  // Multi-entreprises : si on a un client (entreprise destinataire du doc),
  // filtrer les apprenants ET le montant par cette entreprise via les helpers PR 13.
  // INTRA = tous les apprenants (auto-assign virtuel via helper).
  // INTER = filtre strict par client_id.
  // Fallback (pas de client) = tous les apprenants (comportement legacy).
  const companyId = data.client?.id;
  const allEnrollments = data.session?.enrollments || [];
  const enrollments = (data.session && companyId)
    ? getLearnersForCompany(data.session, companyId)
    : allEnrollments;

  // Financial calculations — utilise amount de l'entreprise si companyId fourni,
  // sinon total_price de la session (legacy).
  const totalPrice = (data.session && companyId)
    ? (getAmountForCompany(data.session, companyId) ?? data.session?.total_price ?? 0)
    : (data.session?.total_price || 0);
  const montantHt = totalPrice;
  const montantTva = Math.round(totalPrice * 0.2 * 100) / 100;
  const montantTtc = Math.round((totalPrice + montantTva) * 100) / 100;

  // Enrollments count + list (déjà filtrés ci-dessus)
  const effectifs = enrollments.length;
  const listeApprenants = enrollments
    .filter((e) => e.learner)
    .map((e) => `${e.learner!.last_name?.toUpperCase()} ${e.learner!.first_name}`)
    .join(", ") || "[Liste apprenants]";

  // Formation mode
  const formationModalite = data.session?.mode
    ? MODE_LABELS[data.session.mode] || data.session.mode
    : "[Modalité]";

  // Duration
  const dureeHeures = data.session?.planned_hours
    ? String(data.session.planned_hours)
    : "[Durée heures]";

  // All trainers (from formation_trainers relation)
  const allTrainers = data.session?.formation_trainers;
  const formateursNoms = allTrainers && allTrainers.length > 0
    ? allTrainers
        .filter((ft) => ft.trainer)
        .map((ft) => `${ft.trainer!.last_name?.toUpperCase()} ${ft.trainer!.first_name}`)
        .join(", ")
    : trainerName;

  const replacements: Record<string, string> = {
    // Existing variables
    "{{nom_client}}": data.client?.company_name || "",
    "{{nom_apprenant}}": data.learner
      ? `${data.learner.first_name} ${data.learner.last_name}`
      : "[Nom apprenant]",
    "{{prenom_apprenant}}": data.learner?.first_name || "[Prénom apprenant]",
    "{{nom_formateur}}": trainerName,
    "{{titre_formation}}": data.session?.title || "[Titre formation]",
    "{{date_formation}}": data.session
      ? formatDate(data.session.start_date)
      : "[Date formation]",
    "{{date_debut}}": data.session
      ? formatDate(data.session.start_date)
      : "[Date début]",
    "{{date_fin}}": data.session
      ? formatDate(data.session.end_date)
      : "[Date fin]",
    "{{lieu}}": data.session?.location || "[Lieu]",
    "{{duree_heures}}": dureeHeures,
    "{{date_today}}": formatDate(now.toISOString()),
    "{{numero_facture}}": `FACT-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    "{{montant}}": montantHt > 0 ? `${montantHt.toFixed(2)}` : "[Montant HT]",
    "{{signature_apprenant}}": "[Signature apprenant]",
    "{{signature_formateur}}": "[Signature formateur]",
    // Pédagogie V2 Epic 2.5 — Phase B Task 12 :
    // {{email_apprenant}} doit retourner "" si l'email est synthétique
    // (`<username>@learner.<entity_slug>.local`), car ces emails ne sont jamais
    // routables et ne doivent pas être affichés dans un document/email destiné
    // à l'apprenant. Cf. src/lib/utils/learner-email-synthetic.ts.
    "{{email_apprenant}}": (() => {
      const learnerEmail = data.learner?.email;
      if (!learnerEmail) return "";
      if (isSyntheticEmail(learnerEmail)) return "";
      return learnerEmail;
    })(),
    // Pédagogie V2 Epic 2.5 — Phase B Task 12 :
    // {{identifiant_apprenant}} = `learners.username` (slug stable utilisé pour
    // se connecter sans email), avec fallback sur l'email réel si pas de
    // username encore (apprenants pré-Epic 2.5). Le champ `username` est ajouté
    // par la migration `add_learner_username_credentials.sql` et n'est pas
    // encore typé dans `Learner` — cast contrôlé via `Record<string, unknown>`.
    "{{identifiant_apprenant}}": (() => {
      const learner = data.learner as unknown as Record<string, unknown> | null | undefined;
      const username = typeof learner?.username === "string" ? learner.username : "";
      if (username) return username;
      return data.learner?.email || "";
    })(),
    "{{telephone_apprenant}}": data.learner?.phone || "[Téléphone apprenant]",
    "{{entreprise_contact}}": clientRepresentant,
    "{{telephone_client}}": (data.client as unknown as Record<string, string>)?.phone || "[Téléphone client]",
    "{{email_client}}": (data.client as unknown as Record<string, string>)?.email || "[Email client]",
    "{{nom_commercial}}": data.profile
      ? `${data.profile.first_name} ${data.profile.last_name}`
      : "[Nom commercial]",
    "{{lien_connexion}}": "[Lien de connexion]",
    "{{date_limite}}": "[Date limite]",

    // New variables for documents officiels
    "{{client_adresse}}": clientAddress,
    "{{client_siret}}": data.client?.siret || "[SIRET client]",
    "{{client_representant}}": clientRepresentant,
    "{{montant_ht}}": montantHt > 0 ? montantHt.toFixed(2) : "[Montant HT]",
    "{{montant_ttc}}": montantTtc > 0 ? montantTtc.toFixed(2) : "[Montant TTC]",
    "{{montant_tva}}": montantTva > 0 ? montantTva.toFixed(2) : "[Montant TVA]",
    "{{formation_effectifs}}": effectifs > 0 ? String(effectifs) : "[Effectifs]",
    "{{liste_apprenants}}": listeApprenants,
    "{{formation_modalite}}": formationModalite,
    "{{formateurs_noms}}": formateursNoms,

    // Programme
    "{{programme_objectifs}}": (() => {
      const p = data.session?.program;
      if (!p) return data.session?.training?.objectives || "[Objectifs]";
      return p.objectives || "[Objectifs]";
    })(),
    "{{programme_prerequis}}": (() => {
      // h-8 : fallback session → program.content → training
      if (data.session?.prerequisites) return data.session.prerequisites;
      const c = (data.session?.program?.content || {}) as Record<string, string>;
      return c.prerequisites || data.session?.training?.prerequisites || "Aucun prérequis particulier";
    })(),
    "{{programme_public}}": (() => {
      const c = (data.session?.program?.content || {}) as Record<string, string>;
      return c.target_audience || "[Public visé]";
    })(),
    "{{programme_contenu}}": (() => {
      const c = (data.session?.program?.content || {}) as Record<string, string>;
      return c.progression || c.content || "[Contenu du programme]";
    })(),

    // === Variables Story B-Programme (template programme-formation.ts) ===
    "{{description_formation}}": (() => {
      const p = data.session?.program;
      return p?.description || data.session?.training?.description || "";
    })(),
    "{{date_creation_programme}}": (() => {
      const p = data.session?.program;
      const created = p?.created_at || data.session?.training?.created_at;
      return created ? formatDate(created) : "";
    })(),
    "{{duree_jours}}": (() => {
      const c = (data.session?.program?.content || {}) as Record<string, unknown>;
      if (typeof c.duration_days === "number") return c.duration_days.toFixed(2);
      // Fallback : calcul depuis start/end (jours calendaires)
      if (data.session?.start_date && data.session?.end_date) {
        const d1 = new Date(data.session.start_date);
        const d2 = new Date(data.session.end_date);
        const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
        return diff > 0 ? diff.toFixed(2) : "1.00";
      }
      return "";
    })(),
    "{{version_programme}}": (() => {
      const p = data.session?.program;
      return p?.version ? String(p.version) : "1";
    })(),
    // Story h-8 (Epic H) : fallback chain session → program → training
    // pour les champs pédagogiques. Permet à l'admin de surcharger au
    // niveau session sans avoir à créer/modifier le programme parent.
    "{{delais_acces}}": (() => {
      const s = data.session;
      if (s?.access_delay_days != null) return String(s.access_delay_days);
      const c = (s?.program?.content || {}) as Record<string, unknown>;
      return typeof c.access_delay_days === "number" ? String(c.access_delay_days) : "";
    })(),
    "{{modalite_acces}}": (() => {
      const s = data.session;
      if (s?.access_modality) return s.access_modality;
      const c = (s?.program?.content || {}) as Record<string, unknown>;
      return typeof c.access_modality === "string" ? c.access_modality : "";
    })(),
    "{{profil_stagiaire}}": (() => {
      const s = data.session;
      if (s?.target_audience) return s.target_audience;
      const c = (s?.program?.content || {}) as Record<string, unknown>;
      return typeof c.target_audience === "string" ? c.target_audience : "[Profil du stagiaire]";
    })(),
    "{{equipe_pedagogique}}": (() => {
      const s = data.session;
      if (s?.team_description) return s.team_description;
      const c = (s?.program?.content || {}) as Record<string, unknown>;
      const team = typeof c.team_description === "string" ? c.team_description : "";
      return team || formateursNoms || "";
    })(),
    "{{moyens_pedagogiques}}": (() => {
      const s = data.session;
      // Session a un champ TEXT libre, program a un tableau JSONB — adapter au format
      if (s?.pedagogical_resources) {
        // Si plusieurs lignes, on les rend en bullets ; sinon en paragraphe
        const items = s.pedagogical_resources.split(/\n+/).map((l) => l.trim().replace(/^[•\-*]\s*/, "")).filter(Boolean);
        if (items.length > 1) return `<ul class="bullets">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
        return `<p>${s.pedagogical_resources}</p>`;
      }
      const c = (s?.program?.content || {}) as Record<string, unknown>;
      const items = Array.isArray(c.pedagogical_resources) ? (c.pedagogical_resources as string[]) : [];
      if (items.length === 0) return `<p style="color:#9ca3af;font-style:italic;">À renseigner dans : fiche Programme → « Ressources pédagogiques », ou champ libre au niveau de la session.</p>`;
      return `<ul class="bullets">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
    })(),
    "{{dispositif_evaluation}}": (() => {
      const s = data.session;
      if (s?.evaluation_methods) {
        const items = s.evaluation_methods.split(/\n+/).map((l) => l.trim().replace(/^[•\-*]\s*/, "")).filter(Boolean);
        if (items.length > 1) return `<ul class="bullets">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
        return `<p>${s.evaluation_methods}</p>`;
      }
      const c = (s?.program?.content || {}) as Record<string, unknown>;
      const items = Array.isArray(c.evaluation_methods) ? (c.evaluation_methods as string[]) : [];
      if (items.length === 0) return `<p style="color:#9ca3af;font-style:italic;">À renseigner dans : fiche Programme → « Méthodes d'évaluation », ou champ libre au niveau de la session.</p>`;
      return `<ul class="bullets">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
    })(),
    "{{taux_satisfaction}}": (() => {
      const c = (data.session?.program?.content || {}) as Record<string, unknown>;
      return typeof c.satisfaction_rate === "number" ? c.satisfaction_rate.toFixed(1) : "";
    })(),
    "{{effectif_max}}": (() => {
      const m = data.session?.max_participants ?? data.session?.training?.max_participants;
      return m ? String(m) : "";
    })(),
    // Liste HTML des objectifs pédagogiques — fallback chain :
    // session.pedagogical_objectives → program.objectives → training.objectives
    // Split sur newlines / bullets (texte libre).
    "{{liste_objectifs_pedagogiques}}": (() => {
      const raw = data.session?.pedagogical_objectives
        || data.session?.program?.objectives
        || data.session?.training?.objectives
        || "";
      if (!raw) {
        return `<p style="color:#9ca3af;font-style:italic;">À renseigner dans : fiche Programme → « Objectifs pédagogiques » (priorité 1), ou fiche Formation (Training) → « Objectifs » (priorité 2), ou directement sur la session.</p>`;
      }
      // Split par newline, retire bullets/dashes en début de ligne
      const items = raw
        .split(/\n+/)
        .map((l) => l.trim().replace(/^[•\-*]\s*/, ""))
        .filter(Boolean);
      if (items.length === 0) return `<p>${raw}</p>`;
      return `<ul class="bullets">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
    })(),
    // Builder principal du programme : groupe `program.content.modules[]` par
    // day_number puis par slot (matin/aprem), rend pour chaque (jour, slot) un
    // tableau "Contenu | Animation". Si modules sans day_number/slot, rendu
    // dégradé en liste plate.
    // === Story B-Certificat (diplôme stylé) ===
    "{{code_certificat}}": data.certificateCode || "[Code certificat]",

    // === Story B-AIPR (ville de naissance apprenant) ===
    "{{ville_naissance_apprenant}}": (data.learner as unknown as { birth_city?: string | null })?.birth_city || "[Ville de naissance]",
    // Résultat examen AIPR : "a réussi" (défaut) ou "a échoué" si
    // aiprExamResult="echec" dans le contexte. La phrase finale du paragraphe
    // change selon le résultat (cf templates Loris success/echec).
    "{{resultat_examen_aipr}}": data.aiprExamResult === "echec"
      ? "a échoué cet examen."
      : "a réussi cet examen.",

    // === Story B-Réponses Satisfaction Apprenants (vue admin session) ===
    // Tableau satisfaction : 1 ligne par question des questionnaires satisfaction
    "{{tableau_reponses_satisfaction}}": (() => {
      const agg = data.sessionAggregates?.satisfaction;
      if (!agg || agg.length === 0) {
        return `<p style="color:#6b7280;font-style:italic;text-align:center;padding:14px;">Aucune réponse de satisfaction enregistrée.</p>`;
      }
      const rows = agg.map((q) => {
        const ratingCell = q.averageRating !== null
          ? `<strong>${q.averageRating.toFixed(2)} / 5</strong>`
          : "<em style='color:#9ca3af;'>—</em>";
        const distCell = q.distribution.length > 0
          ? q.distribution.map((d) => `${d.value} (${d.count})`).join(", ")
          : "<em style='color:#9ca3af;'>—</em>";
        return `<tr>
  <td style="border:1px solid #d1d5db;padding:8px 10px;">${q.questionText}</td>
  <td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;">${ratingCell}</td>
  <td style="border:1px solid #d1d5db;padding:8px 10px;">${distCell}</td>
  <td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;">${q.responseCount}</td>
</tr>`;
      }).join("");
      return `<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:9pt;">
  <thead>
    <tr style="background:#f3f4f6;">
      <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;">Question</th>
      <th style="border:1px solid #d1d5db;padding:8px 10px;">Note moy.</th>
      <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;">Distribution réponses</th>
      <th style="border:1px solid #d1d5db;padding:8px 10px;">N</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
    })(),

    // Tableau suivi qualité : KPIs Qualiopi
    "{{tableau_suivi_qualite}}": (() => {
      const q = data.sessionAggregates?.qualiopi;
      if (!q) return `<p style="color:#6b7280;font-style:italic;text-align:center;padding:14px;">Pas de données qualité disponibles.</p>`;
      const fmtPct = (n: number | null) => n !== null ? `${n.toFixed(1)} %` : "—";
      return `<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:9.5pt;">
  <thead>
    <tr style="background:#f3f4f6;">
      <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;">Indicateur Qualiopi</th>
      <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;">Valeur</th>
      <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;">Base</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="border:1px solid #d1d5db;padding:8px 10px;">Nombre d'apprenants inscrits</td><td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;font-weight:700;">${q.totalLearners}</td><td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;">—</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:8px 10px;">Taux de complétion (apprenants présents)</td><td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;font-weight:700;">${fmtPct(q.completionRate)}</td><td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;">${q.signedLearnersCount} / ${q.totalLearners}</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:8px 10px;">Taux de satisfaction global</td><td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;font-weight:700;color:${q.satisfactionRate !== null && q.satisfactionRate >= 80 ? "#15803d" : "#1f2937"};">${fmtPct(q.satisfactionRate)}</td><td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;">${q.satisfactionResponses} réponse(s)</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:8px 10px;">Taux d'acquisition (évaluations)</td><td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;font-weight:700;color:${q.acquisitionRate !== null && q.acquisitionRate >= 70 ? "#15803d" : "#1f2937"};">${fmtPct(q.acquisitionRate)}</td><td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;">${q.evaluationCount} éval(s)</td></tr>
  </tbody>
</table>`;
    })(),

    // Tableau réponses évaluations agrégé (1 ligne par évaluation)
    "{{tableau_reponses_evaluations}}": (() => {
      const evals = data.sessionAggregates?.evaluations;
      if (!evals || evals.length === 0) {
        return `<p style="color:#6b7280;font-style:italic;text-align:center;padding:14px;">Aucune évaluation enregistrée pour cette session.</p>`;
      }
      const fmtPct = (n: number | null) => n !== null ? `${n.toFixed(1)} %` : "—";
      const rows = evals.map((e) => `<tr>
  <td style="border:1px solid #d1d5db;padding:8px 10px;">${e.title}</td>
  <td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;">${e.responseCount} / ${e.totalEnrolled}</td>
  <td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;font-weight:600;">${fmtPct(e.averageScorePct)}</td>
  <td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;font-weight:700;color:${e.acquisRate !== null && e.acquisRate >= 70 ? "#15803d" : "#1f2937"};">${fmtPct(e.acquisRate)}</td>
</tr>`).join("");
      return `<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:9.5pt;">
  <thead>
    <tr style="background:#f3f4f6;">
      <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;">Évaluation</th>
      <th style="border:1px solid #d1d5db;padding:8px 10px;">Réponses</th>
      <th style="border:1px solid #d1d5db;padding:8px 10px;">Score moyen</th>
      <th style="border:1px solid #d1d5db;padding:8px 10px;">Taux ACQUIS</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
    })(),

    // === Story B-Autorisation Image (e-signature apprenant) ===
    // E-signature de l'apprenant : MVP = ligne vide pour signature manuelle.
    // Sera remplacé par image signée quand Lot C (Signatures unifiées) sera fait.
    "{{e_signature_apprenant}}": `<div style="border-bottom: 1px solid #9ca3af; min-height: 60px; margin-top: 8px;"></div>`,

    // === Story B-Attestation Compétences (signature intervenant) ===
    // Signature du premier formateur de la session (image si trainer.signature_url,
    // sinon zone vide pour signature manuelle).
    "{{signature_intervenant}}": (() => {
      const firstTrainer = (data.session?.formation_trainers ?? [])
        .find((ft) => ft.trainer)?.trainer as
        | { signature_url?: string | null }
        | undefined;
      if (firstTrainer?.signature_url) {
        return `<img src="${firstTrainer.signature_url}" alt="Signature intervenant" style="max-height:80px;max-width:220px;" />`;
      }
      // Zone vide pour signature manuelle
      return `<div style="border-bottom: 1px solid #9ca3af; min-height: 60px; margin-top: 8px;"></div>`;
    })(),

    // === Story B-Résultats Évaluations ===
    "{{tableau_resultats_evaluations}}": (() => {
      const results = data.evaluationResults;
      if (!results || results.length === 0) {
        return `<p style="color:#6b7280;font-style:italic;text-align:center;padding:14px;">Aucune évaluation complétée pour cette formation.</p>`;
      }
      const fmtDate = (iso: string | null) => (iso ? formatDate(iso) : "—");
      const statusLabel = (s: typeof results[number]["status"]) => {
        switch (s) {
          case "acquis": return `<span style="color:#15803d;font-weight:700;">ACQUIS</span>`;
          case "non_acquis": return `<span style="color:#b91c1c;font-weight:700;">NON ACQUIS</span>`;
          case "complete": return `<span style="color:#374151;">Complété</span>`;
          case "non_complete": return `<span style="color:#9ca3af;font-style:italic;">Non complété</span>`;
        }
      };
      const rows = results.map((r) => {
        const scoreCell = r.score !== null && r.maxScore !== null
          ? `${r.score} / ${r.maxScore}`
          : "—";
        const pctCell = r.percentage !== null
          ? `${r.percentage.toFixed(1)} %`
          : "—";
        return `<tr>
  <td style="border:1px solid #d1d5db;padding:8px 10px;">${r.title}</td>
  <td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;">${fmtDate(r.completedAt)}</td>
  <td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;font-weight:600;">${scoreCell}</td>
  <td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;font-weight:600;">${pctCell}</td>
  <td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;">${statusLabel(r.status)}</td>
</tr>`;
      }).join("");
      return `<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:9.5pt;">
  <thead>
    <tr style="background:#f3f4f6;">
      <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;">Évaluation</th>
      <th style="border:1px solid #d1d5db;padding:8px 10px;">Date</th>
      <th style="border:1px solid #d1d5db;padding:8px 10px;">Score</th>
      <th style="border:1px solid #d1d5db;padding:8px 10px;">%</th>
      <th style="border:1px solid #d1d5db;padding:8px 10px;">Résultat</th>
    </tr>
  </thead>
  <tbody>${rows}
  </tbody>
</table>`;
    })(),

    // === Story B-Émargement Individuel ===
    // Liste de cards par créneau pour 1 seul apprenant (data.learner).
    // Source = formation_time_slots (fallback : matin/aprem par jour).
    // Le formateur affiché : data.trainer ou formateursNoms (premier seulement
    // pour MVP, on liste TOUS séparément si plusieurs formateurs).
    //
    // Statut Présent/Absent par CRÉNEAU (h-14 fix, miroir de h-11) :
    //   - Lookup dans signaturesBySlotPerson("slotId|signerId|signerType")
    //   - Si une signature existe pour ce slot précis → "Présent" + image
    //   - Sinon → "Non signé" (date-aware via renderUnsignedP)
    //
    // AVANT le fix : learnerStatusHtml/formateurStatusHtml calculés UNE FOIS
    // hors boucle avec sigMap global (signaturesById = vue agrégée par
    // personne) → tous les créneaux affichaient la même signature dès qu'1
    // créneau était signé. Bug Qualiopi majeur (cf h-11 sur le collectif).
    //
    // Si formation_time_slots vide (cas legacy : session sans créneaux
    // détaillés) → fallback sur le comportement legacy avec sigMap global
    // (imprécis mais évite l'écran vide).
    "{{tableau_signature_individuel}}": (() => {
      const sess = data.session;
      if (!sess?.start_date || !sess?.end_date) return "[Tableau signature]";
      if (!data.learner) return "[Apprenant manquant]";

      const fmtDate = (iso: string) => formatDate(iso);
      const fmtTime = (iso: string) => {
        try {
          const d = new Date(iso);
          return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        } catch {
          return "--:--";
        }
      };

      const sigMap = data.signaturesById;
      const slotSigMap = data.signaturesBySlotPerson;
      const sessionEndDate = data.session?.end_date;
      const learnerName = `${data.learner.last_name?.toUpperCase() ?? ""} ${data.learner.first_name ?? ""}`.trim();
      const formateursLine = formateursNoms || "[Formateur]";
      const firstTrainerId = (data.session?.formation_trainers ?? [])
        .find((ft) => ft.trainer)?.trainer?.id;

      // Convertit le SVG brut en data URL pour l'inliner dans src=""
      // (cf h-1 : sans ça les " du SVG cassent l'attribut HTML et le tag
      // est rendu en texte brut au lieu de l'image signature).
      const renderSigImg = (sig: string) => {
        const dataUrl = sig.startsWith("data:")
          ? sig
          : `data:image/svg+xml;base64,${Buffer.from(sig).toString("base64")}`;
        return `<img src="${dataUrl}" alt="Signature" style="max-height:50px;max-width:160px;display:block;margin-top:4px;" />`;
      };

      // Note: renderUnsignedCell utilise <span>, mais ce template individuel utilise <p>
      // pour respecter sa mise en page. On reproduit donc la logique en local avec <p>.
      const renderUnsignedP = (): string => {
        if (!sessionEndDate) return "";
        const isPastSession = new Date(sessionEndDate) < new Date();
        if (isPastSession) {
          return `<p class="person-status status-unsigned">Non signé</p>`;
        }
        return "";
      };

      type RealSlot = { id: string; start_time: string; end_time: string; title?: string | null };
      const realSlots = (sess as unknown as { formation_time_slots?: RealSlot[] })?.formation_time_slots ?? [];

      // Mode slot-aware : statut calculé PAR créneau via signaturesBySlotPerson
      if (realSlots.length > 0) {
        const learnerStatusForSlot = (slotId: string): string => {
          const sig = slotSigMap?.get(`${slotId}|${data.learner!.id}|learner`);
          if (sig) return `<p class="person-status">Présent</p>${renderSigImg(sig)}`;
          return renderUnsignedP();
        };
        const trainerStatusForSlot = (slotId: string): string => {
          if (!firstTrainerId) return renderUnsignedP();
          const sig = slotSigMap?.get(`${slotId}|${firstTrainerId}|trainer`);
          if (sig) return `<p class="person-status">Présent</p>${renderSigImg(sig)}`;
          return renderUnsignedP();
        };

        const cards = realSlots.map((s) => {
          const h = new Date(s.start_time).getUTCHours();
          const label = s.title || (h < 13 ? "MATIN" : "APRES MIDI");
          return `
<div class="creneau-card">
  <p class="creneau-header">Créneau : De ${fmtDate(s.start_time)} - ${fmtTime(s.start_time)} À ${fmtDate(s.end_time)} - ${fmtTime(s.end_time)} (${label})</p>
  <p class="person-name">${formateursLine}${formateursNoms ? " (Formateur)" : ""}</p>
  ${trainerStatusForSlot(s.id)}
  <p class="person-name learner">${learnerName}</p>
  ${learnerStatusForSlot(s.id)}
</div>`;
        }).join("");
        return cards;
      }

      // Fallback legacy : pas de formation_time_slots → 2 créneaux simulés par
      // jour, statut basé sur sigMap global (imprécis : 1 sig dupliquée sur
      // tous les créneaux). Conservé pour ne pas casser les vieilles sessions
      // sans slots détaillés.
      type Creneau = { startIso: string; endIso: string; label: string };
      const creneaux: Creneau[] = [];
      const start = new Date(sess.start_date);
      const end = new Date(sess.end_date);
      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
      const endDay = new Date(end);
      endDay.setHours(0, 0, 0, 0);
      while (cursor.getTime() <= endDay.getTime()) {
        const dateStr = cursor.toISOString().slice(0, 10);
        creneaux.push({ startIso: `${dateStr}T09:00:00Z`, endIso: `${dateStr}T12:00:00Z`, label: "MATIN" });
        creneaux.push({ startIso: `${dateStr}T13:00:00Z`, endIso: `${dateStr}T17:00:00Z`, label: "APRES MIDI" });
        cursor.setDate(cursor.getDate() + 1);
      }

      const signed = data.signedLearnerIds;
      const learnerSig = sigMap?.get(data.learner.id);
      const learnerStatusHtml = learnerSig
        ? `<p class="person-status">Présent</p>${renderSigImg(learnerSig)}`
        : signed?.has(data.learner.id)
          ? `<p class="person-status">Signé</p>`
          : renderUnsignedP();
      const firstTrainerSig = firstTrainerId ? sigMap?.get(firstTrainerId) : undefined;
      const formateurStatusHtml = firstTrainerSig
        ? `<p class="person-status">Présent</p>${renderSigImg(firstTrainerSig)}`
        : renderUnsignedP();

      const cards = creneaux.map((c) => `
<div class="creneau-card">
  <p class="creneau-header">Créneau : De ${fmtDate(c.startIso)} - ${fmtTime(c.startIso)} À ${fmtDate(c.endIso)} - ${fmtTime(c.endIso)} (${c.label})</p>
  <p class="person-name">${formateursLine}${formateursNoms ? " (Formateur)" : ""}</p>
  ${formateurStatusHtml}
  <p class="person-name learner">${learnerName}</p>
  ${learnerStatusHtml}
</div>`).join("");

      return cards;
    })(),

    // === Story B-Attestation Assiduité ===
    // Heures effectivement réalisées par l'apprenant courant.
    // MVP : si data.signedLearnerIds inclut data.learner.id → planned_hours.
    //       Sinon → 0.
    // À affiner ultérieurement avec signatures par créneau (formation_time_slots).
    "{{heures_realisees_apprenant}}": (() => {
      const planned = data.session?.planned_hours;
      if (!planned || !data.learner) return "0.00";
      const signed = data.signedLearnerIds;
      // Si signedLearnerIds non fourni (mock ou résolution sans check signatures)
      // → assume présent (cas par défaut le plus courant).
      if (!signed) return planned.toFixed(2);
      return signed.has(data.learner.id) ? planned.toFixed(2) : "0.00";
    })(),
    "{{taux_realisation}}": (() => {
      const planned = data.session?.planned_hours;
      if (!planned || !data.learner) return "0.00";
      const signed = data.signedLearnerIds;
      if (!signed) return "100.00";
      return signed.has(data.learner.id) ? "100.00" : "0.00";
    })(),

    // === Story B-Certificat Réalisation ===
    // URL absolue vers /ministere-du-travail.png (asset public/) — Puppeteer
    // (Railway sidecar) doit pouvoir le fetcher depuis Internet, donc on
    // utilise NEXT_PUBLIC_APP_URL.
    "{{url_logo_ministere_travail}}": (() => {
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app").replace(/\/+$/, "");
      return `${baseUrl}/ministere-du-travail.png`;
    })(),

    // === Story B-Convocation Apprenant ===
    // Liste détaillée des créneaux (matin/aprem) : "• De DD/MM/YYYY - HH:MM
    // À DD/MM/YYYY - HH:MM" par créneau. Source = formation_time_slots.
    // Fallback (pas de slots) : 1 créneau par jour entre start et end,
    // utilisant les VRAIES heures de start_date et end_date au lieu de
    // l'ancien hardcode 09:00-12:00 / 13:00-17:00 qui ne correspondait
    // jamais au planning réel (cf retour Loris "les heures ne correspondent
    // pas au planning"). Pour un découpage matin/après-midi précis, l'admin
    // doit configurer `formation_time_slots` au niveau de la session.
    //
    // ⚠ TZ : on force le rendu en Europe/Paris via formatTimeParis
    // (Intl.DateTimeFormat avec timeZone explicite) plutôt que getHours()
    // qui suit le TZ runtime. En prod Netlify (UTC), un créneau saisi
    // 09:00 Paris (= 07:00Z l'été) sortait "07:00" dans la convocation
    // alors que le planning admin l'affiche correctement à "09:00".
    "{{dates_detail}}": (() => {
      const fmtDate = (iso: string) => formatDate(iso);
      const fmtTime = (iso: string) => formatTimeParis(iso);
      const slots = (data.session as unknown as { formation_time_slots?: { start_time: string; end_time: string }[] })?.formation_time_slots;
      if (slots && slots.length > 0) {
        // Dédup par (start_time, end_time) pour éviter les créneaux dupliqués
        // observés en prod (cf retour Loris : convocation listait 2× les mêmes
        // dates). Cause racine probable : doublons en BDD côté formation_time_slots.
        const seenKeys = new Set<string>();
        const uniqueSlots = slots.filter((s) => {
          const key = `${s.start_time}|${s.end_time}`;
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });
        // Tri par date de début croissante pour ordre cohérent
        uniqueSlots.sort((a, b) => a.start_time.localeCompare(b.start_time));
        const items = uniqueSlots
          .map((s) => `<li>De ${fmtDate(s.start_time)} - ${fmtTime(s.start_time)} À ${fmtDate(s.end_time)} - ${fmtTime(s.end_time)}</li>`)
          .join("");
        return `<ul class="dates-list">${items}</ul>`;
      }
      // Fallback : 1 créneau par jour entre start et end avec les heures réelles
      if (!data.session?.start_date || !data.session?.end_date) {
        return `<p style="color:#9ca3af;font-style:italic;">À renseigner dans : section « Planning » de la session.</p>`;
      }
      const start = new Date(data.session.start_date);
      const end = new Date(data.session.end_date);
      const startTime = fmtTime(data.session.start_date);
      const endTime = fmtTime(data.session.end_date);
      const items: string[] = [];
      // Itération par jour LOCAL (cohérent avec le getHours local du fmtTime
      // pour éviter de créer un jour fantôme si end_date est juste après minuit UTC).
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cursor.getTime() <= endDay.getTime()) {
        const dateStr = formatDate(cursor.toISOString());
        items.push(`<li>De ${dateStr} - ${startTime} À ${dateStr} - ${endTime}</li>`);
        cursor.setDate(cursor.getDate() + 1);
      }
      return `<ul class="dates-list">${items.join("")}</ul>`;
    })(),
    // URL de connexion à l'espace apprenant — utilisée dans la convocation
    // (remplace l'ancien QR code magic link, cf spec convocation-credentials)
    // Pattern de fallback aligné sur le reste de la codebase : si la variable
    // d'env est absente (oubli en local), on utilise l'URL de prod plutôt qu'un
    // placeholder littéral qui se retrouverait dans le PDF envoyé à l'apprenant.
    "{{url_connexion}}": `${(process.env.NEXT_PUBLIC_APP_URL || process.env.URL || "https://mrformationcrm.netlify.app").replace(/\/+$/, "")}/login`,

    // Mot de passe temporaire de l'apprenant — injecté par /api/documents/
    // generate-from-template via ensureLearnerAccount pour doc_type=convocation
    "{{mot_de_passe_apprenant}}": data.learnerCredentials?.tempPassword || "[Mot de passe apprenant]",

    // Lot H : QR code (data URL) pointant vers la page de connexion.
    // Pré-calculé côté API via qrcode.toDataURL et injecté dans le ctx.
    // Si absent → vide (le label "Scannez..." disparaît avec le QR pour
    // éviter un texte orphelin sans image, cf audit BMAD #2).
    "{{qr_code_connexion}}": data.loginQrCodeDataUrl
      ? `<img src="${data.loginQrCodeDataUrl}" alt="QR code connexion" style="width:80px;height:80px;display:block;" /><p style="font-size:7pt;color:#6b7280;text-align:center;margin:2px 0 0;line-height:1.2;">Scannez<br>pour vous connecter</p>`
      : "",

    // === Story B-Convention Intervention (contrat sous-traitance formateur) ===
    "{{nom_formateur_complet}}": (() => {
      const t = data.trainer;
      if (!t) return "[Nom formateur]";
      return `${t.first_name} ${t.last_name}`.trim();
    })(),
    "{{adresse_formateur}}": (() => {
      const t = data.trainer as unknown as {
        address?: string | null;
        postal_code?: string | null;
        city?: string | null;
      } | null;
      if (!t) return "[Adresse formateur]";
      const parts = [t.address, t.postal_code, t.city].filter(Boolean);
      return parts.length > 0 ? parts.join(" ") : "[Adresse formateur]";
    })(),
    "{{siret_formateur}}": (() => {
      const t = data.trainer as unknown as { siret?: string | null } | null;
      return t?.siret || "[SIRET formateur]";
    })(),
    "{{nda_formateur}}": (() => {
      const t = data.trainer as unknown as { nda?: string | null } | null;
      return t?.nda || "[NDA formateur]";
    })(),
    "{{lien_extranet_formateur}}": (() => {
      const t = data.trainer as unknown as { extranet_link?: string | null } | null;
      return t?.extranet_link || "[Lien extranet]";
    })(),
    // h-16 : aligné sur {{e_signature_client}}. Priorité à documentSignature
    // (signature obtenue via /sign/<token> pour convention_intervention),
    // fallback sur signature_url (image pré-uploadée sur le profil trainer,
    // legacy), fallback final = "" (pas de placeholder texte, pour ne pas
    // bloquer la validation Qualiopi quand le doc est en attente de signature
    // trainer via le lien).
    "{{e_signature_formateur}}": (() => {
      const sig = data.documentSignature;
      if (sig) {
        const dataUrl = sig.startsWith("data:")
          ? sig
          : `data:image/svg+xml;base64,${Buffer.from(sig).toString("base64")}`;
        return `<img src="${dataUrl}" alt="Signature formateur" style="max-height:100px;max-width:240px;display:block;margin-top:6px;" />`;
      }
      const t = data.trainer as unknown as { signature_url?: string | null } | null;
      if (t?.signature_url) {
        return `<img src="${t.signature_url}" alt="Signature formateur" style="max-height:100px;" />`;
      }
      return "";
    })(),
    // Adresse de la formation : alias direct de session.location (Loris la
    // colle après [%Lieu de la formation%] pour un affichage compact).
    "{{adresse_formation}}": data.session?.location || "[Adresse formation]",
    // Coût HT formateur : agreed_cost_ht (depuis formation_trainers du trainer
    // courant) > fallback calcul hourly_rate × hours_done. La résolution exacte
    // est faite côté API (avant d'appeler le resolver) en plaçant la valeur
    // dans data.trainer comme champ ad-hoc `_agreed_cost_ht`.
    "{{cout_formateur_ht}}": (() => {
      const t = data.trainer as unknown as { _agreed_cost_ht?: number | null } | null;
      const cost = t?._agreed_cost_ht;
      return typeof cost === "number" && cost > 0 ? cost.toFixed(2) : "[Coût formateur]";
    })(),

    "{{contenu_pedagogique}}": (() => {
      // h-8 : fallback prioritaire sur session.pedagogical_content (TEXT libre)
      // si l'admin a saisi le contenu directement sur la session.
      if (data.session?.pedagogical_content) {
        return `<p>${data.session.pedagogical_content.replace(/\n/g, "<br>")}</p>`;
      }
      type Module = {
        id?: number;
        title?: string;
        day_number?: number;
        slot?: "matin" | "aprem" | string;
        duration_hours?: number;
        objectives?: string[];
        topics?: string[];
        animation_items?: string[];
      };
      const c = (data.session?.program?.content || {}) as Record<string, unknown>;
      const modules = Array.isArray(c.modules) ? (c.modules as Module[]) : [];
      if (modules.length === 0) {
        return `<p style="color:#9ca3af;font-style:italic;">À renseigner dans : fiche Programme → section « Contenu de la formation (Modules) », ou champ libre « Contenu pédagogique » au niveau de la session.</p>`;
      }

      const renderModuleContent = (m: Module): string => {
        const title = m.title ? `<p class="module-title">${m.title}</p>` : "";
        const topics = Array.isArray(m.topics) && m.topics.length > 0
          ? `<ul>${m.topics.map((t) => `<li>${t}</li>`).join("")}</ul>`
          : "";
        return title + topics;
      };
      const renderModuleAnimation = (m: Module): string => {
        const items = Array.isArray(m.animation_items) ? m.animation_items : [];
        if (items.length === 0) return "";
        return `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
      };

      // Mode dégradé : aucun module n'a day_number ni slot → liste plate
      const hasStructure = modules.some((m) => m.day_number !== undefined || m.slot !== undefined);
      if (!hasStructure) {
        return `<table class="progression">
  <thead>
    <tr><th>Contenu</th><th>Animation</th></tr>
  </thead>
  <tbody>
    ${modules.map((m) => `<tr><td>${renderModuleContent(m)}</td><td>${renderModuleAnimation(m)}</td></tr>`).join("")}
  </tbody>
</table>`;
      }

      // Mode structuré : group by day, then slot
      const byDay = new Map<number, Map<string, Module[]>>();
      for (const m of modules) {
        const day = m.day_number ?? 1;
        const slot = m.slot ?? "matin";
        if (!byDay.has(day)) byDay.set(day, new Map());
        const dayMap = byDay.get(day)!;
        if (!dayMap.has(slot)) dayMap.set(slot, []);
        dayMap.get(slot)!.push(m);
      }

      const slotLabel = (s: string): string =>
        s === "matin" ? "Matin" : s === "aprem" ? "Après-midi" : s;

      const sections: string[] = [];
      const sortedDays = [...byDay.keys()].sort((a, b) => a - b);
      for (const day of sortedDays) {
        sections.push(`<div class="day-header">Jour ${day}</div>`);
        const dayMap = byDay.get(day)!;
        const sortedSlots = [...dayMap.keys()].sort((a, b) =>
          a === "matin" ? -1 : b === "matin" ? 1 : a.localeCompare(b),
        );
        for (const slot of sortedSlots) {
          const slotModules = dayMap.get(slot)!;
          const contenuCell = slotModules.map(renderModuleContent).join("");
          const animationCell = slotModules.map(renderModuleAnimation).join("");
          sections.push(`<div class="slot-label">${slotLabel(slot)}</div>
<table class="progression">
  <thead>
    <tr><th>Contenu</th><th>Animation</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>${contenuCell || "<em>—</em>"}</td>
      <td>${animationCell || "<em>—</em>"}</td>
    </tr>
  </tbody>
</table>`);
        }
      }

      return sections.join("\n");
    })(),

    // Organisme (depuis entity settings ou fallback hardcodé)
    "{{siret_organisme}}": data.entity?.siret || "[SIRET organisme]",
    "{{nda_organisme}}": data.entity?.nda || "[NDA]",
    "{{adresse_organisme}}": (() => {
      const e = data.entity;
      if (!e?.address) return "[Adresse organisme]";
      return [e.address, e.postal_code, e.city].filter(Boolean).join(" ");
    })(),
    "{{email_organisme}}": data.entity?.email || "[Email organisme]",
    "{{telephone_organisme}}": data.entity?.phone || "[Tél organisme]",
    "{{site_organisme}}": data.entity?.website || "[Site organisme]",
    "{{signature_organisme}}": data.entity?.signature_url
      ? `<img src="${data.entity.signature_url}" alt="Signature" style="max-height:80px;" />`
      : data.entity?.signature_text || "[Signature organisme]",
    "{{tampon_organisme}}": data.entity?.stamp_url
      ? `<img src="${data.entity.stamp_url}" alt="Tampon" style="max-height:120px;" />`
      : "",
    "{{logo_organisme}}": data.entity?.logo_url
      ? `<img src="${data.entity.logo_url}" alt="Logo" style="max-height:60px;" />`
      : "",

    // === Variables Story B-Convention (ajoutées pour le template Loris) ===
    "{{nom_organisme}}": data.entity?.name || "[Nom organisme]",
    "{{ville_organisme}}": data.entity?.city || "[Ville organisme]",
    "{{representant_organisme}}": data.entity?.president_name || "[Représentant organisme]",
    "{{titre_representant_organisme}}": data.entity?.president_title || "Président",
    // E-signature client : rend la signature SVG du document signé
    // (table documents.signature_data) en tant qu'image inline. Si pas
    // de signature (doc non signé), retourne chaîne vide.
    "{{e_signature_client}}": (() => {
      const sig = data.documentSignature;
      if (!sig) return "";
      const dataUrl = sig.startsWith("data:")
        ? sig
        : `data:image/svg+xml;base64,${Buffer.from(sig).toString("base64")}`;
      return `<img src="${dataUrl}" alt="Signature client" style="max-height:80px;max-width:240px;display:block;margin-top:6px;" />`;
    })(),
    // Type d'action de formation (Art. L6313-1) : déduit de training.classification.
    "{{type_action_formation}}": (() => {
      const c = data.session?.training?.classification;
      if (c === "reglementaire") return "Action de formation réglementaire";
      if (c === "certifiant") return "Action de formation certifiante";
      if (c === "qualifiant") return "Action de formation qualifiante";
      return "Action de formation";
    })(),
    // Type de diplôme : depuis training.certification (TEXT libre).
    "{{type_diplome}}": data.session?.training?.certification || "Aucun diplôme délivré",
    // Combo dates : "Du 15 mai 2026 au 16 mai 2026"
    "{{dates_formation}}": (() => {
      if (!data.session?.start_date || !data.session?.end_date) return "[Dates formation]";
      const debut = formatDate(data.session.start_date);
      const fin = formatDate(data.session.end_date);
      return debut === fin ? `Le ${debut}` : `Du ${debut} au ${fin}`;
    })(),
    // Tableau HTML des coûts pour le client courant (cf §4 de la convention).
    // Story B-Convention : sortie minimaliste = 1 ligne avec montant HT/TVA/TTC.
    // Affiner ensuite si Loris veut un détail par apprenant.
    // Tableau de signature compact (feuille d'émargement collectif par
    // entreprise). Génère 1 ligne par créneau réel (formation_time_slots)
    // pour chaque jour de la session, groupé par semaine ISO. Filtre les
    // apprenants par companyId via les enrollments déjà filtrés ci-dessus.
    //
    // Statut Présent/Absent par CRÉNEAU (h-11 fix) :
    //   - Lookup dans signaturesBySlotPerson("slotId|signerId|signerType")
    //   - Si une signature existe pour ce slot précis → "Présent" + image
    //   - Sinon → "Non signé" (cellule date-aware via renderUnsignedCell)
    //
    // AVANT le fix : on construisait apprenantsCellHtml UNE FOIS hors boucle
    // avec sigMap global (signaturesById = vue agrégée par personne) →
    // tous les créneaux affichaient la même signature dès qu'1 créneau était
    // signé. Bug Qualiopi majeur.
    //
    // Si formation_time_slots vide (cas legacy : session sans créneaux
    // détaillés) → fallback sur MATIN/APRES MIDI simulés avec sigMap global
    // (comportement legacy conservé, peut-être imprécis mais évite l'écran vide).
    "{{tableau_signature_compact}}": (() => {
      const sess = data.session;
      if (!sess?.start_date || !sess?.end_date) return "[Tableau signature]";

      const start = new Date(sess.start_date);
      const end = new Date(sess.end_date);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return "[Tableau signature]";
      }

      const learnersForTable = enrollments.filter((e) => e.learner);
      if (learnersForTable.length === 0) return "[Aucun apprenant]";

      const sigMap = data.signaturesById;
      const slotSigMap = data.signaturesBySlotPerson;
      // Convertit le SVG brut en data URL pour l'inliner dans src=""
      // (cf h-1 : sans ça les " du SVG cassent l'attribut HTML).
      const renderSignature = (sigData: string): string => {
        const dataUrl = sigData.startsWith("data:")
          ? sigData
          : `data:image/svg+xml;base64,${Buffer.from(sigData).toString("base64")}`;
        return `<img src="${dataUrl}" alt="Signature" style="max-height:42px;max-width:120px;display:block;margin-top:2px;" />`;
      };
      const sessionEndDate = data.session?.end_date;
      const formateursLine = formateursNoms;
      const firstTrainerId = (data.session?.formation_trainers ?? [])
        .find((ft) => ft.trainer)?.trainer?.id;

      // Mode slot-aware : utilise les vrais formation_time_slots
      type RealSlot = { id: string; start_time: string; end_time: string; title?: string | null };
      const realSlots = (sess.formation_time_slots as RealSlot[] | undefined) ?? [];

      if (realSlots.length > 0) {
        const sortedSlots = [...realSlots].sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );

        // Lookup par (slotId, learnerId, "learner")
        const learnerStatusForSlot = (slotId: string, learnerId: string): string => {
          const sig = slotSigMap?.get(`${slotId}|${learnerId}|learner`);
          if (sig) {
            return `<span class="person-status">Présent</span>${renderSignature(sig)}`;
          }
          return renderUnsignedCell(sessionEndDate);
        };
        const trainerStatusForSlot = (slotId: string): string => {
          if (!firstTrainerId) return renderUnsignedCell(sessionEndDate);
          const sig = slotSigMap?.get(`${slotId}|${firstTrainerId}|trainer`);
          if (sig) {
            return `<span class="person-status">Présent</span>${renderSignature(sig)}`;
          }
          return renderUnsignedCell(sessionEndDate);
        };

        // Groupe par semaine ISO
        const byWeek = new Map<number, RealSlot[]>();
        for (const s of sortedSlots) {
          const wk = getISOWeek(new Date(s.start_time));
          if (!byWeek.has(wk)) byWeek.set(wk, []);
          byWeek.get(wk)!.push(s);
        }

        const sections: string[] = [];
        for (const [weekNum, weekSlots] of byWeek) {
          const monday = startOfISOWeek(new Date(weekSlots[0].start_time));
          const sunday = endOfISOWeek(new Date(weekSlots[0].start_time));
          const weekLabel = `Semaine ${String(weekNum).padStart(2, "0")} (${format(monday, "dd/MM/yyyy")} au ${format(sunday, "dd/MM/yyyy")})`;

          const rows = weekSlots
            .map((slot) => {
              const slotStart = new Date(slot.start_time);
              // ⚠ TZ : utilise formatTimeParis pour rendre en Europe/Paris
              // indépendamment du TZ runtime (cf bug heures convocation).
              const horaire = `${formatTimeParis(slot.start_time)} - ${formatTimeParis(slot.end_time)}`;
              // Label MATIN/APRES MIDI déduit de l'heure de début Paris.
              const label = getHourParis(slot.start_time) < 13 ? "MATIN" : "APRES MIDI";
              const apprenantsCell = learnersForTable
                .map((e) => {
                  const l = e.learner!;
                  const name = `${l.last_name?.toUpperCase() ?? ""} ${l.first_name ?? ""}`.trim();
                  return `<span class="person-name">${name}</span>${learnerStatusForSlot(slot.id, l.id)}`;
                })
                .join("");
              return `
            <tr>
              <td class="col-date">${format(slotStart, "dd/MM/yyyy")}<br>${horaire}</td>
              <td class="col-creneau">${slot.title || label}</td>
              <td class="col-formateur"><span class="person-name">${formateursLine}</span>${trainerStatusForSlot(slot.id)}</td>
              <td class="col-apprenants">${apprenantsCell}</td>
            </tr>`;
            })
            .join("");

          sections.push(`<div class="week-header">${weekLabel}</div>
<table class="signature-table">
  <thead>
    <tr>
      <th class="col-date">Date / Horaire</th>
      <th class="col-creneau">Créneau</th>
      <th class="col-formateur">Formateur(s)</th>
      <th class="col-apprenants">Apprenant(s)</th>
    </tr>
  </thead>
  <tbody>${rows}
  </tbody>
</table>`);
        }
        return sections.join("\n");
      }

      // Fallback legacy : si pas de formation_time_slots, on simule MATIN/APRES MIDI
      // par jour avec lookup global sigMap (peut afficher "Présent" sur tous les
      // créneaux dès qu'1 signature existe — imprécis mais évite écran vide).
      const signed = data.signedLearnerIds;
      const learnerStatus = (learnerId: string): string => {
        const sig = sigMap?.get(learnerId);
        if (sig) {
          return `<span class="person-status">Présent</span>${renderSignature(sig)}`;
        }
        if (signed?.has(learnerId)) {
          return `<span class="person-status">Signé</span>`;
        }
        return renderUnsignedCell(sessionEndDate);
      };

      type Creneau = { date: Date; label: string; horaire: string };
      const creneaux: Creneau[] = [];
      let cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
      const endDay = new Date(end);
      endDay.setHours(0, 0, 0, 0);
      while (cursor.getTime() <= endDay.getTime()) {
        creneaux.push({ date: new Date(cursor), label: "MATIN", horaire: "09:00 - 12:00" });
        creneaux.push({ date: new Date(cursor), label: "APRES MIDI", horaire: "13:00 - 17:00" });
        cursor = addDays(cursor, 1);
      }

      const byWeek = new Map<number, Creneau[]>();
      for (const c of creneaux) {
        const wk = getISOWeek(c.date);
        if (!byWeek.has(wk)) byWeek.set(wk, []);
        byWeek.get(wk)!.push(c);
      }

      const firstTrainerSig = firstTrainerId ? sigMap?.get(firstTrainerId) : undefined;
      const formateurStatus = firstTrainerSig
        ? `<span class="person-status">Présent</span>${renderSignature(firstTrainerSig)}`
        : renderUnsignedCell(sessionEndDate);

      const apprenantsCellHtml = learnersForTable
        .map((e) => {
          const l = e.learner!;
          const name = `${l.last_name?.toUpperCase() ?? ""} ${l.first_name ?? ""}`.trim();
          return `<span class="person-name">${name}</span>${learnerStatus(l.id)}`;
        })
        .join("");

      const sections: string[] = [];
      for (const [weekNum, weekCreneaux] of byWeek) {
        const monday = startOfISOWeek(weekCreneaux[0].date);
        const sunday = endOfISOWeek(weekCreneaux[0].date);
        const weekLabel = `Semaine ${String(weekNum).padStart(2, "0")} (${format(monday, "dd/MM/yyyy")} au ${format(sunday, "dd/MM/yyyy")})`;

        const rows = weekCreneaux
          .map((c) => `
            <tr>
              <td class="col-date">${format(c.date, "dd/MM/yyyy")}<br>${c.horaire}</td>
              <td class="col-creneau">${c.label}</td>
              <td class="col-formateur"><span class="person-name">${formateursLine}</span>${formateurStatus}</td>
              <td class="col-apprenants">${apprenantsCellHtml}</td>
            </tr>`)
          .join("");

        sections.push(`<div class="week-header">${weekLabel}</div>
<table class="signature-table">
  <thead>
    <tr>
      <th class="col-date">Date / Horaire</th>
      <th class="col-creneau">Créneau</th>
      <th class="col-formateur">Formateur(s)</th>
      <th class="col-apprenants">Apprenant(s)</th>
    </tr>
  </thead>
  <tbody>${rows}
  </tbody>
</table>`);
      }

      return sections.join("\n");
    })(),
    // Tableau planning hebdomadaire signé (Action 3 de TabEmargements).
    // Layout : N+1 colonnes (Nom + jours×moments M/AM) par semaine ISO
    // (lundi → dimanche). Si la formation dure plusieurs semaines, rend
    // 1 sous-tableau par semaine avec titre "Semaine du X au Y", chaque
    // bloc en page-break-inside:avoid pour rester groupé visuellement.
    // (Lot E — retour Loris : "lorsque les formations durent plusieurs mois
    // il faudrait que les semaines s'enchainent" — avant : .slice(0,10)
    // coupait à 1 semaine max.)
    "{{tableau_planning_hebdo}}": (() => {
      const sess = data.session;
      const slots = (sess as unknown as { formation_time_slots?: Array<{ id: string; start_time: string; end_time: string }> })?.formation_time_slots ?? [];
      if (slots.length === 0) return "[Aucun créneau]";

      // Group by (date, moment=M|AM)
      // ⚠ TZ : dateKey, hour et label DOIVENT tous être calculés sur la même
      // timezone Paris pour éviter qu'un slot en bordure de journée (ex 22:30Z =
      // 00:30 Paris) ne se retrouve dans une dateKey UTC qui ne correspond pas
      // au jour Paris affiché (et donc dans la mauvaise semaine après group).
      type Column = { key: string; date: string; moment: "M" | "AM"; label: string; slotIds: string[] };
      const columnsMap = new Map<string, Column>();
      for (const slot of slots) {
        const d = new Date(slot.start_time);
        // fr-CA produit yyyy-mm-dd, parfait pour clé ISO + alignement Paris
        const dateKey = d.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
        const hour = parseInt(d.toLocaleTimeString("fr-FR", { hour: "2-digit", hour12: false, timeZone: "Europe/Paris" }), 10);
        const moment: "M" | "AM" = hour < 13 ? "M" : "AM";
        const key = `${dateKey}|${moment}`;
        const dShort = d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });
        const label = `${dShort}<br>${moment === "M" ? "Matin" : "Après-midi"}`;
        if (!columnsMap.has(key)) columnsMap.set(key, { key, date: dateKey, moment, label, slotIds: [] });
        columnsMap.get(key)!.slotIds.push(slot.id);
      }
      // Sort : par date croissante, puis Matin (M) AVANT Après-midi (AM).
      // Sans cette priorité, le localeCompare placerait "AM" avant "M"
      // alphabétiquement, inversant l'ordre attendu.
      const allColumns = Array.from(columnsMap.values())
        .sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          if (a.moment === b.moment) return 0;
          return a.moment === "M" ? -1 : 1;
        });

      // Group columns by ISO week (Monday-Sunday). Calcul du lundi de la
      // semaine contenant `dateStr` (en local Paris pour éviter décalage UTC).
      const getWeekStart = (dateStr: string): string => {
        const [y, m, dd] = dateStr.split("-").map(Number);
        const d = new Date(y, m - 1, dd);
        const day = d.getDay(); // 0=dim, 1=lun, ..., 6=sam
        const diffToMonday = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diffToMonday);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const ddd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${ddd}`;
      };
      const formatDateFr = (dateStr: string): string => {
        const [y, m, dd] = dateStr.split("-").map(Number);
        return new Date(y, m - 1, dd).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
      };
      const addDays = (dateStr: string, n: number): string => {
        const [y, m, dd] = dateStr.split("-").map(Number);
        const d = new Date(y, m - 1, dd);
        d.setDate(d.getDate() + n);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };

      const weekGroupsMap = new Map<string, Column[]>();
      for (const col of allColumns) {
        const weekKey = getWeekStart(col.date);
        if (!weekGroupsMap.has(weekKey)) weekGroupsMap.set(weekKey, []);
        weekGroupsMap.get(weekKey)!.push(col);
      }
      const weekGroups = Array.from(weekGroupsMap.entries()).sort(([a], [b]) => a.localeCompare(b));

      // Collect persons : trainers from formation_trainers + learners from enrollments
      const trainers = ((sess as { formation_trainers?: Array<{ trainer: { id: string; first_name: string; last_name: string } | { id: string; first_name: string; last_name: string }[] }> })?.formation_trainers ?? [])
        .map((ft) => Array.isArray(ft.trainer) ? ft.trainer[0] : ft.trainer)
        .filter((t): t is { id: string; first_name: string; last_name: string } => Boolean(t));
      const learners = enrollments
        .map((e) => e.learner)
        .filter((l): l is NonNullable<typeof l> => Boolean(l));

      // Find signature for (slot, person, type)
      const sigMap = data.signaturesBySlotPerson;
      const findSig = (column: Column, personId: string, personType: "learner" | "trainer"): string | null => {
        if (!sigMap) return null;
        for (const slotId of column.slotIds) {
          const sig = sigMap.get(`${slotId}|${personId}|${personType}`);
          if (sig) return sig;
        }
        return null;
      };

      const renderSigCell = (column: Column, personId: string, personType: "learner" | "trainer"): string => {
        const sig = findSig(column, personId, personType);
        if (!sig) return "";
        // Signature SVG → embed direct comme data URL (cohérent avec emargement-collectif)
        const dataUrl = sig.startsWith("data:") ? sig : `data:image/svg+xml;base64,${Buffer.from(sig).toString("base64")}`;
        return `<img src="${dataUrl}" alt="Signature" style="max-width:60px;max-height:24px;display:block;margin:auto;" />`;
      };

      const renderWeekTable = (weekColumns: Column[]): string => {
        const headHtml = `<tr><th class="col-name">Nom</th>${weekColumns.map((c) => `<th>${c.label}</th>`).join("")}</tr>`;
        const trainerRowsHtml = trainers.map((t) => {
          const label = `${(t.last_name ?? "").toUpperCase()} ${t.first_name ?? ""} <span class="role">(F)</span>`;
          const cells = weekColumns.map((c) => `<td>${renderSigCell(c, t.id, "trainer")}</td>`).join("");
          return `<tr class="trainer-row"><td class="col-name">${label}</td>${cells}</tr>`;
        }).join("");
        const learnerRowsHtml = learners.map((l) => {
          const label = `${(l.last_name ?? "").toUpperCase()} ${l.first_name ?? ""}`;
          const cells = weekColumns.map((c) => `<td>${renderSigCell(c, l.id, "learner")}</td>`).join("");
          return `<tr><td class="col-name">${label}</td>${cells}</tr>`;
        }).join("");
        return `<table class="planning-table"><thead>${headHtml}</thead><tbody>${trainerRowsHtml}${learnerRowsHtml}</tbody></table>`;
      };

      // 1 seul tableau si toutes les colonnes tiennent dans une semaine
      // (rétrocompat : pas de titre "Semaine du X au Y" inutile).
      if (weekGroups.length <= 1) {
        return renderWeekTable(weekGroups[0]?.[1] ?? []);
      }

      // Multi-semaines : 1 sous-bloc par semaine avec titre + page-break-inside:avoid.
      return weekGroups
        .map(([weekStart, weekColumns]) => {
          const weekEnd = addDays(weekStart, 6);
          return `<div class="week-block">
  <h2 class="week-title">Semaine du ${formatDateFr(weekStart)} au ${formatDateFr(weekEnd)}</h2>
  ${renderWeekTable(weekColumns)}
</div>`;
        })
        .join("\n");
    })(),
    "{{tableau_couts_client}}": (() => {
      if (montantHt <= 0) return "[Tableau coûts]";
      const titre = data.session?.title ?? "Formation";
      const fmt = (n: number) => `${n.toFixed(2)} €`;
      return `<table style="width:100%;border-collapse:collapse;margin:8px 0;">
  <thead>
    <tr style="background:#f1f5f9;">
      <th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:left;">Désignation</th>
      <th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:right;">Montant HT</th>
      <th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:right;">TVA 20%</th>
      <th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:right;">Montant TTC</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;">${titre}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;text-align:right;">${fmt(montantHt)}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;text-align:right;">${fmt(montantTva)}</td>
      <td style="border:1px solid #cbd5e1;padding:6px 10px;text-align:right;font-weight:600;">${fmt(montantTtc)}</td>
    </tr>
  </tbody>
</table>`;
    })(),
  };

  let result = content;
  Object.entries(replacements).forEach(([key, val]) => {
    result = result.replaceAll(key, val);
  });

  // Support format Sellsy `[%Libellé en français%]` en plus de `{{nom_technique}}`.
  // C'est la convention que Loris utilise dans ses templates (cf Story B-Convention).
  // Le map ALIAS_TO_VARIABLE_KEY (ci-dessous) convertit chaque libellé Sellsy
  // vers la clé technique correspondante du replacements (déjà résolue).
  result = result.replace(/\[%([^%\]]+)%\]/g, (_, label) => {
    const trimmed = String(label).trim();
    const techKey = ALIAS_TO_VARIABLE_KEY[trimmed];
    if (techKey) {
      // techKey = "{{nom_client}}". Comme on l'a déjà résolu ci-dessus, on
      // récupère sa valeur depuis le map `replacements`.
      const val = replacements[techKey];
      if (val !== undefined) return val;
    }
    // Inconnu → on garde le placeholder visible pour audit (cf findUnresolvedVariables).
    return `[%${trimmed}%]`;
  });
  return result;
}

/**
 * Mapping libellés Loris/Sellsy (`[%Nom de l'organisme%]`) → clés techniques
 * du resolver (`{{nom_organisme}}`).
 *
 * Permet à Loris d'utiliser ses anciens templates Sellsy sans avoir à apprendre
 * une nouvelle nomenclature. Tout `[%libellé%]` non listé ici reste affiché
 * en clair (visible pour audit + diagnostic dans findUnresolvedVariables).
 *
 * Story B-Convention : 21 alias validés depuis le modèle convention Loris.
 */
export const ALIAS_TO_VARIABLE_KEY: Record<string, string> = {
  // Organisme
  "Nom de l'organisme": "{{nom_organisme}}",
  "Adresse de l'organisme": "{{adresse_organisme}}",
  "Ville de l'organisme": "{{ville_organisme}}",
  "NDA de l'organisme": "{{nda_organisme}}",
  "SIRET de l'organisme": "{{siret_organisme}}",
  "Email de l'organisme": "{{email_organisme}}",
  "Téléphone de l'organisme": "{{telephone_organisme}}",
  "Site web de l'organisme": "{{site_organisme}}",
  "Logo de l'organisme": "{{logo_organisme}}",
  "Nom du représentant de l'organisme": "{{representant_organisme}}",
  "Titre du représentant de l'organisme": "{{titre_representant_organisme}}",
  "Signature de l'organisme": "{{signature_organisme}}",
  "Cachet de l'organisme": "{{tampon_organisme}}",
  // Client / bénéficiaire
  "Nom du client": "{{nom_client}}",
  "Nom de l'entreprise": "{{nom_client}}",
  "Adresse du client": "{{client_adresse}}",
  "SIRET du client": "{{client_siret}}",
  "Nom du représentant légal du client": "{{client_representant}}",
  "E-signature du client": "{{e_signature_client}}",
  // Formation
  "Nom de la formation": "{{titre_formation}}",
  "Nom du programme associé": "{{titre_formation}}",
  "Type d'action de formation": "{{type_action_formation}}",
  "Type de diplôme décerné": "{{type_diplome}}",
  "Durée de la formation": "{{duree_heures}}",
  "Total des heures des créneaux de la formation": "{{duree_heures}}",
  "Lieu de la formation": "{{lieu}}",
  "Nombre d'apprenants du client": "{{formation_effectifs}}",
  "Apprenants du client": "{{liste_apprenants}}",
  "Dates de la formation": "{{dates_formation}}",
  "Date de début de la formation": "{{date_debut}}",
  "Date de fin de la formation": "{{date_fin}}",
  "Modalité de la formation": "{{formation_modalite}}",
  "Formateurs de la formation": "{{formateurs_noms}}",
  "Tableau des coûts du client": "{{tableau_couts_client}}",
  "Tableau de signature entreprise compact": "{{tableau_signature_compact}}",
  "Tableau planning hebdo signé": "{{tableau_planning_hebdo}}",
  "Montant HT": "{{montant_ht}}",
  "Montant TTC": "{{montant_ttc}}",
  "Montant TVA": "{{montant_tva}}",
  // Dates
  "Date d'aujourd'hui": "{{date_today}}",
  // === Story B-Programme (template programme-formation.ts) ===
  "Description de la formation": "{{description_formation}}",
  "Date de création du programme": "{{date_creation_programme}}",
  "Durée en jours": "{{duree_jours}}",
  "Version du programme": "{{version_programme}}",
  "Délais d'accès": "{{delais_acces}}",
  "Modalité d'accès": "{{modalite_acces}}",
  "Profil du stagiaire": "{{profil_stagiaire}}",
  "Prérequis": "{{programme_prerequis}}",
  "Objectifs": "{{programme_objectifs}}",
  "Liste objectifs pédagogiques": "{{liste_objectifs_pedagogiques}}",
  "Contenu pédagogique": "{{contenu_pedagogique}}",
  "Équipe pédagogique": "{{equipe_pedagogique}}",
  "Moyens pédagogiques": "{{moyens_pedagogiques}}",
  "Dispositif d'évaluation": "{{dispositif_evaluation}}",
  "Taux de satisfaction": "{{taux_satisfaction}}",
  "Effectif max": "{{effectif_max}}",
  // === Story B-Convocation Apprenant ===
  "Nom de l'apprenant": "{{nom_apprenant}}",
  "Email de l'apprenant": "{{email_apprenant}}",
  "Identifiant apprenant": "{{identifiant_apprenant}}",
  "Vos dates en détail": "{{dates_detail}}",
  "URL de connexion": "{{url_connexion}}",
  "Mot de passe apprenant": "{{mot_de_passe_apprenant}}",
  // Lot H : QR code page connexion (pré-calculé async côté API)
  "QR code connexion": "{{qr_code_connexion}}",
  // === Story B-Certificat Réalisation ===
  "URL Logo Ministère du Travail": "{{url_logo_ministere_travail}}",
  "Objectifs pédagogiques du programme": "{{liste_objectifs_pedagogiques}}",
  // === Story B-Attestation Assiduité ===
  "Heures de formation réalisées par l'apprenant": "{{heures_realisees_apprenant}}",
  "Taux de réalisation": "{{taux_realisation}}",
  // === Story B-Émargement Individuel ===
  "Tableau de signature de l'apprenant": "{{tableau_signature_individuel}}",
  // === Story B-Certificat diplôme ===
  "Code d'identification du certificat": "{{code_certificat}}",
  // === Story B-Résultats Évaluations ===
  "Tableau des résultats des évaluations": "{{tableau_resultats_evaluations}}",
  // === Story B-Attestation Compétences ===
  "Nom du/des formateur(s)": "{{formateurs_noms}}",
  "Signature de l'intervenant": "{{signature_intervenant}}",
  // === Story B-Autorisation Image ===
  "E-signature de l'apprenant": "{{e_signature_apprenant}}",
  // === Story B-Réponses Satisfaction Apprenants (vue session) ===
  "Tableau des réponses des questionnaires de satisfaction (suivi qualité)": "{{tableau_reponses_satisfaction}}",
  "Tableau du suivi qualité": "{{tableau_suivi_qualite}}",
  "Tableau des réponses des évaluations": "{{tableau_reponses_evaluations}}",
  // === Story B-AIPR (Attestation Intervention Proximité Réseaux) ===
  "Ville de naissance de l'apprenant": "{{ville_naissance_apprenant}}",
  "Adresse de l'entreprise": "{{client_adresse}}",
  "Résultat examen AIPR": "{{resultat_examen_aipr}}",
  // === Story B-Convention Intervention (formateur sous-traitance) ===
  "Nom du formateur": "{{nom_formateur_complet}}",
  "Adresse du formateur": "{{adresse_formateur}}",
  "SIRET du formateur": "{{siret_formateur}}",
  "NDA du formateur": "{{nda_formateur}}",
  "Lien de l'extranet du formateur": "{{lien_extranet_formateur}}",
  "E-signature du Formateur": "{{e_signature_formateur}}",
  "Adresse de la formation": "{{adresse_formation}}",
  "Coût total du formateur (HT)": "{{cout_formateur_ht}}",
};

/**
 * Returns an array of unresolved {{variables}} still present in the content.
 */
export function findUnresolvedVariables(content: string): string[] {
  const matches = content.match(/\{\{[^}]+\}\}/g);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Alias canonique pour la résolution de variables documents (cf Story B0 du
 * refactor Documents — epics-documents.md). Préférer ce nom dans le nouveau
 * code applicatif ; l'export `resolveVariables` reste pour rétro-compat avec
 * les 8+ call sites existants.
 */
export const resolveDocumentVariables = resolveVariables;

/**
 * Extrait le `Record<string, string>` des variables résolues pour les
 * consumers qui ne veulent pas un template HTML pré-substitué (ex :
 * docxtemplater qui prend directement un objet `{ nom: "valeur" }`).
 *
 * Sortie : `{ "nom_apprenant": "Pierre Martin", "date_formation": "15/05/2026", ... }`
 * (clés SANS les délimiteurs `{{ }}`).
 *
 * NB : les valeurs `[Placeholder]` du fallback sont remplacées par "" pour
 * docxtemplater (cohérent avec la convention "no undefined in PDF").
 */
export function getResolvedVariablesMap(data: ResolveContext): Record<string, string> {
  // Stratégie : on construit un probe template avec un format ligne par ligne
  // `__START__<key>__SEP__{{key}}__END__`. Après résolution de resolveVariables,
  // chaque ligne devient `__START__<key>__SEP__<valeur résolue>__END__`. On
  // parse chaque ligne pour extraire (key, valeur) — évite tout regex sur les
  // délimiteurs `{{ }}` qui ont disparu après la substitution.
  const probeTemplate = VARIABLE_KEYS.map((k) => {
    const stripped = k.replace(/^\{\{|\}\}$/g, "");
    return `__START__${stripped}__SEP__${k}__END__`;
  }).join("\n");
  const resolved = resolveVariables(probeTemplate, data);

  const map: Record<string, string> = {};
  // Capture multi-ligne : la valeur peut contenir des HTML inline (ex: <img>).
  const lineRegex = /__START__([a-z_]+)__SEP__([\s\S]*?)__END__/g;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(resolved)) !== null) {
    const key = match[1];
    const value = match[2];
    // Convertit les placeholders fallback "[Xxx]" en chaîne vide pour les
    // consumers docxtemplater (qui afficheraient "[Nom apprenant]" comme du
    // texte brut dans le PDF — pas joli).
    map[key] = /^\[.*\]$/.test(value) ? "" : value;
  }
  return map;
}

/**
 * Liste exhaustive des clés `{{xxx}}` supportées. Source de vérité unique pour
 * `getResolvedVariablesMap` et pour les pages admin qui montrent le catalogue.
 */
/**
 * Charge les paramètres organisme (entity) depuis Supabase pour les variables
 * `{{logo_organisme}}`, `{{signature_organisme}}`, `{{siret_organisme}}`, etc.
 *
 * Retourne `null` si l'entity n'existe pas ou si la lecture échoue (Loris doit
 * pouvoir générer des docs même si une variable organisme manque — le fallback
 * `[Adresse organisme]` du resolver est lisible).
 *
 * Utilisé par TabConventionDocs (charge entity au mount) et par
 * email-attachments-resolver (charge entity avant chaque envoi).
 */
export async function loadEntitySettings(
  supabase: SupabaseClient,
  entityId: string,
): Promise<ResolveContext["entity"] | null> {
  const { data, error } = await supabase
    .from("entities")
    .select(
      "name, slug, siret, nda, address, postal_code, city, email, phone, website, president_name, president_title, signature_text, stamp_url, signature_url, logo_url",
    )
    .eq("id", entityId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return data as ResolveContext["entity"];
}

export const VARIABLE_KEYS = [
  "{{nom_client}}",
  "{{nom_apprenant}}",
  "{{prenom_apprenant}}",
  "{{nom_formateur}}",
  "{{titre_formation}}",
  "{{date_formation}}",
  "{{date_debut}}",
  "{{date_fin}}",
  "{{lieu}}",
  "{{duree_heures}}",
  "{{date_today}}",
  "{{numero_facture}}",
  "{{montant}}",
  "{{signature_apprenant}}",
  "{{signature_formateur}}",
  "{{email_apprenant}}",
  "{{identifiant_apprenant}}",
  "{{telephone_apprenant}}",
  "{{entreprise_contact}}",
  "{{telephone_client}}",
  "{{email_client}}",
  "{{nom_commercial}}",
  "{{lien_connexion}}",
  "{{date_limite}}",
  "{{client_adresse}}",
  "{{client_siret}}",
  "{{client_representant}}",
  "{{montant_ht}}",
  "{{montant_ttc}}",
  "{{montant_tva}}",
  "{{formation_effectifs}}",
  "{{liste_apprenants}}",
  "{{formation_modalite}}",
  "{{formateurs_noms}}",
  "{{programme_objectifs}}",
  "{{programme_prerequis}}",
  "{{programme_public}}",
  "{{programme_contenu}}",
  "{{siret_organisme}}",
  "{{nda_organisme}}",
  "{{adresse_organisme}}",
  "{{email_organisme}}",
  "{{telephone_organisme}}",
  "{{site_organisme}}",
  "{{signature_organisme}}",
  "{{tampon_organisme}}",
  "{{logo_organisme}}",
  // Story B-Convention
  "{{nom_organisme}}",
  "{{ville_organisme}}",
  "{{representant_organisme}}",
  "{{titre_representant_organisme}}",
  "{{e_signature_client}}",
  "{{type_action_formation}}",
  "{{type_diplome}}",
  "{{dates_formation}}",
  "{{tableau_couts_client}}",
  "{{tableau_signature_compact}}",
  "{{tableau_planning_hebdo}}",
  // Story B-Programme
  "{{description_formation}}",
  "{{date_creation_programme}}",
  "{{duree_jours}}",
  "{{version_programme}}",
  "{{delais_acces}}",
  "{{modalite_acces}}",
  "{{profil_stagiaire}}",
  "{{equipe_pedagogique}}",
  "{{moyens_pedagogiques}}",
  "{{dispositif_evaluation}}",
  "{{taux_satisfaction}}",
  "{{effectif_max}}",
  "{{liste_objectifs_pedagogiques}}",
  "{{contenu_pedagogique}}",
  // Story B-Convocation Apprenant
  "{{dates_detail}}",
  "{{url_connexion}}",
  "{{mot_de_passe_apprenant}}",
  // Story B-Certificat Réalisation
  "{{url_logo_ministere_travail}}",
  // Story B-Attestation Assiduité
  "{{heures_realisees_apprenant}}",
  "{{taux_realisation}}",
  // Story B-Émargement Individuel
  "{{tableau_signature_individuel}}",
  // Story B-Certificat diplôme
  "{{code_certificat}}",
  // Story B-Résultats Évaluations
  "{{tableau_resultats_evaluations}}",
  // Story B-Attestation Compétences
  "{{signature_intervenant}}",
  // Story B-Autorisation Image
  "{{e_signature_apprenant}}",
  // Story B-Réponses Satisfaction Apprenants (vue session)
  "{{tableau_reponses_satisfaction}}",
  "{{tableau_suivi_qualite}}",
  "{{tableau_reponses_evaluations}}",
  // Story B-AIPR
  "{{ville_naissance_apprenant}}",
  "{{resultat_examen_aipr}}",
  // Story B-Convention Intervention
  "{{nom_formateur_complet}}",
  "{{adresse_formateur}}",
  "{{siret_formateur}}",
  "{{nda_formateur}}",
  "{{lien_extranet_formateur}}",
  "{{e_signature_formateur}}",
  "{{adresse_formation}}",
  "{{cout_formateur_ht}}",
] as const;
