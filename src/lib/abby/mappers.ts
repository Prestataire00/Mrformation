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
 * (« SERVICE » n'existe pas — le doc-comment du SDK ment).
 *
 * Signes (correctif review #351) :
 * - AVOIR (`isAvoir=true`) : `Math.abs` — le signe négatif LMS est une
 *   convention interne, la nature créditrice = type asset côté Abby (AD-17).
 * - FACTURE : une ligne négative (remise saisie librement dans le LMS) est
 *   REFUSÉE — l'abs gonflerait le total légal au-dessus de la préview
 *   confirmée (parité AC-4), et le passthrough signé n'a jamais été validé
 *   côté Abby. Le chemin correction = avoir.
 * Taux hors enum → resolveVatCode JETTE — la saga mappe en `abby_validation`.
 */
export function toAbbyInvoiceLines(
  lines: AbbyInvoiceLineInput[],
  vat: { vatExempt: boolean; tvaRate: number },
  opts: { isAvoir: boolean }
): AbbyBillingLine[] {
  const vatCode = vat.vatExempt
    ? VAT_EXONERATION_FORMATION.vatCode
    : resolveVatCode(vat.tvaRate);
  if (!opts.isAvoir) {
    const negative = lines.find((l) => l.quantity < 0 || l.unitPriceHT < 0);
    if (negative) {
      throw new Error(
        `Ligne « ${negative.description} » à montant négatif : non supporté sur une facture. ` +
          "Pour corriger une facture poussée, utilisez un avoir."
      );
    }
  }
  return lines.map((l) => ({
    designation: l.description,
    unitPrice: Math.round((opts.isAvoir ? Math.abs(l.unitPriceHT) : l.unitPriceHT) * 100),
    quantity: opts.isAvoir ? Math.abs(l.quantity) : l.quantity,
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
 * Epoch Abby → ISO (story 4.1). Les dates Abby sont en SECONDES (cf.
 * `toAbbyTimeline` en écriture) — détection d'échelle DÉFENSIVE : une valeur
 * > 1e12 est déjà en millisecondes. Un facteur 1000 non détecté poserait une
 * date en l'an 58509 (incident réel du projet, story 1.5).
 */
export function epochToIso(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const ms = value > 1e12 ? value : value * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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
