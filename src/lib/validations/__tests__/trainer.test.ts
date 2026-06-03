import { describe, it, expect } from "vitest";
import {
  trainerProfileSchema,
  getTrainerProfileErrors,
  IBAN_REGEX,
  BIC_REGEX,
  NDA_REGEX,
  POSTAL_CODE_FR_REGEX,
  TVA_FR_REGEX,
} from "../trainer";

describe("trainerProfileSchema — Lot F validation Zod", () => {
  const validFormData = {
    first_name: "Jean",
    last_name: "Dupont",
    email: "",
    phone: "",
    type: "internal" as const,
    bio: "",
    hourly_rate: "",
    availability_notes: "",
    siret: "",
    nda: "",
    contract_type: "",
    status: "active",
    legal_status: "",
    company_name: "",
    tva_number: "",
    address: "",
    city: "",
    postal_code: "",
    country: "",
    iban: "",
    bic: "",
    bank_name: "",
  };

  it("accepte un formData minimal (prénom + nom + type)", () => {
    const result = trainerProfileSchema.safeParse(validFormData);
    expect(result.success).toBe(true);
  });

  it("rejette si first_name manquant", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, first_name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/prénom/i);
    }
  });

  it("rejette si last_name manquant", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, last_name: "" });
    expect(result.success).toBe(false);
  });

  it("rejette type invalide", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, type: "freelance" });
    expect(result.success).toBe(false);
  });

  // ── Email ─────────────────────────────────────────────────────────
  it("accepte email vide (optionnel)", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, email: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBeNull();
  });

  it("rejette email mal formé", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, email: "pas-un-email" });
    expect(result.success).toBe(false);
  });

  it("accepte email valide", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, email: "jean@example.com" });
    expect(result.success).toBe(true);
  });

  // ── SIRET ─────────────────────────────────────────────────────────
  it("accepte SIRET valide (14 chiffres)", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, siret: "12345678901234" });
    expect(result.success).toBe(true);
  });

  it("rejette SIRET 13 chiffres", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, siret: "1234567890123" });
    expect(result.success).toBe(false);
  });

  // ── NDA ───────────────────────────────────────────────────────────
  it("accepte NDA 11 chiffres", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, nda: "93132013113" });
    expect(result.success).toBe(true);
  });

  it("rejette NDA mal formé", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, nda: "abc" });
    expect(result.success).toBe(false);
  });

  // ── Code postal ───────────────────────────────────────────────────
  it("accepte code postal 5 chiffres", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, postal_code: "75001" });
    expect(result.success).toBe(true);
  });

  it("rejette code postal 4 chiffres", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, postal_code: "7500" });
    expect(result.success).toBe(false);
  });

  // ── IBAN ──────────────────────────────────────────────────────────
  it("accepte IBAN FR formaté avec espaces (normalise)", () => {
    const result = trainerProfileSchema.safeParse({
      ...validFormData,
      iban: "FR76 3000 1007 9412 3456 7890 185",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Vérifie le strip des espaces + uppercase
      expect(result.data.iban).toBe("FR7630001007941234567890185");
    }
  });

  it("rejette IBAN trop court", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, iban: "FR12" });
    expect(result.success).toBe(false);
  });

  // ── BIC ───────────────────────────────────────────────────────────
  it("accepte BIC 8 caractères", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, bic: "BNPAFRPP" });
    expect(result.success).toBe(true);
  });

  it("accepte BIC 11 caractères", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, bic: "BNPAFRPPXXX" });
    expect(result.success).toBe(true);
  });

  it("rejette BIC 9 caractères (invalide)", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, bic: "BNPAFRPPX" });
    expect(result.success).toBe(false);
  });

  // ── TVA FR ────────────────────────────────────────────────────────
  it("accepte TVA FR valide (FR + 2 chars + 9 chiffres)", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, tva_number: "FR12345678901" });
    expect(result.success).toBe(true);
  });

  it("rejette TVA sans préfixe FR", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, tva_number: "12345678901" });
    expect(result.success).toBe(false);
  });

  // ── legal_status ──────────────────────────────────────────────────
  it("accepte legal_status enum valide", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, legal_status: "sasu" });
    expect(result.success).toBe(true);
  });

  it("rejette legal_status hors enum", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, legal_status: "freelance" });
    expect(result.success).toBe(false);
  });

  // ── hourly_rate ───────────────────────────────────────────────────
  it("accepte hourly_rate vide (null)", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, hourly_rate: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.hourly_rate).toBeNull();
  });

  it("convertit hourly_rate string en number", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, hourly_rate: "50.5" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.hourly_rate).toBe(50.5);
  });

  it("rejette hourly_rate négatif", () => {
    const result = trainerProfileSchema.safeParse({ ...validFormData, hourly_rate: "-10" });
    expect(result.success).toBe(false);
  });
});

describe("getTrainerProfileErrors helper", () => {
  it("retourne un map champ → message pour affichage UI", () => {
    const result = trainerProfileSchema.safeParse({
      first_name: "",
      last_name: "",
      email: "abc",
      type: "internal",
    } as never);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = getTrainerProfileErrors(result);
      expect(errors.first_name).toBeDefined();
      expect(errors.last_name).toBeDefined();
      expect(errors.email).toBeDefined();
    }
  });
});

describe("Regex métier exportés", () => {
  it("IBAN_REGEX accepte un IBAN FR", () => {
    expect(IBAN_REGEX.test("FR7630001007941234567890185")).toBe(true);
  });

  it("BIC_REGEX accepte 8 et 11 chars", () => {
    expect(BIC_REGEX.test("BNPAFRPP")).toBe(true);
    expect(BIC_REGEX.test("BNPAFRPPXXX")).toBe(true);
    expect(BIC_REGEX.test("BNPAFRPPX")).toBe(false);
  });

  it("NDA_REGEX exige 11 chiffres", () => {
    expect(NDA_REGEX.test("93132013113")).toBe(true);
    expect(NDA_REGEX.test("9313201311")).toBe(false);
  });

  it("POSTAL_CODE_FR_REGEX exige 5 chiffres", () => {
    expect(POSTAL_CODE_FR_REGEX.test("75001")).toBe(true);
    expect(POSTAL_CODE_FR_REGEX.test("7500")).toBe(false);
  });

  it("TVA_FR_REGEX exige FR + 2 chars + 9 chiffres", () => {
    expect(TVA_FR_REGEX.test("FR12345678901")).toBe(true);
    expect(TVA_FR_REGEX.test("12345678901")).toBe(false);
  });
});
