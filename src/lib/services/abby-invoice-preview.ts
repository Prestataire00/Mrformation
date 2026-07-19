import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AbbyInvoicePreview,
  AbbyPreviewResult,
  AbbyRecipientType,
} from "@/lib/types/abby";
import { ABBY_INVOICE_SELECT } from "@/lib/abby/invoice-badge";
import {
  isPushButtonVisible,
  isPushResumable,
  getResumeStep,
} from "@/lib/abby/eligibility";
import { validateRecipientForAbby } from "@/lib/abby/validation";
import { VAT_EXONERATION_FORMATION } from "@/lib/abby/vat";
import { invoiceDisplayRef } from "@/lib/utils/invoice-display-ref";
import { sanitizeDbError } from "@/lib/api-error";
import { getConnectionState, withAbbyConnection } from "./abby-connections";
import { resolveRecipient } from "./abby-customers";

// Prévisualisation du push (AD-21) : composition READ-ONLY côté Abby ET côté
// base — aucune liaison, aucun checkpoint, aucun cache persisté (seule trace
// tolérée : last_used_at/last_error, écrivain contractuel withAbbyConnection).
// La préview est INDICATIVE : la saga (3.3) refait sa propre résolution.

/** Colonnes propres de la facture nécessaires à la préview (hors fragment abby). */
const PREVIEW_INVOICE_COLUMNS =
  "id, reference, external_reference, recipient_type, recipient_id, recipient_name, amount, status, is_avoir";

interface PreviewInvoiceRow {
  id: string;
  reference: string | null;
  external_reference: string | null;
  recipient_type: AbbyRecipientType;
  recipient_id: string;
  recipient_name: string;
  amount: number;
  status: string;
  is_avoir: boolean;
  abby_push_state: string | null;
  abby_push_locked_at: string | null;
  abby_invoice_number: string | null;
  abby_state: string | null;
  abby_last_error: string | null;
  session: { title: string; entity_id: string };
}

/**
 * Totaux HT/TVA/TTC — MÊME arithmétique que `src/lib/invoice-pdf-export.ts`
 * (renderLinesTable) : totalHT = Σ quantité × PU HT ; TVA arrondie à 2
 * décimales (Math.round(×100)/100) ; TTC = HT + TVA ; exonérée → taux 0.
 * Exportée : le mapper de la saga (3.3) consommera la même fonction.
 */
export function computeInvoiceTotalsHT(
  lines: Array<{ quantity: number; unitPriceHT: number }>,
  entity: { vatExempt: boolean; tvaRate: number }
): { totalHT: number; tvaAmount: number; totalTTC: number } {
  const totalHT = lines.reduce((s, l) => s + l.quantity * l.unitPriceHT, 0);
  const rate = entity.vatExempt ? 0 : entity.tvaRate;
  const tvaAmount = Math.round(totalHT * (rate / 100) * 100) / 100;
  return { totalHT, tvaAmount, totalTTC: totalHT + tvaAmount };
}

/**
 * Construit la prévisualisation d'un push (FR-9). Enveloppe `withAbbyConnection`
 * EN INTERNE pour l'étape de résolution (précédent : activateConnection) — la
 * route n'appelle que ce service, pas de double ServiceResult à déballer.
 */
export async function buildInvoicePreview(
  supabase: SupabaseClient,
  entityId: string,
  invoiceId: string
): Promise<AbbyPreviewResult> {
  // 1. Connexion ACTIVE exigée (AD-13 re-vérifié serveur). isPushButtonVisible
  // est VOLONTAIREMENT sans condition de connexion (3.1) et withAbbyConnection
  // ne lit pas is_active — sans ce check, une connexion désactivée/en erreur
  // obtiendrait une préview.
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

  // 2. Facture — select EXPLICITE : fragment partagé + colonnes propres
  // (les select strings sont invisibles pour tsc, cf. test AD-18)
  const { data: invoiceData, error: invoiceError } = await supabase
    .from("formation_invoices")
    .select(
      `${PREVIEW_INVOICE_COLUMNS}, ${ABBY_INVOICE_SELECT}, session:sessions!inner(title, entity_id)`
    )
    .eq("id", invoiceId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (invoiceError) {
    return {
      ok: false,
      error: { message: sanitizeDbError(invoiceError, "abby preview invoice") },
    };
  }
  if (!invoiceData) {
    return {
      ok: false,
      error: { message: "Facture introuvable.", code: "abby_not_found" },
    };
  }
  // supabase-js infère l'embed sessions!inner en tableau — c'est un objet au
  // runtime (relation N→1), cast documenté (pattern abby-customers financier)
  const invoice = invoiceData as unknown as PreviewInvoiceRow;

  // 3. Éligibilité (AD-13) : jamais poussée OU push interrompu reprenable
  // (3.4 — verrou périmé/NULL) ; annulée, avoir, boucle active → refus
  const resumable = isPushResumable(
    {
      abby_push_state: invoice.abby_push_state,
      abby_push_locked_at: invoice.abby_push_locked_at,
      is_avoir: invoice.is_avoir,
      status: invoice.status,
    },
    new Date()
  );
  if (
    !isPushButtonVisible({
      abby_push_state: invoice.abby_push_state,
      status: invoice.status,
      is_avoir: invoice.is_avoir,
    }) &&
    !resumable
  ) {
    return {
      ok: false,
      error: {
        message: "Cette facture n'est pas éligible au push vers Abby.",
        code: "abby_invalid_state",
      },
    };
  }

  // 4. Lignes — repli parité PDF : sans lignes, une ligne générée depuis le
  // titre de session, PU = |amount| (les avoirs n'atteignent jamais ce point)
  const { data: lineRows, error: linesError } = await supabase
    .from("formation_invoice_lines")
    .select("description, quantity, unit_price")
    .eq("invoice_id", invoiceId)
    .order("order_index", { ascending: true });
  if (linesError) {
    return {
      ok: false,
      error: { message: sanitizeDbError(linesError, "abby preview lines") },
    };
  }
  const rawLines = (lineRows ?? []) as Array<{
    description: string;
    quantity: number;
    unit_price: number;
  }>;
  const previewLines =
    rawLines.length > 0
      ? rawLines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPriceHT: Number(l.unit_price),
          totalHT: Number(l.quantity) * Number(l.unit_price),
        }))
      : [
          {
            description: invoice.session.title,
            quantity: 1,
            unitPriceHT: Math.abs(Number(invoice.amount)),
            totalHT: Math.abs(Number(invoice.amount)),
          },
        ];

  // 4bis. Ligne négative sur une FACTURE (remise saisie librement) : bloquée
  // dès la préview — le mapper de la saga la refuse (parité AC-4 3.3, review
  // #351), autant que le gérant l'apprenne AVANT de confirmer
  if (!invoice.is_avoir) {
    const negative = previewLines.find((l) => l.quantity < 0 || l.unitPriceHT < 0);
    if (negative) {
      return {
        ok: false,
        error: {
          message:
            `Ligne « ${negative.description} » à montant négatif : non supporté sur une facture. ` +
            "Pour corriger une facture poussée, utilisez un avoir.",
          code: "abby_validation",
        },
      };
    }
  }

  // 5. Entité : régime TVA + nom (anti-inversion — le nom AFFICHÉ vient d'ici)
  const { data: entityData, error: entityError } = await supabase
    .from("entities")
    .select("name, tva_exempt, tva_rate")
    .eq("id", entityId)
    .single();
  if (entityError || !entityData) {
    return {
      ok: false,
      error: {
        message: sanitizeDbError(entityError, "abby preview entity"),
      },
    };
  }
  const entity = entityData as { name: string; tva_exempt: boolean; tva_rate: number };
  const vatExempt = entity.tva_exempt === true;
  const tvaRate = vatExempt ? 0 : Number(entity.tva_rate) || 20;

  const totals = computeInvoiceTotalsHT(previewLines, {
    vatExempt,
    tvaRate,
  });

  // 6. Sort du client — résolution 2.1 sous withAbbyConnection (read-only :
  // au plus une recherche Abby ; l'écriture de liaison = saga 3.3 uniquement)
  const resolutionRes = await withAbbyConnection(supabase, entityId, (client) =>
    resolveRecipient(supabase, client, entityId, {
      type: invoice.recipient_type,
      id: invoice.recipient_id,
    })
  );
  if (!resolutionRes.ok) return { ok: false, error: resolutionRes.error };
  const inner = resolutionRes.data;
  if (!inner.ok) return { ok: false, error: inner.error };
  const resolution = inner.resolution;

  // 7. Validation qualité — périmètre to_create UNIQUEMENT (contractualisé 2.2)
  if (resolution.outcome === "to_create") {
    const validation = validateRecipientForAbby(
      invoice.recipient_type,
      resolution.recipient
    );
    if (!validation.valid) {
      return {
        ok: false,
        error: {
          message: validation.message,
          code: "abby_validation",
          missingFields: validation.missingFields,
        },
      };
    }
  }

  const preview: AbbyInvoicePreview = {
    invoice: {
      id: invoice.id,
      displayRef: invoiceDisplayRef(invoice),
      isAvoir: invoice.is_avoir,
    },
    entity: { name: entity.name },
    recipient: {
      name: invoice.recipient_name,
      type: invoice.recipient_type,
      outcome: resolution.outcome,
    },
    lines: previewLines,
    totals: {
      totalHT: totals.totalHT,
      vatExempt,
      tvaRate,
      tvaAmount: totals.tvaAmount,
      totalTTC: totals.totalTTC,
      exonerationMention: vatExempt ? VAT_EXONERATION_FORMATION.footerNote : null,
    },
    resume: resumable
      ? { fromStep: getResumeStep(invoice.abby_push_state ?? "") }
      : null,
  };

  return { ok: true, preview };
}
