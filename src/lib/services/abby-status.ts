import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ABBY_INVOICE_SELECT,
  ABBY_INVOICE_NOT_FOUND_MESSAGE,
} from "@/lib/abby/invoice-badge";
import { isPushFinalized } from "@/lib/abby/eligibility";
import { epochToIso } from "@/lib/abby/mappers";
import { getAbbyInvoice, type createAbbyClient } from "@/lib/abby/client";
import { sanitizeDbError } from "@/lib/api-error";
import { getConnectionState, withAbbyConnection } from "./abby-connections";

// Actualisation du statut Abby (AD-11) — INVARIANT CENTRAL : cette route
// n'écrit JAMAIS `formation_invoices.status` ni `paid_at`. Elle ne touche que
// les colonnes abby_* (caches d'affichage, jamais sources BPF/exports).
// C'est la prévention explicite de l'incident « faux paid sans paid_at »
// (import LORIS). Le passage au statut LMS payé est la story 4.2, sur
// relecture live et geste explicite.

type AbbyClient = ReturnType<typeof createAbbyClient>;

export interface AbbyStatusError {
  message: string;
  code?: string;
}

export type AbbyStatusResult =
  | {
      ok: true;
      status: {
        state: string | null;
        syncedAt: string;
        paidAt: string | null;
        finalizedAt: string | null;
        /** La facture n'existe plus chez Abby — constat daté, pas un échec. */
        notFound: boolean;
      };
    }
  | { ok: false; error: AbbyStatusError };

/** Colonnes propres nécessaires (⚠️ abby_invoice_id hors fragment — piège 3.3). */
const STATUS_INVOICE_COLUMNS = "id, abby_invoice_id";

interface StatusInvoiceRow {
  id: string;
  abby_invoice_id: string | null;
  abby_push_state: string | null;
  abby_push_locked_at: string | null;
  abby_invoice_number: string | null;
  abby_state: string | null;
  abby_last_error: string | null;
}

/**
 * Relit l'état d'une facture chez Abby et met à jour le CACHE local.
 * Bornée au prédicat poussée-finalisée (AD-13) : sur un push non finalisé,
 * refus SANS aucune écriture ni appel SDK (l'introuvable d'un push
 * intermédiaire appartient à la Reprise 3.4).
 */
export async function refreshInvoiceStatus(
  supabase: SupabaseClient,
  entityId: string,
  invoiceId: string
): Promise<AbbyStatusResult> {
  const stateRes = await getConnectionState(supabase, entityId);
  if (!stateRes.ok) return { ok: false, error: stateRes.error };
  if (stateRes.state.status !== "active") {
    return {
      ok: false,
      error: {
        message:
          "La connexion Abby de cette entité n'est pas active. Réactivez-la dans les paramètres.",
        code: "abby_invalid_state",
      },
    };
  }

  const { data, error } = await supabase
    .from("formation_invoices")
    .select(`${STATUS_INVOICE_COLUMNS}, ${ABBY_INVOICE_SELECT}`)
    .eq("id", invoiceId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) {
    return { ok: false, error: { message: sanitizeDbError(error, "abby status invoice") } };
  }
  if (!data) {
    return { ok: false, error: { message: "Facture introuvable.", code: "abby_not_found" } };
  }
  const invoice = data as unknown as StatusInvoiceRow;

  // Garde AD-13 : finalisée ET identifiant Abby connu — AUCUNE écriture ni
  // appel SDK avant ce point (un id NULL sur une finalized est une
  // incohérence, pas un cas à « réparer » ici)
  if (!isPushFinalized({ abby_push_state: invoice.abby_push_state }) || !invoice.abby_invoice_id) {
    return {
      ok: false,
      error: {
        message: "Le statut Abby n'est consultable que sur une facture finalisée.",
        code: "abby_invalid_state",
      },
    };
  }
  const abbyInvoiceId = invoice.abby_invoice_id;

  const res = await withAbbyConnection(supabase, entityId, (client: AbbyClient) =>
    getAbbyInvoice(client, abbyInvoiceId)
  );

  const syncedAt = new Date().toISOString();

  // Introuvable chez Abby : CONSTAT daté (succès métier) — la dernière donnée
  // connue (abby_state, abby_paid_at) est PRÉSERVÉE (AC-4)
  if (!res.ok) {
    const isNotFound = res.error.code === "abby_not_found";
    const message = isNotFound
      ? ABBY_INVOICE_NOT_FOUND_MESSAGE
      : res.error.message || "Actualisation du statut Abby impossible.";
    const written = await writeStatusPatch(supabase, entityId, invoiceId, {
      abby_last_error: message,
      abby_synced_at: syncedAt,
    });
    if (!written.ok) return written;
    if (isNotFound) {
      return {
        ok: true,
        status: {
          state: invoice.abby_state,
          syncedAt,
          paidAt: null,
          finalizedAt: null,
          notFound: true,
        },
      };
    }
    return { ok: false, error: res.error };
  }

  const read = res.data;
  const paidAtIso = epochToIso(read.paidAt);
  const finalizedAtIso = epochToIso(read.finalizedAt);

  // ⚠️ AD-11 : ce patch ne contient NI `status` NI `paid_at` — jamais.
  const patch: Record<string, unknown> = {
    abby_state: read.state,
    abby_synced_at: syncedAt,
    abby_last_error: null,
  };
  if (paidAtIso) patch.abby_paid_at = paidAtIso;
  if (finalizedAtIso) patch.abby_finalized_at = finalizedAtIso;

  const written = await writeStatusPatch(supabase, entityId, invoiceId, patch);
  if (!written.ok) return written;

  return {
    ok: true,
    status: {
      state: read.state,
      syncedAt,
      paidAt: paidAtIso,
      finalizedAt: finalizedAtIso,
      notFound: false,
    },
  };
}

/**
 * UPDATE conditionnel `WHERE abby_push_state='finalized'` — AD-13 interdit
 * d'écrire abby_state/abby_last_error sur un push non finalisé, QUEL QUE SOIT
 * le chemin (une régression d'état entre la garde et l'UPDATE écrirait un
 * abby_last_error interdit).
 */
async function writeStatusPatch(
  supabase: SupabaseClient,
  entityId: string,
  invoiceId: string,
  patch: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: AbbyStatusError }> {
  const { data, error } = await supabase
    .from("formation_invoices")
    .update(patch)
    .eq("id", invoiceId)
    .eq("entity_id", entityId)
    .eq("abby_push_state", "finalized")
    .select("id");
  if (error) {
    return { ok: false, error: { message: sanitizeDbError(error, "abby status update") } };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: {
        message: "Le statut de cette facture a changé — rechargez la page.",
        code: "abby_invalid_state",
      },
    };
  }
  return { ok: true };
}
