import { describe, it, expect } from "vitest";
import { toCreateOrganizationDto, toCreateContactDto } from "../mappers";
import type { AbbyRecipientData } from "@/lib/types/abby";

describe("toCreateOrganizationDto — mapping pur LMS → Abby (AD-17)", () => {
  it("payload complet : siret + vatNumber dérivé + emails + billingAddress à 4 clés country FR", () => {
    const r: AbbyRecipientData = {
      kind: "organization",
      name: "MR FORMATION",
      siret: "91311329600036",
      email: "contact@mrformation.fr",
      address: "24 Boulevard Gay Lussac",
      postalCode: "13014",
      city: "Marseille",
    };
    const dto = toCreateOrganizationDto(r);
    expect(dto).toEqual({
      name: "MR FORMATION",
      siret: "91311329600036",
      vatNumber: "FR51913113296", // vecteur réel du PDF de recette 1.5
      emails: ["contact@mrformation.fr"],
      billingAddress: {
        address: "24 Boulevard Gay Lussac",
        zipCode: "13014",
        city: "Marseille",
        country: "FR",
      },
    });
  });

  it("payload minimal (financier sans rien) : name seul — champs optionnels OMIS, jamais undefined", () => {
    const dto = toCreateOrganizationDto({
      kind: "organization",
      name: "OPCO Atlas",
      siret: null,
      email: null,
    });
    expect(dto).toEqual({ name: "OPCO Atlas" });
    expect("billingAddress" in dto).toBe(false);
    expect("emails" in dto).toBe(false);
    expect("vatNumber" in dto).toBe(false);
  });

  it("SIRET non plausible : ni siret ni vatNumber dans le payload", () => {
    const dto = toCreateOrganizationDto({
      kind: "organization",
      name: "Importée",
      siret: "1234567",
      email: null,
    });
    expect("siret" in dto).toBe(false);
    expect("vatNumber" in dto).toBe(false);
  });

  it("adresse partielle : billingAddress présent avec les 4 clés (nullables remplies à null)", () => {
    const dto = toCreateOrganizationDto({
      kind: "organization",
      name: "Partielle",
      siret: null,
      email: null,
      city: "Paris",
    });
    expect(dto.billingAddress).toEqual({
      address: null,
      zipCode: null,
      city: "Paris",
      country: "FR",
    });
  });
});

describe("toCreateContactDto — mapping contact (learner)", () => {
  it("prénom/nom/email", () => {
    const dto = toCreateContactDto({
      kind: "contact",
      name: "Marie Dupont",
      siret: null,
      email: "marie@exemple.fr",
      firstName: "Marie",
      lastName: "Dupont",
    });
    expect(dto).toEqual({
      firstname: "Marie",
      lastname: "Dupont",
      emails: ["marie@exemple.fr"],
    });
  });

  it("sans email : emails omis", () => {
    const dto = toCreateContactDto({
      kind: "contact",
      name: "A B",
      siret: null,
      email: null,
      firstName: "A",
      lastName: "B",
    });
    expect(dto).toEqual({ firstname: "A", lastname: "B" });
  });
});
