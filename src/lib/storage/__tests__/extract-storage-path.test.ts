import { describe, it, expect } from "vitest";
import { extractStoragePath } from "../extract-storage-path";

describe("extractStoragePath", () => {
  it("extrait bucket+path d'une URL publique Supabase", () => {
    const url = "https://x.supabase.co/storage/v1/object/public/formation-docs/sess/abc.pdf?t=1";
    expect(extractStoragePath(url)).toEqual({ bucket: "formation-docs", path: "sess/abc.pdf" });
  });

  it("extrait d'une URL signée (object/sign)", () => {
    const url = "https://x.supabase.co/storage/v1/object/sign/invoices/a/b.pdf?token=z";
    expect(extractStoragePath(url)).toEqual({ bucket: "invoices", path: "a/b.pdf" });
  });

  it("traite un path interne nu comme (defaultBucket, path)", () => {
    expect(extractStoragePath("sess/abc.pdf", "formation-docs")).toEqual({
      bucket: "formation-docs",
      path: "sess/abc.pdf",
    });
  });

  it("retire la query string d'un path interne nu", () => {
    expect(extractStoragePath("sess/abc.pdf?x=1", "formation-docs")).toEqual({
      bucket: "formation-docs",
      path: "sess/abc.pdf",
    });
  });

  it("retourne null si vide", () => {
    expect(extractStoragePath(null)).toBeNull();
    expect(extractStoragePath(undefined)).toBeNull();
    expect(extractStoragePath("")).toBeNull();
  });

  it("retourne null pour un path nu sans defaultBucket", () => {
    expect(extractStoragePath("sess/abc.pdf")).toBeNull();
  });
});
