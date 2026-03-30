import { formatDate } from "@/lib/utils";
import type { Session, Client, Learner, Trainer } from "@/lib/types";

export interface ResolveContext {
  session?: Session | null;
  client?: Client | null;
  learner?: Learner | null;
  trainer?: Trainer | null;
  profile?: { first_name: string; last_name: string } | null;
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

  const replacements: Record<string, string> = {
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
    "{{duree_heures}}": "[Durée heures]",
    "{{date_today}}": formatDate(now.toISOString()),
    "{{numero_facture}}": `FACT-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    "{{montant}}": "[Montant HT]",
    "{{signature_apprenant}}": "[Signature apprenant]",
    "{{signature_formateur}}": "[Signature formateur]",
    "{{email_apprenant}}": data.learner?.email || "[Email apprenant]",
    "{{telephone_apprenant}}": data.learner?.phone || "[Téléphone apprenant]",
    "{{entreprise_contact}}": (data.client as any)?.contact_name || "[Contact entreprise]",
    "{{telephone_client}}": (data.client as any)?.phone || "[Téléphone client]",
    "{{email_client}}": (data.client as any)?.email || "[Email client]",
    "{{nom_commercial}}": data.profile
      ? `${data.profile.first_name} ${data.profile.last_name}`
      : "[Nom commercial]",
    "{{lien_connexion}}": "[Lien de connexion]",
    "{{date_limite}}": "[Date limite]",
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
