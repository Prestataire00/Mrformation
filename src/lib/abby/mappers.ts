import type { CreateContactDto, CreateOrganizationDto } from "@abby-inc/node";
import type { AbbyRecipientData } from "@/lib/types/abby";
import { isPlausibleSiret } from "./validation";
import { deriveFrVatNumber } from "./vat";

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
