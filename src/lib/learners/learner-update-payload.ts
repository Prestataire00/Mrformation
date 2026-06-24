/**
 * Construction du payload UPDATE de la fiche apprenant.
 *
 * Anti-récidive du bug AIPR (birth_city saisi mais jamais sauvegardé car oublié
 * dans le payload écrit à la main) : le payload est DÉRIVÉ de la liste des
 * champs éditables. Ajouter un champ = l'ajouter à `LEARNER_EDITABLE_FIELDS`,
 * et il part automatiquement en base. Un test vérifie la parité.
 */

/** Champs éditables de la fiche apprenant (TabIdentite). Source de vérité. */
export const LEARNER_EDITABLE_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "client_id",
  "job_title",
  "birth_date",
  "birth_city",
  "gender",
  "nationality",
  "address",
  "city",
  "postal_code",
  "social_security_number",
  "education_level",
] as const;

export type LearnerEditableField = (typeof LEARNER_EDITABLE_FIELDS)[number];

/**
 * Règle par champ :
 *  - trim : applique `.trim()` à la saisie (champs texte) ;
 *  - fallback "current" : si vide → garde la valeur actuelle (champs requis :
 *    nom/prénom/email) ; sinon → `null`.
 */
const FIELD_RULES: Record<LearnerEditableField, { trim: boolean; fallback: "current" | "null" }> = {
  first_name: { trim: true, fallback: "current" },
  last_name: { trim: true, fallback: "current" },
  email: { trim: true, fallback: "current" },
  phone: { trim: true, fallback: "null" },
  client_id: { trim: false, fallback: "null" },
  job_title: { trim: true, fallback: "null" },
  birth_date: { trim: false, fallback: "null" },
  birth_city: { trim: true, fallback: "null" },
  gender: { trim: false, fallback: "null" },
  nationality: { trim: true, fallback: "null" },
  address: { trim: true, fallback: "null" },
  city: { trim: true, fallback: "null" },
  postal_code: { trim: true, fallback: "null" },
  social_security_number: { trim: true, fallback: "null" },
  education_level: { trim: false, fallback: "null" },
};

export type LearnerUpdatePayload = Record<LearnerEditableField, string | null>;

/**
 * Construit le payload UPDATE depuis le formulaire. Couvre TOUS les champs
 * éditables — impossible d'en oublier un.
 */
export function buildLearnerUpdatePayload(
  form: Partial<Record<string, string | null | undefined>>,
  current: Partial<Record<string, string | null | undefined>>,
): LearnerUpdatePayload {
  const payload = {} as LearnerUpdatePayload;
  for (const field of LEARNER_EDITABLE_FIELDS) {
    const rule = FIELD_RULES[field];
    const raw = form[field];
    const value = rule.trim ? (typeof raw === "string" ? raw.trim() : raw) : raw;
    payload[field] = (value || (rule.fallback === "current" ? current[field] : null)) ?? null;
  }
  return payload;
}
