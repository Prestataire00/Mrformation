import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptApiKey, decryptApiKey } from "../encryption";

// Clé de test : 32 octets hex (jamais une vraie clé)
const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PLACEHOLDER = "votre-cle-hex-32-bytes-pour-aes256";

const ORIGINAL_ABBY_KEY = process.env.ABBY_ENCRYPTION_KEY;

describe("chiffrement des clés API Abby (AES-256-GCM)", () => {
  beforeEach(() => {
    process.env.ABBY_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_ABBY_KEY === undefined) delete process.env.ABBY_ENCRYPTION_KEY;
    else process.env.ABBY_ENCRYPTION_KEY = ORIGINAL_ABBY_KEY;
  });

  it("chiffre puis déchiffre une clé API à l'identique (round-trip)", () => {
    const plaintext = "suk_eyJhbGciOiJSUzI1NiJ9.exemple-de-cle";
    const { encrypted, iv, authTag } = encryptApiKey(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(iv).toMatch(/^[0-9a-f]{32}$/); // IV 16 octets en hex
    expect(authTag).toMatch(/^[0-9a-f]+$/);
    expect(decryptApiKey(encrypted, iv, authTag)).toBe(plaintext);
  });

  it("produit un chiffré différent à chaque appel (IV aléatoire)", () => {
    const a = encryptApiKey("meme-secret");
    const b = encryptApiKey("meme-secret");
    expect(a.encrypted).not.toBe(b.encrypted);
    expect(a.iv).not.toBe(b.iv);
  });

  it("jette une erreur explicite si ABBY_ENCRYPTION_KEY est absente", () => {
    delete process.env.ABBY_ENCRYPTION_KEY;
    expect(() => encryptApiKey("secret")).toThrowError(
      /ABBY_ENCRYPTION_KEY/
    );
  });

  it("jette une erreur explicite si ABBY_ENCRYPTION_KEY vaut le placeholder de .env.example", () => {
    process.env.ABBY_ENCRYPTION_KEY = PLACEHOLDER;
    expect(() => encryptApiKey("secret")).toThrowError(
      /ABBY_ENCRYPTION_KEY/
    );
  });

  it("refuse de déchiffrer si l'authTag est falsifié (intégrité GCM)", () => {
    const { encrypted, iv } = encryptApiKey("secret-a-proteger");
    const forgedTag = "00".repeat(16);
    expect(() => decryptApiKey(encrypted, iv, forgedTag)).toThrow();
  });
});
