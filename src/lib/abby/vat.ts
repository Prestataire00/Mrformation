import type { VatCode } from "@abby-inc/node";
import { isPlausibleSiret } from "./validation";

// Configuration TVA du pont Abby (AD-17) — valeurs VÉRIFIÉES empiriquement
// sur compte réel en mode test le 16/07/2026 (story abby-1-5, PDF inspectés) :
// rapport dans bmad_output/implementation-artifacts/investigations/.

/** Taux français → code TVA Abby (enum du SDK, prix HT par ligne). */
export const VAT_RATE_TO_CODE: Record<string, VatCode> = {
  "20": "FR_2000",
  "10": "FR_1000",
  "8.5": "FR_850",
  "5.5": "FR_550",
  "2.1": "FR_210",
};

/**
 * Résout le taux de TVA d'une entité (`entities.tva_rate`) vers le code Abby.
 * Taux inconnu → erreur explicite : JAMAIS d'arrondi silencieux vers un
 * autre taux (AD-17) — le push doit échouer en `abby_validation`.
 */
export function resolveVatCode(rate: number): VatCode {
  const code = VAT_RATE_TO_CODE[String(rate)];
  if (!code) {
    throw new Error(
      `Taux de TVA ${rate} % sans équivalent Abby (taux supportés : 20, 10, 8.5, 5.5, 2.1). ` +
        "Corriger le taux dans les paramètres de l'organisme, ou l'exonération si l'entité n'est pas assujettie."
    );
  }
  return code;
}

/**
 * Exonération TVA formation professionnelle (art. 261-4-4°a du CGI) —
 * configuration pour `entities.tva_exempt = true`.
 *
 * ⚠️ PAS de `vatMention` : TOUTES les valeurs de l'enum Abby rendent une
 * mention légale fausse pour la formation (vérifié PDF par PDF, 16/07) :
 * `vat_exemption` → « directive 2006/112/CE » (intra-UE),
 * `vat_not_applicable` → « art. 259-1 » (lieu de prestation),
 * `not_subject` → « art. 293 B » (franchise en base).
 * La mention correcte passe par le `footerNote` (rendu fidèle en pied de
 * facture, une seule mention affichée).
 */
export const VAT_EXONERATION_FORMATION = {
  vatCode: "FR_00HT" as VatCode,
  footerNote: "TVA non applicable, article 261-4-4° du CGI.",
} as const;

/**
 * Dérive le numéro de TVA intracommunautaire français depuis un SIRET :
 * FR + clé (2 chiffres) + SIREN, avec clé = (12 + 3 × (SIREN mod 97)) mod 97.
 * Donnée publique déterministe — vecteur vérifié sur le PDF de recette du
 * 16/07 : SIREN MR 913113296 → FR51913113296. Null si SIRET non plausible.
 */
export function deriveFrVatNumber(siret: string): string | null {
  if (!isPlausibleSiret(siret)) return null;
  const siren = siret.slice(0, 9);
  const key = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(key).padStart(2, "0")}${siren}`;
}
