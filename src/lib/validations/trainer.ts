/**
 * Lot F audit BMAD — Validation Zod de la fiche formateur (21 champs).
 *
 * Couvre les patterns français spécifiques au métier formation :
 *  - IBAN (FR + autres pays SEPA jusqu'à 34 chars)
 *  - BIC / SWIFT (8 ou 11 chars)
 *  - SIRET (14 chiffres — réutilisé depuis validations/index.ts)
 *  - NDA Déclaration d'Activité (11 chiffres)
 *  - Code postal FR (5 chiffres)
 *  - TVA intracommunautaire FR
 *
 * Utilisé par /admin/trainers/[id]/page.tsx handleSaveProfile pour
 * valider AVANT l'UPDATE Supabase. Affiche les erreurs sous chaque
 * champ + toast récap si soumission invalide.
 */

import { z } from "zod";
import { emailField, SIRET_REGEX, PHONE_REGEX } from "@/lib/validations";

// ── Regex métier ────────────────────────────────────────────────────

/** IBAN : 2 lettres pays + 2 chiffres clé + jusqu'à 30 chars (alphanumérique). */
export const IBAN_REGEX = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

/** BIC / SWIFT : 8 ou 11 chars (4 lettres banque + 2 lettres pays + 2 alphanum loc + opt 3 chars branch). */
export const BIC_REGEX = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

/** NDA Déclaration d'Activité formateur : 11 chiffres. */
export const NDA_REGEX = /^\d{11}$/;

/** Code postal France métropolitaine + DOM-TOM : 5 chiffres. */
export const POSTAL_CODE_FR_REGEX = /^\d{5}$/;

/** TVA intracommunautaire France : FR + 2 chars + 9 chiffres SIREN. */
export const TVA_FR_REGEX = /^FR[A-Z0-9]{2}\d{9}$/;

// ── Helpers de champs optionnels qui acceptent string vide ──────────

/** Transforme une string vide en null (champs optionnels du formData). */
const emptyToNull = (val: unknown) => (val === "" || val === undefined ? null : val);

/** IBAN optionnel : trim + uppercase + regex (ou null/empty). */
const ibanField = z.preprocess(
  emptyToNull,
  z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .pipe(z.string().regex(IBAN_REGEX, "IBAN invalide (ex: FR76 1234 5678 ...)"))
    .nullable()
    .optional(),
);

/** BIC optionnel : trim + uppercase + regex. */
const bicField = z.preprocess(
  emptyToNull,
  z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .pipe(z.string().regex(BIC_REGEX, "BIC invalide (8 ou 11 caractères)"))
    .nullable()
    .optional(),
);

/** NDA optionnel : 11 chiffres. */
const ndaField = z.preprocess(
  emptyToNull,
  z.string().regex(NDA_REGEX, "Le NDA doit contenir 11 chiffres").nullable().optional(),
);

/** Code postal optionnel : 5 chiffres. */
const postalCodeField = z.preprocess(
  emptyToNull,
  z.string().regex(POSTAL_CODE_FR_REGEX, "Code postal invalide (5 chiffres)").nullable().optional(),
);

/** TVA FR optionnelle. */
const tvaField = z.preprocess(
  emptyToNull,
  z.string().regex(TVA_FR_REGEX, "TVA invalide (format FR + 11 caractères)").nullable().optional(),
);

/** Email optionnel : "" → null, sinon format email. */
const optionalEmailField = z.preprocess(
  emptyToNull,
  emailField.nullable().optional(),
);

/** SIRET local avec preprocess "" → null (le siretField global n'a pas le preprocess). */
const siretFieldLocal = z.preprocess(
  emptyToNull,
  z.string().regex(SIRET_REGEX, "Le SIRET doit contenir exactement 14 chiffres").nullable().optional(),
);

/** Phone local avec preprocess "" → null. */
const phoneFieldLocal = z.preprocess(
  emptyToNull,
  z.string().regex(PHONE_REGEX, "Numéro de téléphone invalide").max(20).nullable().optional(),
);

// ── Schema principal ────────────────────────────────────────────────

/**
 * Schema de validation du formData de la fiche formateur (composant
 * `/admin/trainers/[id]/page.tsx` handleSaveProfile).
 *
 * Champs requis : first_name, last_name, type.
 * Champs optionnels : tous les autres (chaîne vide → null en base).
 */
export const trainerProfileSchema = z.object({
  first_name: z.string().min(1, "Le prénom est requis").max(100),
  last_name: z.string().min(1, "Le nom est requis").max(100),
  email: optionalEmailField,
  phone: phoneFieldLocal,
  type: z.enum(["internal", "external"], {
    message: "Type formateur invalide (internal/external)",
  }),
  bio: z.preprocess(emptyToNull, z.string().max(5000).nullable().optional()),
  hourly_rate: z.preprocess(
    (val) => (val === "" || val === undefined ? null : Number(val)),
    z.number().min(0, "Tarif horaire ≥ 0").max(10000, "Tarif horaire trop élevé").nullable().optional(),
  ),
  availability_notes: z.preprocess(emptyToNull, z.string().max(2000).nullable().optional()),
  // Identification entreprise
  siret: siretFieldLocal,
  nda: ndaField,
  contract_type: z.preprocess(emptyToNull, z.string().max(100).nullable().optional()),
  status: z.preprocess(emptyToNull, z.string().max(50).nullable().optional()),
  legal_status: z.preprocess(
    emptyToNull,
    z
      .enum([
        "auto_entrepreneur",
        "sasu",
        "eurl",
        "sarl",
        "portage_salarial",
        "salarie",
        "autre",
      ])
      .nullable()
      .optional(),
  ),
  company_name: z.preprocess(emptyToNull, z.string().max(255).nullable().optional()),
  tva_number: tvaField,
  // Adresse
  address: z.preprocess(emptyToNull, z.string().max(500).nullable().optional()),
  city: z.preprocess(emptyToNull, z.string().max(255).nullable().optional()),
  postal_code: postalCodeField,
  country: z.preprocess(emptyToNull, z.string().max(100).nullable().optional()),
  // Coordonnées bancaires
  iban: ibanField,
  bic: bicField,
  bank_name: z.preprocess(emptyToNull, z.string().max(255).nullable().optional()),
});

export type TrainerProfileFormInput = z.input<typeof trainerProfileSchema>;
export type TrainerProfileFormOutput = z.output<typeof trainerProfileSchema>;

/**
 * Helper utilisé côté UI : retourne un map champ → 1er message d'erreur
 * pour afficher sous chaque input. Plus pratique que d'itérer issues
 * dans le JSX.
 */
export function getTrainerProfileErrors(
  result: { error: { issues: Array<{ path: (string | number | symbol)[]; message: string }> } },
): Partial<Record<keyof TrainerProfileFormInput, string>> {
  const errors: Partial<Record<keyof TrainerProfileFormInput, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof TrainerProfileFormInput | undefined;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}
