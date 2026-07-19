import { z } from "zod";

// Validation du test de connexion Abby (POST /api/abby/connections).
// Pas de check de préfixe strict : les clés réelles commencent par `suk_`
// (underscore — la doc disait `suk-`), rester tolérant à un changement de format.
export const testConnectionSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20, "La clé API semble incomplète")
    .max(4096, "La clé API semble invalide"),
});

export type TestConnectionInput = z.infer<typeof testConnectionSchema>;

// Body de POST /api/abby/invoices/[id]/push (story 3.4) — OPTIONNEL :
// les appels de boucle nominale n'envoient pas de body ; `restartFromZero`
// est le consentement explicite du repartir-de-zéro (AD-8).
export const pushRequestSchema = z.object({
  restartFromZero: z.boolean().optional(),
});

export type PushRequestInput = z.infer<typeof pushRequestSchema>;
