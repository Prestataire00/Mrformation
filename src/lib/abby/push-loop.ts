import { getResumeStep } from "./eligibility";
import type { AbbyPushStepOutcome, AbbyPreviewError } from "@/lib/types/abby";

// Orchestrateur de la boucle avance-saga (AD-8) d'UNE facture, PARTAGÉ par le
// push unitaire (AbbyPushPreviewDialog) et le push en lot (AbbyBatchPushDialog).
// Extrait tel quel de l'inline unitaire (story 3.3) — « chaque facture suit
// exactement les règles du push unitaire » = même code (AD-14), pas duplication.
//
// ⚠️ Cet orchestrateur N'ÉMET PAS l'étape INITIALE via `onStep` : `onStep` ne
// rapporte que l'étape SUIVANTE après chaque POST. C'est l'APPELANT qui pose
// l'étape de départ (unitaire : reprise/restart ; lot : toujours 1). Sans ça,
// l'affichage « Étape 1/5 » et le verrou du 1er POST disparaîtraient.
//
// Aucune dépendance UI ni toast : renvoie un résultat terminal ; l'appelant le
// mappe sur son UI. JAMAIS de Promise.all, JAMAIS de route batch (AD-14).

/** Messages repris À L'IDENTIQUE de l'inline unitaire (parité stricte). */
const DRAFT_MISSING_FALLBACK = "Le brouillon Abby de cette facture n'existe plus.";
const PUSH_FAILED_FALLBACK = "Le push a échoué.";
const UNEXPECTED_STATE_MESSAGE = "État de push inattendu — rechargez la page.";
const NETWORK_INTERRUPTED_MESSAGE =
  "Le push a été interrompu (réseau). Vous pourrez le reprendre.";

/**
 * Résultat terminal de la saga d'une facture.
 * `draft_missing` est distinct : le dialog unitaire propose « Repartir de zéro »
 * dessus ; le lot le traite comme un échec « à reprendre ».
 */
export type PushLoopOutcome =
  | { kind: "finalized"; number: string | null }
  | { kind: "draft_missing"; message: string }
  | { kind: "error"; message: string };

type PushHttpBody = { step: AbbyPushStepOutcome } | { error: AbbyPreviewError };

/**
 * Classe UNE réponse HTTP de la route push (PUR — pas de fetch, testable).
 * `{step}` = continuer (étape non finale) ; `{terminal}` = résultat définitif.
 * Ne décide PAS le cas « état inattendu » (getResumeStep === 1) : c'est la
 * boucle qui l'évalue sur l'étape retournée.
 */
export function classifyPushHttpResponse(
  ok: boolean,
  json: PushHttpBody,
): { step: AbbyPushStepOutcome } | { terminal: PushLoopOutcome } {
  if (!ok || !("step" in json)) {
    const err = "error" in json ? json.error : undefined;
    if (err?.code === "abby_draft_missing") {
      return { terminal: { kind: "draft_missing", message: err.message || DRAFT_MISSING_FALLBACK } };
    }
    return { terminal: { kind: "error", message: err?.message || PUSH_FAILED_FALLBACK } };
  }
  if (json.step.done) {
    return { terminal: { kind: "finalized", number: json.step.abbyInvoiceNumber ?? null } };
  }
  return { step: json.step };
}

/**
 * Exécute la saga d'UNE facture jusqu'à un résultat terminal. Un POST = une
 * étape (AD-8) ; boucle jusqu'à `done`/erreur. `restartFromZero` n'est envoyé
 * qu'au 1er POST (reprise = même boucle, le serveur infère l'état — 3.4).
 */
export async function runInvoicePushLoop(
  invoiceId: string,
  opts: { restartFromZero?: boolean; onStep?: (step: number) => void } = {},
): Promise<PushLoopOutcome> {
  const { restartFromZero = false, onStep } = opts;
  let isFirstCall = true;
  try {
    for (;;) {
      const res = await fetch(`/api/abby/invoices/${invoiceId}/push`, {
        method: "POST",
        ...(restartFromZero && isFirstCall
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ restartFromZero: true }),
            }
          : {}),
      });
      isFirstCall = false;
      const json = (await res.json()) as PushHttpBody;
      const classified = classifyPushHttpResponse(res.ok, json);
      if ("terminal" in classified) return classified.terminal;
      const nextStep = getResumeStep(classified.step.state);
      // État inattendu (jamais nominal) : sortir plutôt que boucler à l'infini.
      if (nextStep === 1) return { kind: "error", message: UNEXPECTED_STATE_MESSAGE };
      onStep?.(nextStep);
    }
  } catch {
    return { kind: "error", message: NETWORK_INTERRUPTED_MESSAGE };
  }
}

/** Consolidation PURE du récap final d'un lot exécuté (« X finalisées · Y à reprendre »). */
export function summarizeBatchExecution(
  outcomes: PushLoopOutcome[],
): { finalizedCount: number; failedCount: number; total: number } {
  let finalizedCount = 0;
  for (const o of outcomes) {
    if (o.kind === "finalized") finalizedCount += 1;
  }
  return {
    finalizedCount,
    failedCount: outcomes.length - finalizedCount,
    total: outcomes.length,
  };
}
