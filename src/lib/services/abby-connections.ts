import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeDbError } from "@/lib/api-error";
import {
  createAbbyClient,
  fetchCompanyIdentity,
  getCompanyIdentity,
} from "@/lib/abby/client";
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
  abby_invalid_state: "État de connexion incompatible avec l'action",
};

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

/**
 * Lit le référentiel du garde-fou anti-inversion (AD-5) : nom + SIRET de
 * l'entité. SIRET absent → refus de configuration explicite (jamais de
 * vérification impossible passée sous silence).
 */
async function readEntityIdentity(
  supabase: SupabaseClient,
  entityId: string
): Promise<ServiceResult<{ entityName: string; entitySiret: string }>> {
  const { data, error } = await supabase
    .from("entities")
    .select("name, siret")
    .eq("id", entityId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: { message: sanitizeDbError(error, "abby entity identity") },
    };
  }
  const siret = (data as { name: string; siret: string | null } | null)?.siret;
  if (!data || !siret) {
    return {
      ok: false,
      error: {
        message:
          "SIRET de l'entité non renseigné — impossible de vérifier le compte Abby (paramètres de l'organisme)",
      },
    };
  }
  return { ok: true, entityName: (data as { name: string }).name, entitySiret: siret };
}

/** Message dynamique du garde-fou anti-inversion (microcopy UX Flow 1). */
function siretMismatchMessage(
  found: string,
  accountName: string | null,
  entityName: string,
  expected: string
): string {
  const account = accountName ? `SIRET ${found}, ${accountName}` : `SIRET ${found}`;
  return `Le compte Abby connecté (${account}) ne correspond pas à ${entityName} (SIRET attendu ${expected}). Connexion refusée.`;
}

/**
 * Pose last_error/last_error_at sur la connexion existante (si elle existe).
 * Message en paramètre : les erreurs dynamiques (mismatch SIRET) portent
 * les deux SIRET, les erreurs typées portent leur message court.
 */
async function markConnectionError(
  supabase: SupabaseClient,
  entityId: string,
  message: string
): Promise<void> {
  const { data: existing, error: selectError } = await supabase
    .from("abby_connections")
    .select("id")
    .eq("entity_id", entityId)
    .maybeSingle();

  if (selectError) {
    sanitizeDbError(selectError, "abby connections mark error (select)");
    return;
  }
  if (!existing) return;

  const { error: updateError } = await supabase
    .from("abby_connections")
    .update({
      last_error: message,
      last_error_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("entity_id", entityId);
  if (updateError) {
    sanitizeDbError(updateError, "abby connections mark error (update)");
  }
}

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
    await markConnectionError(supabase, entityId, message);
    return { ok: false, error: { message, code } };
  }

  // Garde-fou anti-inversion (FR-3, AD-5) : HORS du try — un mismatch n'est
  // pas une erreur d'appel Abby, et rien ne doit être stocké.
  const entity = await readEntityIdentity(supabase, entityId);
  if (!entity.ok) return entity;
  if (identity.companySiret !== entity.entitySiret) {
    const message = siretMismatchMessage(
      identity.companySiret,
      identity.companyName,
      entity.entityName,
      entity.entitySiret
    );
    await markConnectionError(supabase, entityId, message);
    return { ok: false, error: { message, code: "abby_siret_mismatch" } };
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

/**
 * Active la connexion testée de l'entité (FR-2) — second clic explicite.
 * Séquence : état `testee` requis → re-vérification SIRET LIVE (AD-5 : le
 * garde-fou joue au test ET à l'activation) → UPDATE conditionnel atomique
 * (anti double-onglet). Aucun contournement du mismatch n'existe (FR-3).
 */
export async function activateConnection(
  supabase: SupabaseClient,
  entityId: string
): Promise<ServiceResult<Record<never, never>>> {
  const stateRes = await getConnectionState(supabase, entityId);
  if (!stateRes.ok) return stateRes;
  // Évolution 1.4 : la réactivation d'une connexion désactivée passe par le
  // même chemin (FR-2 satisfaite par internalisation — le test live est
  // exécuté dans l'action même, juste avant la bascule atomique)
  if (!["testee", "desactivee"].includes(stateRes.state.status)) {
    return {
      ok: false,
      error: {
        message: "Aucune connexion testée ou désactivée à activer",
        code: "abby_invalid_state",
      },
    };
  }

  const entity = await readEntityIdentity(supabase, entityId);
  if (!entity.ok) return entity;

  // Re-vérification LIVE de l'identité du compte (premier consommateur réel
  // de withAbbyConnection — stats last_used_at/last_error gérées par lui).
  // La comparaison SIRET se fait HORS de fn : un throw custom sans `status`
  // serait mal mappé en abby_network par toAbbyErrorCode.
  const live = await withAbbyConnection(supabase, entityId, (client) =>
    getCompanyIdentity(client)
  );
  if (!live.ok) return live;

  if (live.data.companySiret !== entity.entitySiret) {
    const message = siretMismatchMessage(
      live.data.companySiret,
      live.data.companyName,
      entity.entityName,
      entity.entitySiret
    );
    await markConnectionError(supabase, entityId, message);
    return { ok: false, error: { message, code: "abby_siret_mismatch" } };
  }

  // UPDATE conditionnel atomique : seule une ligne inactive (testée ou
  // désactivée) peut basculer — anti double-onglet. Résidu TOCTOU assumé
  // (non exploitable pour FR-3) : un re-test concurrent peut remplacer le
  // triplet entre le getMe live et cet UPDATE, mais le seul chemin
  // d'écriture du triplet exige lui-même un match SIRET live — aucune clé
  // mismatchée ne peut être stockée, donc jamais activée.
  const { data: updated, error } = await supabase
    .from("abby_connections")
    .update({
      is_active: true,
      connected_at: new Date().toISOString(),
      company_name: live.data.companyName,
      company_siret: live.data.companySiret,
      last_error: null,
      last_error_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("entity_id", entityId)
    .eq("is_active", false)
    .select("entity_id");

  if (error) {
    return {
      ok: false,
      error: { message: sanitizeDbError(error, "abby connections activate") },
    };
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: {
        message: "Aucune connexion testée ou désactivée à activer",
        code: "abby_invalid_state",
      },
    };
  }

  return { ok: true };
}

/**
 * Désactive la connexion active de l'entité (FR-4). La clé, l'identité,
 * `connected_at` et l'éventuelle `last_error` restent en place — l'état
 * dérivé devient « désactivée » (réactivable via activateConnection).
 */
export async function deactivateConnection(
  supabase: SupabaseClient,
  entityId: string
): Promise<ServiceResult<{ companySiret: string | null }>> {
  const { data: updated, error } = await supabase
    .from("abby_connections")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("entity_id", entityId)
    .eq("is_active", true)
    .select("entity_id, company_siret");

  if (error) {
    return {
      ok: false,
      error: { message: sanitizeDbError(error, "abby connections deactivate") },
    };
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: {
        message: "Aucune connexion active à désactiver",
        code: "abby_invalid_state",
      },
    };
  }

  return {
    ok: true,
    companySiret:
      (updated[0] as { company_siret: string | null }).company_siret ?? null,
  };
}

/**
 * Health-check de la clé STOCKÉE (FR-4) : relit l'identité du compte en
 * live et re-compare le SIRET. Ne modifie JAMAIS is_active/connected_at.
 * Succès → last_error nettoyée (stamp de withAbbyConnection) + identité
 * rafraîchie ; échec Abby → last_error posée (stamp) ; mismatch →
 * last_error dynamique via markConnectionError.
 */
export async function retestConnection(
  supabase: SupabaseClient,
  entityId: string
): Promise<ServiceResult<{ identity: AbbyTestConnectionResult }>> {
  // Garde SIRET entité AVANT tout appel Abby (sinon le stamp succès
  // nettoierait last_error avant un échec de configuration)
  const entity = await readEntityIdentity(supabase, entityId);
  if (!entity.ok) return entity;

  const live = await withAbbyConnection(supabase, entityId, (client) =>
    getCompanyIdentity(client)
  );
  if (!live.ok) return live;

  if (live.data.companySiret !== entity.entitySiret) {
    const message = siretMismatchMessage(
      live.data.companySiret,
      live.data.companyName,
      entity.entityName,
      entity.entitySiret
    );
    await markConnectionError(supabase, entityId, message);
    return { ok: false, error: { message, code: "abby_siret_mismatch" } };
  }

  const { error } = await supabase
    .from("abby_connections")
    .update({
      company_name: live.data.companyName,
      company_siret: live.data.companySiret,
      updated_at: new Date().toISOString(),
    })
    .eq("entity_id", entityId);

  if (error) {
    return {
      ok: false,
      error: { message: sanitizeDbError(error, "abby connections retest") },
    };
  }

  return { ok: true, identity: live.data };
}
