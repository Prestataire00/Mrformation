import type { AbbyRecipientData, AbbyRecipientType } from "@/lib/types/abby";

// Validation des destinataires avant CRÉATION d'un client Abby (AD-21).
// POLITIQUE QUALITÉ LMS : l'API Abby accepte des fiches quasi vides
// (recette 1.5) — ces règles sont NOS exigences (e-invoicing B2B, mentions
// de facture). Périmètre contractualisé : le sort `to_create` UNIQUEMENT,
// en préview (3.2) comme en saga (3.3) — un client Abby déjà lié n'est
// jamais bloqué (la fiche Abby fait foi).

/**
 * SIRET plausible : 14 chiffres, pas un placeholder tout-zéros.
 * (Garde factorisée depuis 2.1 — le junk d'import ne doit jamais servir
 * de critère d'auto-liaison ni finir dans une fiche Abby.)
 */
export function isPlausibleSiret(siret: string | null): siret is string {
  return siret !== null && /^\d{14}$/.test(siret) && !/^0{14}$/.test(siret);
}

export type RecipientValidation =
  | { valid: true }
  | { valid: false; missingFields: string[]; message: string };

/**
 * Valide un destinataire pour la création de son client Abby.
 * Le TYPE (company/financier/learner) pilote les règles — pas seulement
 * `kind` : financier et company sont tous deux `organization` mais le
 * modèle LMS financeur n'a pas de SIRET (dette de conformité documentée).
 */
export function validateRecipientForAbby(
  recipientType: AbbyRecipientType,
  recipient: AbbyRecipientData
): RecipientValidation {
  const missing: string[] = [];

  if (recipientType === "company") {
    if (!recipient.name?.trim()) missing.push("nom de l'entreprise");
    if (!isPlausibleSiret(recipient.siret)) missing.push("SIRET (14 chiffres)");
    if (!recipient.address?.trim()) missing.push("adresse");
    if (!recipient.postalCode?.trim()) missing.push("code postal");
    if (!recipient.city?.trim()) missing.push("ville");
  } else if (recipientType === "financier") {
    if (!recipient.name?.trim()) missing.push("nom du financeur");
  } else {
    if (!recipient.firstName?.trim()) missing.push("prénom");
    if (!recipient.lastName?.trim()) missing.push("nom");
  }

  if (missing.length === 0) return { valid: true };
  return {
    valid: false,
    missingFields: missing,
    message: `Compléter la fiche client : ${missing.join(", ")}.`,
  };
}
