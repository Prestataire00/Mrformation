import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugifyName } from "@/lib/utils/slugify-name";
import { buildSyntheticEmail } from "@/lib/utils/learner-email-synthetic";
import {
  RESOLVE_USERNAME_TARGET_MS,
  dummyBcryptCompare,
  padToTarget,
} from "@/lib/auth/timing-safe";

/**
 * Pédagogie V2 Epic 2.5 — POST /api/auth/resolve-username
 *
 * Résout `username + entitySlug → email` pour permettre à un apprenant de se
 * logger avec son username (Supabase Auth ne sait s'authentifier que par
 * email).
 *
 * Anti-énumération (défense en profondeur) :
 *  - DB : `public.resolve_learner_email_by_username` retourne TOUJOURS un
 *    email bien formé (synthétique fabriqué si username inconnu). C'est
 *    `signInWithPassword` plus tard qui retournera "Invalid credentials".
 *  - API : travail CPU constant via `dummyBcryptCompare` + padding du temps
 *    de réponse à `RESOLVE_USERNAME_TARGET_MS` (cf. `timing-safe.ts`).
 *  - Fallback applicatif : si la RPC échoue (DB down, timeout), on fabrique
 *    un email synthétique côté Node pour rester timing-safe et ne pas leak
 *    via 5xx l'info "username valide / invalide".
 *
 * Dette V1.1 (volontaire) :
 *  - Rate-limit IP NON implémenté (un attaquant peut spammer mais la
 *    timing-safety + email synthétique systématique limitent fortement
 *    l'intérêt). À ajouter en V1.1 via `checkRateLimit('resolve:<ip>', ...)`.
 *
 * Body attendu :
 *   { identifier: string; entitySlug: string }
 *
 * Réponse (toujours 200, format uniforme) :
 *   { email: string }
 *
 * Erreurs (400) :
 *   { error: "invalid_payload" } — body Zod-invalide
 */

// `entitySlug` doit matcher le format slug de `entities.slug` (lowercase,
// digits, hyphens). Regex stricte pour éviter d'envoyer en RPC des chaînes
// arbitraires (anti-injection défense en profondeur — la RPC est déjà en
// SQL paramétré mais on rejette tôt côté Edge). Fix M2 review adversariale.
const ENTITY_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,49}$/;

const BodySchema = z.object({
  identifier: z.string().min(1).max(100),
  entitySlug: z
    .string()
    .min(1)
    .max(50)
    .regex(ENTITY_SLUG_REGEX, "invalid_entity_slug_format"),
});

type RpcResponse = string | null;

export async function POST(request: NextRequest) {
  const start = performance.now();

  // 1. Parse body. On padd quand même au target avant de retourner 400
  //    pour ne pas leak "body invalide → réponse rapide" vs "résolution
  //    en cours → réponse 150ms".
  let identifier = "";
  let entitySlug = "";
  let parseOk = true;
  try {
    const raw = (await request.json()) as unknown;
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      parseOk = false;
    } else {
      identifier = parsed.data.identifier;
      entitySlug = parsed.data.entitySlug;
    }
  } catch {
    parseOk = false;
  }

  // 2. Résolution via RPC SECURITY DEFINER. Fallback synthétique si échec.
  //    On exécute le travail même en cas de payload invalide (timing-safe).
  let resolvedEmail = "";
  if (parseOk) {
    const usernameLower = identifier.toLowerCase();
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase.rpc(
        "resolve_learner_email_by_username",
        {
          p_username: usernameLower,
          p_entity_slug: entitySlug,
        },
      );
      if (error || data === null || data === undefined) {
        resolvedEmail = buildSyntheticEmail(
          slugifyName(identifier),
          entitySlug,
        );
      } else {
        resolvedEmail = data as RpcResponse ?? "";
        if (!resolvedEmail) {
          resolvedEmail = buildSyntheticEmail(
            slugifyName(identifier),
            entitySlug,
          );
        }
      }
    } catch {
      // RPC down / config Supabase manquante → fallback synthétique.
      resolvedEmail = buildSyntheticEmail(slugifyName(identifier), entitySlug);
    }
  } else {
    // Body invalide : on construit quand même un email factice pour
    // garder le même path CPU.
    resolvedEmail = buildSyntheticEmail("unknown", "unknown");
  }

  // 3. Travail CPU constant (dummy bcrypt) — ~50-80ms systématiques.
  await dummyBcryptCompare();

  // 4. Padding au timing cible (no-op si déjà dépassé).
  await padToTarget(start, RESOLVE_USERNAME_TARGET_MS);

  // 5. Réponse — uniforme, jamais 5xx (sauf payload invalide qui doit
  //    être détecté en amont par le front).
  if (!parseOk) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  return NextResponse.json({ email: resolvedEmail }, { status: 200 });
}
