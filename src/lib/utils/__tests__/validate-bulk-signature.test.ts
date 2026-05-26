import { describe, it, expect } from "vitest";
import { isValidAdminBulkSignature } from "@/lib/utils/validate-bulk-signature";

describe("isValidAdminBulkSignature", () => {
  it("rejette null et string vide", () => {
    expect(isValidAdminBulkSignature(null)).toBe(false);
    expect(isValidAdminBulkSignature("")).toBe(false);
  });

  it("rejette la string littérale 'admin_bulk' (bug historique)", () => {
    expect(isValidAdminBulkSignature("admin_bulk")).toBe(false);
  });

  it("accepte un data URL PNG", () => {
    expect(
      isValidAdminBulkSignature("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA="),
    ).toBe(true);
  });

  it("accepte un SVG raw (format émis par SignaturePad)", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 128"><path d="M0 0L10 10" stroke="#1d4ed8" stroke-width="2" fill="none"/></svg>';
    expect(isValidAdminBulkSignature(svg)).toBe(true);
  });

  it("rejette toute string sans préfixe data: ni structure SVG", () => {
    expect(isValidAdminBulkSignature("juste du texte")).toBe(false);
    expect(isValidAdminBulkSignature("admin_signature")).toBe(false);
    expect(isValidAdminBulkSignature("<html>not svg</html>")).toBe(false);
  });
});
