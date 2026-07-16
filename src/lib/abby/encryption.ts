import crypto from "crypto";

// Chiffrement des clés API Abby au repos (AES-256-GCM), miroir de
// src/lib/gmail/encryption.ts — module volontairement dupliqué (AD-4) :
// env dédiée ABBY_ENCRYPTION_KEY pour une rotation indépendante de Gmail.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

// Doit rester identique caractère pour caractère au placeholder de .env.example
const PLACEHOLDER_KEY = "votre-cle-hex-32-bytes-pour-aes256";

function getEncryptionKey(): Buffer {
  const key = process.env.ABBY_ENCRYPTION_KEY;
  if (!key || key === PLACEHOLDER_KEY) {
    throw new Error(
      "ABBY_ENCRYPTION_KEY is not configured (générer avec `openssl rand -hex 32` et provisionner sur Netlify ET Railway)"
    );
  }
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(
      "ABBY_ENCRYPTION_KEY doit faire 64 caractères hexadécimaux (openssl rand -hex 32)"
    );
  }
  return Buffer.from(key, "hex");
}

export function encryptApiKey(plaintext: string): {
  encrypted: string;
  iv: string;
  authTag: string;
} {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    encrypted,
    iv: iv.toString("hex"),
    authTag,
  };
}

export function decryptApiKey(
  encrypted: string,
  iv: string,
  authTag: string
): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
