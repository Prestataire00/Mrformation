import { formatDate } from "@/lib/utils";
import type { Session, Client, Learner, Trainer } from "@/lib/types";

export interface ResolveContext {
  session?: Session | null;
  client?: Client | null;
  learner?: Learner | null;
  trainer?: Trainer | null;
  profile?: { first_name: string; last_name: string } | null;
  entity?: {
    siret?: string | null;
    nda?: string | null;
    address?: string | null;
    postal_code?: string | null;
    city?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    president_name?: string | null;
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

  // Build client address from components
  const clientAddress = (() => {
    const c = data.client;
    if (!c) return "[Adresse client]";
    const parts = [c.address, c.postal_code, c.city].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "[Adresse client]";
  })();

  // Client representative: first contact or fallback
  const clientRepresentant = (() => {
    const c = data.client;
    if (!c) return "[Représentant]";
    if (c.contacts && c.contacts.length > 0) {
      const primary = c.contacts.find((ct) => ct.is_primary) || c.contacts[0];
      return `${primary.last_name.toUpperCase()} ${primary.first_name}`;
    }
    return "[Représentant]";
  })();

  // Financial calculations
  const totalPrice = data.session?.total_price || 0;
  const montantHt = totalPrice;
  const montantTva = Math.round(totalPrice * 0.2 * 100) / 100;
  const montantTtc = Math.round((totalPrice + montantTva) * 100) / 100;

  // Enrollments count + list
  const enrollments = data.session?.enrollments || [];
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
    "{{nom_client}}": data.client?.company_name || "[Nom client]",
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
    "{{email_apprenant}}": data.learner?.email || "[Email apprenant]",
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
  };

  let result = content;
  Object.entries(replacements).forEach(([key, val]) => {
    result = result.replaceAll(key, val);
  });
  return result;
}

/**
 * Returns an array of unresolved {{variables}} still present in the content.
 */
export function findUnresolvedVariables(content: string): string[] {
  const matches = content.match(/\{\{[^}]+\}\}/g);
  return matches ? [...new Set(matches)] : [];
}
