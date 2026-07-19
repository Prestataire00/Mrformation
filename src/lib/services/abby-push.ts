import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AbbyPushState,
  AbbyPushStepOutcome,
  AbbyRecipientType,
} from "@/lib/types/abby";
import { ABBY_INVOICE_SELECT, ABBY_PUSH_LOCK_TTL_MS } from "@/lib/abby/invoice-badge";
import { isPushButtonVisible } from "@/lib/abby/eligibility";
import { toAbbyErrorCode, type AbbyErrorCode } from "@/lib/abby/errors";
import {
  toAbbyInvoiceLines,
  toAbbyTimeline,
  toAbbyGeneralInformations,
} from "@/lib/abby/mappers";
import {
  createDraftInvoice,
  setInvoiceLines,
  setInvoiceTimeline,
  setInvoiceGeneralInformations,
  finalizeBilling,
  getAbbyInvoice,
  getCompanyIdentity,
  type createAbbyClient,
} from "@/lib/abby/client";
import { sanitizeDbError } from "@/lib/api-error";
import { getConnectionState, withAbbyConnection } from "./abby-connections";
import { ensureCustomerForRecipient } from "./abby-customers";

// Saga de push (AD-7/8/9) : UNE étape par appel depuis l'état persisté.
// Chaque étape = re-stamp CAS du verrou → appel(s) Abby → checkpoint.
// JAMAIS d'appel Abby dans une transaction base (AD-9) ; le curseur est
// séparé de l'erreur (AD-6) ; la saga n'écrit QUE des colonnes abby_* —
// jamais status/paid_at LMS (AD-11).

type AbbyClient = ReturnType<typeof createAbbyClient>;

export interface AbbyPushError {
  message: string;
  code?: string;
  missingFields?: string[];
}

export type AbbyPushResult =
  | { ok: true; step: AbbyPushStepOutcome }
  | { ok: false; error: AbbyPushError };

/** Colonnes propres nécessaires à la saga (⚠️ abby_invoice_id INDISPENSABLE
 * aux étapes 2-5 — absent du fragment badge ET de la liste préview 3.2). */
const PUSH_INVOICE_COLUMNS =
  "id, reference, external_reference, recipient_type, recipient_id, recipient_name, amount, status, is_avoir, invoice_date, due_date, abby_invoice_id";

interface PushInvoiceRow {
  id: string;
  reference: string | null;
  external_reference: string | null;
  recipient_type: AbbyRecipientType;
  recipient_id: string;
  recipient_name: string;
  amount: number;
  status: string;
  is_avoir: boolean;
  invoice_date: string;
  due_date: string | null;
  abby_invoice_id: string | null;
  abby_push_state: AbbyPushState | null;
  abby_push_locked_at: string | null;
  abby_invoice_number: string | null;
  abby_state: string | null;
  abby_last_error: string | null;
  session: { title: string; entity_id: string };
}

interface EntityRow {
  name: string;
  siret: string | null;
  tva_exempt: boolean;
  tva_rate: number;
}

const LOCK_HELD_MESSAGE = "Un push est déjà en cours sur cette facture.";

/** Backoff 429 confiné à UNE étape : 2 retries max (0,5 s puis 1 s), deadline
 * 5 s — calibré sous le timeout Netlify 10 s (1 s + 2 s le dépassait). */
const RETRY_DELAYS_MS = [500, 1000];
const RETRY_DEADLINE_MS = 5000;

async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  stepStart: number = Date.now()
): Promise<T> {
  // `stepStart` est PARTAGÉ entre les appels d'une même étape (étapes 4-5 en
  // ont deux) : la deadline borne l'ÉTAPE, pas chaque appel — sinon le pire
  // cas dépasse le timeout Netlify 10 s (review #351)
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = toAbbyErrorCode(err);
      if (
        code !== "abby_rate_limited" ||
        attempt >= RETRY_DELAYS_MS.length ||
        Date.now() - stepStart > RETRY_DEADLINE_MS
      ) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

/** Messages UI par code (microcopy EXPERIENCE.md — le doublon porte le numéro). */
function stepErrorMessage(code: AbbyErrorCode, existingNumber: string | null): string {
  if (code === "abby_duplicate") {
    return existingNumber
      ? `Cette facture existe déjà dans Abby (${existingNumber}). Aucun doublon n'a été créé.`
      : "Cette facture existe déjà dans Abby. Aucun doublon n'a été créé.";
  }
  const messages: Partial<Record<AbbyErrorCode, string>> = {
    abby_network: "Abby est injoignable. Le push est interrompu — reprenez-le plus tard.",
    abby_rate_limited: "Abby limite temporairement les appels. Réessayez dans quelques instants.",
    abby_auth_failed: "La clé API Abby n'est plus valide. Retestez la connexion dans les paramètres.",
    abby_validation: "Abby a refusé les données envoyées.",
  };
  return messages[code] ?? "Une erreur est survenue pendant le push.";
}

/** Écrit abby_last_error SANS toucher le curseur (AD-6). */
async function recordStepError(
  supabase: SupabaseClient,
  entityId: string,
  invoiceId: string,
  message: string
): Promise<void> {
  await supabase
    .from("formation_invoices")
    .update({ abby_last_error: message })
    .eq("id", invoiceId)
    .eq("entity_id", entityId);
}

/**
 * Re-stamp CAS du verrou (étapes 2-5) : verrou libre, périmé, OU égal à la
 * valeur LUE au chargement. Une condition d'état seule ne sérialise PAS deux
 * POST concurrents (l'état ne change qu'au checkpoint) — le CAS garantit que
 * le second appel, qui a lu un locked_at déjà écrasé, fait 0 ligne → 409.
 *
 * RÉSIDU DOCUMENTÉ (review #351) : un 2ᵉ acteur dont le CHARGEMENT survient
 * après le re-stamp du 1ᵉʳ lit le stamp frais et passe le CAS — fenêtre = la
 * durée d'un appel Abby. Sans colonne de jeton propriétaire (schéma AD-6),
 * ce résidu n'est pas fermable ; conséquence maximale = un brouillon Abby
 * orphelin (étape 2), JAMAIS une double finalisation légale (index UNIQUE +
 * checkpoints conditionnels). En pratique l'UI n'offre aucun chemin de
 * ré-entrée mid-saga en 3.3 (bouton masqué dès abby_push_state non NULL) ;
 * la Reprise 3.4 relit l'état réel Abby avant d'avancer.
 */
async function restampLock(
  supabase: SupabaseClient,
  entityId: string,
  invoiceId: string,
  expectedState: AbbyPushState,
  lockedAtRead: string | null
): Promise<{ ok: true } | { ok: false; error: AbbyPushError }> {
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - ABBY_PUSH_LOCK_TTL_MS).toISOString();
  // Timestamps normalisés en ISO UTC — PostgREST compare des timestamptz
  // (valeurs), pas des chaînes
  const readIso = lockedAtRead ? new Date(lockedAtRead).toISOString() : null;
  const orClauses = readIso
    ? `abby_push_locked_at.is.null,abby_push_locked_at.eq.${readIso},abby_push_locked_at.lt.${staleIso}`
    : `abby_push_locked_at.is.null,abby_push_locked_at.lt.${staleIso}`;

  const { data, error } = await supabase
    .from("formation_invoices")
    .update({ abby_push_locked_at: nowIso })
    .eq("id", invoiceId)
    .eq("entity_id", entityId)
    .eq("abby_push_state", expectedState)
    .or(orClauses)
    .select("id");
  if (error) {
    return { ok: false, error: { message: sanitizeDbError(error, "abby push restamp") } };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: { message: LOCK_HELD_MESSAGE, code: "abby_invalid_state" },
    };
  }
  return { ok: true };
}

/** Checkpoint conditionnel sur l'état attendu — n'écrase jamais un état plus
 * avancé ; chaque checkpoint réussi efface abby_last_error. `dbCode` remonte
 * le code PostgREST BRUT : seul le 23505 (violation UNIQUE) est un doublon —
 * requalifier toute erreur DB en doublon serait un mensonge (review #351). */
async function checkpoint(
  supabase: SupabaseClient,
  entityId: string,
  invoiceId: string,
  expectedState: AbbyPushState,
  patch: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: AbbyPushError; dbCode?: string }> {
  const { data, error } = await supabase
    .from("formation_invoices")
    .update({ ...patch, abby_last_error: null })
    .eq("id", invoiceId)
    .eq("entity_id", entityId)
    .eq("abby_push_state", expectedState)
    .select("id");
  if (error) {
    return {
      ok: false,
      error: { message: sanitizeDbError(error, "abby push checkpoint") },
      dbCode: (error as { code?: string }).code,
    };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: { message: LOCK_HELD_MESSAGE, code: "abby_invalid_state" },
    };
  }
  return { ok: true };
}

/** Rollback d'étape 1 — gardé par `abby_invoice_id IS NULL` : provablement
 * incapable d'effacer un id de facture (dérogation AD-8 encodée en SQL). */
async function rollbackAcquisition(
  supabase: SupabaseClient,
  entityId: string,
  invoiceId: string
): Promise<void> {
  await supabase
    .from("formation_invoices")
    .update({ abby_push_state: null, abby_push_locked_at: null })
    .eq("id", invoiceId)
    .eq("entity_id", entityId)
    .eq("abby_push_state", "pushing")
    .is("abby_invoice_id", null);
}

async function loadEntity(
  supabase: SupabaseClient,
  entityId: string
): Promise<{ ok: true; entity: EntityRow } | { ok: false; error: AbbyPushError }> {
  const { data, error } = await supabase
    .from("entities")
    .select("name, siret, tva_exempt, tva_rate")
    .eq("id", entityId)
    .single();
  if (error || !data) {
    return { ok: false, error: { message: sanitizeDbError(error, "abby push entity") } };
  }
  return { ok: true, entity: data as EntityRow };
}

/** Lignes de la facture — MÊME source et MÊME repli que la préview 3.2. */
async function loadInvoiceLines(
  supabase: SupabaseClient,
  invoice: PushInvoiceRow
): Promise<
  | { ok: true; lines: Array<{ description: string; quantity: number; unitPriceHT: number }> }
  | { ok: false; error: AbbyPushError }
> {
  const { data, error } = await supabase
    .from("formation_invoice_lines")
    .select("description, quantity, unit_price")
    .eq("invoice_id", invoice.id)
    .order("order_index", { ascending: true });
  if (error) {
    return { ok: false, error: { message: sanitizeDbError(error, "abby push lines") } };
  }
  const raw = (data ?? []) as Array<{ description: string; quantity: number; unit_price: number }>;
  if (raw.length > 0) {
    return {
      ok: true,
      lines: raw.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unitPriceHT: Number(l.unit_price),
      })),
    };
  }
  return {
    ok: true,
    lines: [
      {
        description: invoice.session.title,
        quantity: 1,
        unitPriceHT: Math.abs(Number(invoice.amount)),
      },
    ],
  };
}

/**
 * Avance la saga d'UNE étape depuis l'état persisté (AD-8).
 * Machine : NULL → pushing → draft_created → lines_set → details_set → finalized.
 */
export async function advancePushStep(
  supabase: SupabaseClient,
  entityId: string,
  invoiceId: string
): Promise<AbbyPushResult> {
  // Garde connexion ACTIVE (AD-13 — même garde que la préview 3.2 :
  // isPushButtonVisible est sans condition de connexion, withAbbyConnection
  // ne lit pas is_active)
  const stateRes = await getConnectionState(supabase, entityId);
  if (!stateRes.ok) return { ok: false, error: stateRes.error };
  if (stateRes.state.status !== "active") {
    return {
      ok: false,
      error: {
        message:
          "La connexion Abby de cette entité n'est pas active. Réactivez-la dans les paramètres avant de pousser.",
        code: "abby_invalid_state",
      },
    };
  }

  // Facture — select explicite (fragment + colonnes saga, dont abby_invoice_id)
  const { data: invoiceData, error: invoiceError } = await supabase
    .from("formation_invoices")
    .select(
      `${PUSH_INVOICE_COLUMNS}, ${ABBY_INVOICE_SELECT}, session:sessions!inner(title, entity_id)`
    )
    .eq("id", invoiceId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (invoiceError) {
    return { ok: false, error: { message: sanitizeDbError(invoiceError, "abby push invoice") } };
  }
  if (!invoiceData) {
    return { ok: false, error: { message: "Facture introuvable.", code: "abby_not_found" } };
  }
  // Embed sessions!inner = objet au runtime (validé en prod 3.2), cast documenté
  const invoice = invoiceData as unknown as PushInvoiceRow;

  if (invoice.is_avoir) {
    return {
      ok: false,
      error: {
        message: "Le push d'un avoir n'est pas encore disponible.",
        code: "abby_invalid_state",
      },
    };
  }

  switch (invoice.abby_push_state) {
    case null:
      return stepAcquireAndEnsureCustomer(supabase, entityId, invoice);
    case "pushing":
      return stepCreateDraft(supabase, entityId, invoice);
    case "draft_created":
      return stepSendLines(supabase, entityId, invoice);
    case "lines_set":
      return stepSendDetails(supabase, entityId, invoice);
    case "details_set":
      return stepFinalize(supabase, entityId, invoice);
    case "finalized":
      // Terminal idempotent : un appel de trop ne refait rien
      return {
        ok: true,
        step: {
          state: "finalized",
          done: true,
          abbyInvoiceNumber: invoice.abby_invoice_number ?? undefined,
        },
      };
    default:
      return {
        ok: false,
        error: { message: "État de push inconnu.", code: "abby_invalid_state" },
      };
  }
}

/** Étape 1 (NULL → pushing) : acquisition exclusive + garde SIRET (getMe
 * EXACTEMENT une fois par saga, AD-5) + ensureCustomerForRecipient (premier
 * call-site du bloc 2.2 — le verrou sérialise le TOCTOU documenté). */
async function stepAcquireAndEnsureCustomer(
  supabase: SupabaseClient,
  entityId: string,
  invoice: PushInvoiceRow
): Promise<AbbyPushResult> {
  if (
    !isPushButtonVisible({
      abby_push_state: invoice.abby_push_state,
      status: invoice.status,
      is_avoir: invoice.is_avoir,
    })
  ) {
    return {
      ok: false,
      error: {
        message: "Cette facture n'est pas éligible au push vers Abby.",
        code: "abby_invalid_state",
      },
    };
  }

  // Acquisition atomique — strictement exclusive sur l'état NULL (FR-11)
  const { data: acquired, error: acquireError } = await supabase
    .from("formation_invoices")
    .update({ abby_push_state: "pushing", abby_push_locked_at: new Date().toISOString() })
    .eq("id", invoice.id)
    .eq("entity_id", entityId)
    .is("abby_push_state", null)
    .select("id");
  if (acquireError) {
    return { ok: false, error: { message: sanitizeDbError(acquireError, "abby push acquire") } };
  }
  if (!acquired || acquired.length === 0) {
    return { ok: false, error: { message: LOCK_HELD_MESSAGE, code: "abby_invalid_state" } };
  }

  const entityRes = await loadEntity(supabase, entityId);
  if (!entityRes.ok) {
    await rollbackAcquisition(supabase, entityId, invoice.id);
    return entityRes;
  }
  const expectedSiret = entityRes.entity.siret;
  if (!expectedSiret) {
    // JAMAIS un « mismatch » avec attendu=null (pattern 1.3) — erreur franche
    await rollbackAcquisition(supabase, entityId, invoice.id);
    return {
      ok: false,
      error: {
        message:
          "Le SIRET de l'entité n'est pas renseigné — impossible de vérifier le compte Abby. Complétez-le dans les paramètres de l'organisme.",
      },
    };
  }

  // UNE enveloppe withAbbyConnection = 1 déchiffrement pour getMe + ensure
  const connRes = await withAbbyConnection(supabase, entityId, async (client: AbbyClient) => {
    const identity = await withRateLimitRetry(() => getCompanyIdentity(client));
    if (identity.companySiret !== expectedSiret) {
      return { kind: "siret_mismatch" as const, found: identity.companySiret };
    }
    const ensured = await ensureCustomerForRecipient(supabase, client, entityId, {
      type: invoice.recipient_type,
      id: invoice.recipient_id,
    });
    return { kind: "ensured" as const, ensured };
  });

  if (!connRes.ok) {
    await rollbackAcquisition(supabase, entityId, invoice.id);
    return { ok: false, error: connRes.error };
  }
  const outcome = connRes.data;
  if (outcome.kind === "siret_mismatch") {
    await rollbackAcquisition(supabase, entityId, invoice.id);
    return {
      ok: false,
      error: {
        message: `Le compte Abby connecté (SIRET ${outcome.found}) ne correspond pas à l'entité (SIRET ${expectedSiret}). Push bloqué.`,
        code: "abby_siret_mismatch",
      },
    };
  }
  if (!outcome.ensured.ok) {
    await rollbackAcquisition(supabase, entityId, invoice.id);
    return { ok: false, error: outcome.ensured.error };
  }

  return { ok: true, step: { state: "pushing", done: false } };
}

/** Étape 2 (pushing → draft_created) : SEULE étape non idempotente —
 * protégée par le CAS + l'exclusivité de l'étape 1 + UNIQUE abby_invoice_id. */
async function stepCreateDraft(
  supabase: SupabaseClient,
  entityId: string,
  invoice: PushInvoiceRow
): Promise<AbbyPushResult> {
  const restamp = await restampLock(
    supabase, entityId, invoice.id, "pushing", invoice.abby_push_locked_at
  );
  if (!restamp.ok) return restamp;

  const { data: link, error: linkError } = await supabase
    .from("abby_customer_links")
    .select("abby_customer_id, abby_customer_type")
    .eq("entity_id", entityId)
    .eq("recipient_type", invoice.recipient_type)
    .eq("recipient_id", invoice.recipient_id)
    .maybeSingle();
  if (linkError) {
    return { ok: false, error: { message: sanitizeDbError(linkError, "abby push link") } };
  }
  if (!link) {
    // Incohérence : l'étape 1 aurait dû créer la liaison
    const message = "Liaison client Abby introuvable — reprenez le push depuis le début.";
    await recordStepError(supabase, entityId, invoice.id, message);
    return { ok: false, error: { message, code: "abby_invalid_state" } };
  }
  const customerId = (link as { abby_customer_id: string }).abby_customer_id;

  const draftRes = await withAbbyConnection(supabase, entityId, (client: AbbyClient) =>
    withRateLimitRetry(() => createDraftInvoice(client, customerId))
  );
  if (!draftRes.ok) {
    await recordStepError(
      supabase, entityId, invoice.id,
      stepErrorMessage((draftRes.error.code ?? "abby_network") as AbbyErrorCode, invoice.abby_invoice_number)
    );
    return { ok: false, error: draftRes.error };
  }

  const cp = await checkpoint(supabase, entityId, invoice.id, "pushing", {
    abby_invoice_id: draftRes.data.id,
    abby_push_state: "draft_created",
    abby_pushed_at: new Date().toISOString(),
  });
  if (!cp.ok) {
    // SEUL le 23505 (violation UNIQUE sur abby_invoice_id) est un doublon
    // structurel — toute autre erreur DB reste une erreur générique (le
    // wording « existe déjà » serait faux et masquerait un brouillon perdu)
    if (cp.dbCode === "23505") {
      return {
        ok: false,
        error: {
          message: stepErrorMessage("abby_duplicate", invoice.abby_invoice_number),
          code: "abby_duplicate",
        },
      };
    }
    return cp;
  }
  return { ok: true, step: { state: "draft_created", done: false } };
}

/** Étape 3 (draft_created → lines_set) : set INTÉGRAL remplaçant (AD-9). */
async function stepSendLines(
  supabase: SupabaseClient,
  entityId: string,
  invoice: PushInvoiceRow
): Promise<AbbyPushResult> {
  const restamp = await restampLock(
    supabase, entityId, invoice.id, "draft_created", invoice.abby_push_locked_at
  );
  if (!restamp.ok) return restamp;

  if (!invoice.abby_invoice_id) {
    const message = "Identifiant Abby manquant — reprenez le push.";
    await recordStepError(supabase, entityId, invoice.id, message);
    return { ok: false, error: { message, code: "abby_invalid_state" } };
  }
  const abbyInvoiceId = invoice.abby_invoice_id;

  const entityRes = await loadEntity(supabase, entityId);
  if (!entityRes.ok) return entityRes;
  const vat = {
    vatExempt: entityRes.entity.tva_exempt === true,
    tvaRate: Number(entityRes.entity.tva_rate) || 20,
  };

  const linesRes = await loadInvoiceLines(supabase, invoice);
  if (!linesRes.ok) return linesRes;

  let abbyLines;
  try {
    abbyLines = toAbbyInvoiceLines(linesRes.lines, vat, { isAvoir: invoice.is_avoir });
  } catch (err) {
    // Taux hors enum OU ligne négative sur facture — erreurs explicites du
    // mapper (AD-17 + parité préview, review #351)
    const message = err instanceof Error ? err.message : "Taux de TVA non supporté.";
    await recordStepError(supabase, entityId, invoice.id, message);
    return { ok: false, error: { message, code: "abby_validation" } };
  }

  const res = await withAbbyConnection(supabase, entityId, (client: AbbyClient) =>
    withRateLimitRetry(() => setInvoiceLines(client, abbyInvoiceId, abbyLines))
  );
  if (!res.ok) {
    await recordStepError(
      supabase, entityId, invoice.id,
      stepErrorMessage((res.error.code ?? "abby_network") as AbbyErrorCode, invoice.abby_invoice_number)
    );
    return { ok: false, error: res.error };
  }

  const cp = await checkpoint(supabase, entityId, invoice.id, "draft_created", {
    abby_push_state: "lines_set",
  });
  if (!cp.ok) return cp;
  return { ok: true, step: { state: "lines_set", done: false } };
}

/** Étape 4 (lines_set → details_set) : timeline PUIS general-informations,
 * UN SEUL checkpoint (AD-9 — écrasements idempotents à la reprise). */
async function stepSendDetails(
  supabase: SupabaseClient,
  entityId: string,
  invoice: PushInvoiceRow
): Promise<AbbyPushResult> {
  const restamp = await restampLock(
    supabase, entityId, invoice.id, "lines_set", invoice.abby_push_locked_at
  );
  if (!restamp.ok) return restamp;

  if (!invoice.abby_invoice_id) {
    const message = "Identifiant Abby manquant — reprenez le push.";
    await recordStepError(supabase, entityId, invoice.id, message);
    return { ok: false, error: { message, code: "abby_invalid_state" } };
  }
  const abbyInvoiceId = invoice.abby_invoice_id;

  const entityRes = await loadEntity(supabase, entityId);
  if (!entityRes.ok) return entityRes;
  const vatExempt = entityRes.entity.tva_exempt === true;

  const stepStart = Date.now();
  const res = await withAbbyConnection(supabase, entityId, async (client: AbbyClient) => {
    await withRateLimitRetry(
      () => setInvoiceTimeline(client, abbyInvoiceId, toAbbyTimeline(invoice.invoice_date)),
      stepStart
    );
    await withRateLimitRetry(
      () => setInvoiceGeneralInformations(client, abbyInvoiceId, toAbbyGeneralInformations(vatExempt)),
      stepStart
    );
  });
  if (!res.ok) {
    await recordStepError(
      supabase, entityId, invoice.id,
      stepErrorMessage((res.error.code ?? "abby_network") as AbbyErrorCode, invoice.abby_invoice_number)
    );
    return { ok: false, error: res.error };
  }

  const cp = await checkpoint(supabase, entityId, invoice.id, "lines_set", {
    abby_push_state: "details_set",
  });
  if (!cp.ok) return cp;
  return { ok: true, step: { state: "details_set", done: false } };
}

/** Étape 5 (details_set → finalized) : l'acte d'émission légale. */
async function stepFinalize(
  supabase: SupabaseClient,
  entityId: string,
  invoice: PushInvoiceRow
): Promise<AbbyPushResult> {
  const restamp = await restampLock(
    supabase, entityId, invoice.id, "details_set", invoice.abby_push_locked_at
  );
  if (!restamp.ok) return restamp;

  if (!invoice.abby_invoice_id) {
    const message = "Identifiant Abby manquant — reprenez le push.";
    await recordStepError(supabase, entityId, invoice.id, message);
    return { ok: false, error: { message, code: "abby_invalid_state" } };
  }
  const abbyInvoiceId = invoice.abby_invoice_id;

  const stepStart = Date.now();
  const res = await withAbbyConnection(supabase, entityId, async (client: AbbyClient) => {
    await withRateLimitRetry(() => finalizeBilling(client, abbyInvoiceId), stepStart);
    return withRateLimitRetry(() => getAbbyInvoice(client, abbyInvoiceId), stepStart);
  });
  if (!res.ok) {
    await recordStepError(
      supabase, entityId, invoice.id,
      stepErrorMessage((res.error.code ?? "abby_network") as AbbyErrorCode, invoice.abby_invoice_number)
    );
    return { ok: false, error: res.error };
  }
  const finalized = res.data;

  const cp = await checkpoint(supabase, entityId, invoice.id, "details_set", {
    abby_invoice_number: finalized.number,
    abby_state: finalized.state,
    abby_finalized_at: new Date().toISOString(),
    abby_push_state: "finalized",
    abby_push_locked_at: null,
  });
  if (!cp.ok) return cp;

  return {
    ok: true,
    step: {
      state: "finalized",
      done: true,
      abbyInvoiceNumber: finalized.number ?? undefined,
    },
  };
}
