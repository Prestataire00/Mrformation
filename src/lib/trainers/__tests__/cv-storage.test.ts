import { describe, it, expect } from "vitest";
import {
  TRAINER_CV_BUCKET,
  TRAINER_CV_LEGACY_BUCKET,
  getTrainerCvStoragePath,
  detectCvBucket,
  extractCvStorageCleanPath,
  isHttpCvUrl,
} from "../cv-storage";

describe("getTrainerCvStoragePath", () => {
  it("renvoie un path déterministe sous trainers/cv/", () => {
    expect(getTrainerCvStoragePath("abc-123")).toBe("trainers/cv/cv-abc-123.pdf");
  });

  it("ne contient ni timestamp ni random (déterministe pour upsert)", () => {
    const p1 = getTrainerCvStoragePath("uuid-fixe");
    const p2 = getTrainerCvStoragePath("uuid-fixe");
    expect(p1).toBe(p2);
  });
});

describe("detectCvBucket", () => {
  it("renvoie le bucket actuel quand previousCvUrl est null", () => {
    expect(detectCvBucket(null)).toBe(TRAINER_CV_BUCKET);
  });

  it("renvoie le bucket actuel quand previousCvUrl est undefined", () => {
    expect(detectCvBucket(undefined)).toBe(TRAINER_CV_BUCKET);
  });

  it("renvoie le bucket actuel quand previousCvUrl est vide", () => {
    expect(detectCvBucket("")).toBe(TRAINER_CV_BUCKET);
  });

  it("détecte le legacy bucket quand l'URL contient /documents/", () => {
    const legacyUrl =
      "https://xyz.supabase.co/storage/v1/object/public/documents/trainers/cv-123.pdf";
    expect(detectCvBucket(legacyUrl)).toBe(TRAINER_CV_LEGACY_BUCKET);
  });

  it("détecte le legacy bucket via convention de path ancien (trainers/cv-<id>.pdf)", () => {
    expect(detectCvBucket("trainers/cv-abc-123.pdf")).toBe(TRAINER_CV_LEGACY_BUCKET);
  });

  it("renvoie le bucket actuel quand path est le nouveau format trainers/cv/", () => {
    expect(detectCvBucket("trainers/cv/cv-abc-123.pdf")).toBe(TRAINER_CV_BUCKET);
  });

  it("renvoie le bucket actuel quand URL pointe sur elearning-documents", () => {
    const newUrl =
      "https://xyz.supabase.co/storage/v1/object/sign/elearning-documents/trainers/cv/cv-123.pdf?token=...";
    expect(detectCvBucket(newUrl)).toBe(TRAINER_CV_BUCKET);
  });
});

describe("extractCvStorageCleanPath", () => {
  it("renvoie une chaîne vide pour null/undefined/vide", () => {
    expect(extractCvStorageCleanPath(null)).toBe("");
    expect(extractCvStorageCleanPath(undefined)).toBe("");
    expect(extractCvStorageCleanPath("")).toBe("");
  });

  it("retire le préfixe Supabase Storage public URL", () => {
    const url =
      "https://xyz.supabase.co/storage/v1/object/public/documents/trainers/cv-abc.pdf";
    expect(extractCvStorageCleanPath(url)).toBe("trainers/cv-abc.pdf");
  });

  it("retire le préfixe Supabase Storage signed URL", () => {
    const url =
      "https://xyz.supabase.co/storage/v1/object/sign/elearning-documents/trainers/cv/cv-abc.pdf";
    expect(extractCvStorageCleanPath(url)).toBe("trainers/cv/cv-abc.pdf");
  });

  it("retire les query params (signed URL token)", () => {
    const url =
      "https://xyz.supabase.co/storage/v1/object/sign/elearning-documents/trainers/cv/cv-abc.pdf?token=eyJhbG...";
    expect(extractCvStorageCleanPath(url)).toBe("trainers/cv/cv-abc.pdf");
  });

  it("laisse passer un path interne déjà propre", () => {
    expect(extractCvStorageCleanPath("trainers/cv/cv-abc.pdf")).toBe(
      "trainers/cv/cv-abc.pdf",
    );
  });
});

describe("isHttpCvUrl", () => {
  it("renvoie false pour null/undefined/vide", () => {
    expect(isHttpCvUrl(null)).toBe(false);
    expect(isHttpCvUrl(undefined)).toBe(false);
    expect(isHttpCvUrl("")).toBe(false);
  });

  it("renvoie true pour http://", () => {
    expect(isHttpCvUrl("http://example.com/cv.pdf")).toBe(true);
  });

  it("renvoie true pour https://", () => {
    expect(isHttpCvUrl("https://xyz.supabase.co/storage/v1/object/public/documents/cv.pdf")).toBe(
      true,
    );
  });

  it("renvoie false pour un path interne", () => {
    expect(isHttpCvUrl("trainers/cv/cv-abc.pdf")).toBe(false);
  });
});
