import type { CreateContactDto, CreateOrganizationDto } from "@abby-inc/node";
import type { AbbyRecipientData } from "@/lib/types/abby";
import type { AbbyBillingLine } from "./client";
import { isPlausibleSiret } from "./validation";
import { deriveFrVatNumber, resolveVatCode, VAT_EXONERATION_FORMATION } from "./vat";

// Mappers purs LMS → Abby (AD-17 : TOUT mapping vit ici, testable sans mock).
// Règle : champs optionnels OMIS quand absents — jamais `undefined` explicite
// ni chaîne vide. `billingAddress`, s'il est présent, porte ses 4 clés
// (`address`/`city`/`zipCode` requises nullables + `country` requis).

/** Payload de création d'une organization Abby (entreprise ou financeur). */
export function toCreateOrganizationDto(
  recipient: AbbyRecipientData
): CreateOrganizationDto {
  const dto: CreateOrganizationDto = { name: recipient.name };

  if (isPlausibleSiret(recipient.siret)) {
    dto.siret = recipient.siret;
    const vatNumber = deriveFrVatNumber(recipient.siret);
    if (vatNumber) dto.vatNumber = vatNumber;
  }
  if (recipient.email) dto.emails = [recipient.email];

  const hasAddress =
    Boolean(recipient.address) ||
    Boolean(recipient.postalCode) ||
    Boolean(recipient.city);
  if (hasAddress) {
    dto.billingAddress = {
      address: recipient.address ?? null,
      zipCode: recipient.postalCode ?? null,
      city: recipient.city ?? null,
      country: "FR",
    };
  }

  return dto;
}

// ─── Mappers facture (saga 3.3, AD-17) ────────────────────────────────────

/** Ligne LMS en euros HT — MÊME forme que la préview 3.2. */
export interface AbbyInvoiceLineInput {
  description: string;
  quantity: number;
  unitPriceHT: number;
}

/**
 * Lignes LMS → lignes Abby : euros → CENTIMES entiers (`Math.round` PAR
 * LIGNE), HT partout (`isTaxIncluded: false`), `type: "service_delivery"`
 * (« SERVICE » n'existe pas — le doc-comment du SDK ment). `Math.abs` AVANT
 * l'arrondi : le signe négatif LMS d'un avoir est une convention interne, la
 * nature créditrice est portée par le type asset côté Abby (AD-17).
 * Taux hors enum → resolveVatCode JETTE (erreur explicite, jamais d'arrondi
 * silencieux) — la saga la mappe en `abby_validation`.
 */
export function toAbbyInvoiceLines(
  lines: AbbyInvoiceLineInput[],
  vat: { vatExempt: boolean; tvaRate: number }
): AbbyBillingLine[] {
  const vatCode = vat.vatExempt
    ? VAT_EXONERATION_FORMATION.vatCode
    : resolveVatCode(vat.tvaRate);
  return lines.map((l) => ({
    designation: l.description,
    unitPrice: Math.round(Math.abs(l.unitPriceHT) * 100),
    quantity: Math.abs(l.quantity),
    quantityUnit: "unit",
    type: "service_delivery",
    vatCode,
    isTaxIncluded: false,
  }));
}

/**
 * Dates de la facture — ⚠️ `emittedAt` en SECONDES (les millisecondes sont
 * acceptées puis mal interprétées → an 58509). `paymentDelay` V1 =
 * "thirty_days" : le chemin `customDueDate` du DTO n'a jamais été validé
 * empiriquement (unité inconnue) et `due_date` LMS est nullable.
 */
export function toAbbyTimeline(invoiceDateIso: string): {
  emittedAt: number;
  paymentDelay: "thirty_days";
} {
  return {
    emittedAt: Math.floor(Date.parse(invoiceDateIso) / 1000),
    paymentDelay: "thirty_days",
  };
}

/**
 * Mentions générales : exonérée → footerNote QO-1 SANS AUCUNE vatMention
 * (toutes les valeurs de l'enum rendent une mention légale fausse — PDF
 * vérifiés un à un le 16/07) ; assujettie → body vide (recette a-tva20).
 */
export function toAbbyGeneralInformations(vatExempt: boolean): {
  footerNote?: string;
} {
  return vatExempt ? { footerNote: VAT_EXONERATION_FORMATION.footerNote } : {};
}

/** Payload de création d'un contact Abby (particulier/apprenant). */
export function toCreateContactDto(
  recipient: AbbyRecipientData
): CreateContactDto {
  const dto: CreateContactDto = {
    firstname: recipient.firstName ?? "",
    lastname: recipient.lastName ?? "",
  };
  if (recipient.email) dto.emails = [recipient.email];
  return dto;
}
