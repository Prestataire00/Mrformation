import { describe, it, expect } from "vitest";
import {
  SLOT_COLOR_PALETTE,
  isValidSlotColor,
  getSlotColorText,
} from "@/lib/utils/slot-colors";

describe("slot-colors (Story 4.1)", () => {
  it("la palette n'est pas vide et a des valeurs hex uniques", () => {
    expect(SLOT_COLOR_PALETTE.length).toBeGreaterThan(0);
    const values = SLOT_COLOR_PALETTE.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
    values.forEach((v) => expect(v).toMatch(/^#[0-9a-f]{6}$/i));
  });

  it("isValidSlotColor accepte null/vide (aucune couleur)", () => {
    expect(isValidSlotColor(null)).toBe(true);
    expect(isValidSlotColor(undefined)).toBe(true);
    expect(isValidSlotColor("")).toBe(true);
  });

  it("isValidSlotColor accepte une couleur de la palette", () => {
    expect(isValidSlotColor(SLOT_COLOR_PALETTE[0].value)).toBe(true);
  });

  it("isValidSlotColor rejette une valeur hors palette", () => {
    expect(isValidSlotColor("#123456")).toBe(false);
    expect(isValidSlotColor("rouge")).toBe(false);
  });

  it("getSlotColorText renvoie le texte contrasté pour une couleur connue", () => {
    const c = SLOT_COLOR_PALETTE[0];
    expect(getSlotColorText(c.value)).toBe(c.text);
  });

  it("getSlotColorText renvoie undefined si vide ou inconnu", () => {
    expect(getSlotColorText(null)).toBeUndefined();
    expect(getSlotColorText("#000000")).toBeUndefined();
  });
});
