import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeDbError } from "@/lib/api-error";
import { createAbbyClient, fetchCompanyIdentity } from "@/lib/abby/client";
import { encryptApiKey, decryptApiKey } from "@/lib/abby/encryption";
import { toAbbyErrorCode, type AbbyErrorCode } from "@/lib/abby/errors";
import type {
  AbbyConnectionState,
  AbbyTestConnectionResult,
} from "@/lib/types/abby";

export type ServiceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: { message: string; code?: AbbyErrorCode } };

// Messages techniques courts (la microcopy UI vit dans la card — AD-16)
const CODE_MESSAGES: Record<AbbyErrorCode, string> = {
  abby_auth_failed: "Clé API refusée par Abby",
  abby_plan_no_api: "Accès API indisponible sur le plan du compte",
  abby_siret_mismatch: "SIRET du compte différent de l'entité",
  abby_duplicate: "Ressource déjà existante côté Abby",
  abby_not_found: "Ressource introuvable côté Abby",
  abby_validation: "Requête refusée par Abby (validation)",
  abby_rate_limited: "Trop de requêtes vers Abby",
  abby_network: "Abby injoignable",
  abby_no_connection: "Aucune connexion Abby pour cette entité",
};

type ConnectionRow = {
  is_active: boolean | null;
  connected_at: string | null;
  company_name: string | null;
  company_siret: string | null;
  last_used_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
};

/**
 * Lit l'état de la connexion de l'entité (colonnes NON sensibles uniquement)
 * et dérive le statut — les 4 états du glossaire AD-4 + « testee »
 * (is_active=false, connected_at NULL : testée, jamais activée).
 */
export async function getConnectionState(
  supabase: SupabaseClient,
  entityId: string
): Promise<ServiceResult<{ state: AbbyConnectionState }>> {
  const { data, error } = await supabase
    .from("abby_connections")
    .select(
      "is_active, connected_at, company_name, company_siret, last_used_at, last_error, last_error_at"
    )
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: { message: sanitizeDbError(error, "abby connections state") },
    };
  }

  if (!data) {
    return {
      ok: true,
      state: {
        status: "non_configuree",
        companyName: null,
        companySiret: null,
        isActive: false,
        connectedAt: null,
        lastUsedAt: null,
        lastError: null,
        lastErrorAt: null,
      },
    };
  }

  const row = data as ConnectionRow;
  const isActive = row.is_active === true;
  const status = isActive
    ? row.last_error
      ? "en_erreur"
      : "active"
    : row.connected_at
      ? "desactivee"
      : "testee";

  return {
    ok: true,
    state: {
      status,
      companyName: row.company_name,
      companySiret: row.company_siret,
      isActive,
      connectedAt: row.connected_at,
      lastUsedAt: row.last_used_at,
      lastError: row.last_error,
      lastErrorAt: row.last_error_at,
    },
  };
}

/**
 * Teste une clé API contre le compte Abby (`company.getMe()`).
 * Succès → stocke le triplet chiffré + l'identité du compte (is_active=false :
 * l'activation est un second clic explicite, story 1.3) et efface toute
 * erreur périmée. Échec → ne touche JAMAIS au triplet déjà stocké ; pose
 * last_error/last_error_at si une ligne existe, sinon n'écrit rien.
 */
export async function testAndStoreApiKey(
  supabase: SupabaseClient,
  entityId: string,
  apiKey: string
): Promise<ServiceResult<{ identity: AbbyTestConnectionResult }>> {
  let identity: AbbyTestConnectionResult;
  try {
    identity = await fetchCompanyIdentity(apiKey);
  } catch (err) {
    const code = toAbbyErrorCode(err);
    const message = CODE_MESSAGES[code];

    const { data: existing, error: selectError } = await supabase
      .from("abby_connections")
      .select("id")
      .eq("entity_id", entityId)
      .maybeSingle();

    if (selectError) {
      sanitizeDbError(selectError, "abby connections test (select existant)");
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("abby_connections")
        .update({
          last_error: message,
          last_error_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("entity_id", entityId);
      if (updateError) {
        sanitizeDbError(updateError, "abby connections test (pose last_error)");
      }
    }

    return { ok: false, error: { message, code } };
  }

  let triplet: ReturnType<typeof encryptApiKey>;
  try {
    triplet = encryptApiKey(apiKey);
  } catch (err) {
    // Erreur de CONFIGURATION serveur (env absente/malformée) — la distinguer
    // explicitement d'une « erreur interne » générique : la route est admin-only,
    // le nom de la variable est actionnable pour l'opérateur (NFR-5)
    sanitizeDbError(
      { message: err instanceof Error ? err.message : String(err) },
      "abby connections encrypt (config)"
    );
    return {
      ok: false,
      error: {
        message:
          "Configuration serveur incomplète : ABBY_ENCRYPTION_KEY absente ou invalide sur ce déploiement (64 caractères hex — openssl rand -hex 32, à poser sur Netlify ET Railway).",
      },
    };
  }

  const { error } = await supabase.from("abby_connections").upsert(
    {
      entity_id: entityId,
      encrypted_api_key: triplet.encrypted,
      key_iv: triplet.iv,
      key_auth_tag: triplet.authTag,
      company_name: identity.companyName,
      company_siret: identity.companySiret,
      is_active: false,
      // NULL explicite : une clé remplacée repasse à l'état « testée » —
      // la 1.3 distingue « testée » de « désactivée » par connected_at (AC-3)
      connected_at: null,
      last_error: null,
      last_error_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entity_id" }
  );

  if (error) {
    return {
      ok: false,
      error: { message: sanitizeDbError(error, "abby connections upsert") },
    };
  }

  return { ok: true, identity };
}

/**
 * Exécute `fn` avec le client Abby de l'entité (clé déchiffrée server-side).
 * SEUL écrivain de last_used_at / last_error / last_error_at pour les appels
 * utilisant la connexion STOCKÉE (AD-4) — testAndStoreApiKey est le second
 * écrivain autorisé (cas du test d'une clé pas encore stockée).
 */
export async function withAbbyConnection<T>(
  supabase: SupabaseClient,
  entityId: string,
  fn: (client: ReturnType<typeof createAbbyClient>) => Promise<T>
): Promise<ServiceResult<{ data: T }>> {
  const { data: row, error } = await supabase
    .from("abby_connections")
    .select("encrypted_api_key, key_iv, key_auth_tag")
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: { message: sanitizeDbError(error, "abby connections resolve") },
    };
  }
  if (!row) {
    return {
      ok: false,
      error: {
        message: CODE_MESSAGES.abby_no_connection,
        code: "abby_no_connection",
      },
    };
  }

  const triplet = row as {
    encrypted_api_key: string;
    key_iv: string;
    key_auth_tag: string;
  };
  let apiKey: string;
  try {
    apiKey = decryptApiKey(
      triplet.encrypted_api_key,
      triplet.key_iv,
      triplet.key_auth_tag
    );
  } catch {
    // Triplet illisible (ABBY_ENCRYPTION_KEY changée, données corrompues) :
    // la seule issue est de re-saisir la clé — même traitement que « pas de connexion »
    return {
      ok: false,
      error: {
        message:
          "Clé Abby stockée illisible (clé de chiffrement changée ?) — remplacez la clé dans les paramètres",
        code: "abby_no_connection",
      },
    };
  }
  const client = createAbbyClient(apiKey);

  const stamp = (patch: Record<string, unknown>) =>
    supabase
      .from("abby_connections")
      .update({
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...patch,
      })
      .eq("entity_id", entityId);

  try {
    const result = await fn(client);
    await stamp({ last_error: null, last_error_at: null });
    return { ok: true, data: result };
  } catch (err) {
    const code = toAbbyErrorCode(err);
    const message = CODE_MESSAGES[code];
    await stamp({ last_error: message, last_error_at: new Date().toISOString() });
    return { ok: false, error: { message, code } };
  }
}
