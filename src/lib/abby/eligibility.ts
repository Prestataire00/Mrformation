import type { AbbyConnectionStatus, AbbyPushState } from "@/lib/types/abby";
import { ABBY_PUSH_LOCK_TTL_MS } from "./invoice-badge";

// Prédicats NOMMÉS d'éligibilité/visibilité Abby (AD-13) : calculés en un
// seul endroit, consommés par l'UI ET re-vérifiés par chaque route concernée.
// Fonctions 100 % pures — ce module ne touche ni Supabase ni le SDK.

/** Champs minimaux d'une facture pour l'éligibilité au push. */
export interface AbbyPushEligibilityInput {
  abby_push_state: string | null;
  status: string;
  is_avoir: boolean;
}

/** « Jamais poussée » = curseur de saga vierge (AD-13). */
export function isNeverPushed(
  invoice: Pick<AbbyPushEligibilityInput, "abby_push_state">
): boolean {
  return invoice.abby_push_state === null;
}

/** « Poussée-finalisée » = prérequis des actions post-push (statut/PDF/paiement). */
export function isPushFinalized(
  invoice: Pick<AbbyPushEligibilityInput, "abby_push_state">
): boolean {
  return invoice.abby_push_state === "finalized";
}

/**
 * Verrou de contenu (AD-12) : dès que le push a commencé, le contenu facturé
 * (lignes, montants, destinataire) et le passage à cancelled sont interdits.
 * Livré ici, consommé par les routes de mutation en story 3.5.
 */
export function isContentLocked(
  invoice: Pick<AbbyPushEligibilityInput, "abby_push_state">
): boolean {
  return invoice.abby_push_state !== null;
}

/**
 * La Zone Abby n'existe qu'après une PREMIÈRE activation de la connexion
 * (FR-8) : une entité jamais activée garde une UI strictement identique.
 */
export function isAbbyZoneVisible(status: AbbyConnectionStatus): boolean {
  return status === "active" || status === "en_erreur" || status === "desactivee";
}

/**
 * Existence du bouton « Pousser vers Abby » — SANS condition de connexion :
 * connexion désactivée/en erreur = bouton PRÉSENT mais désactivé (FR-4).
 * Le push d'avoir a son propre prédicat (story 5.3) — jamais de bouton
 * unitaire sur un avoir ici.
 */
export function isPushButtonVisible(invoice: AbbyPushEligibilityInput): boolean {
  return isNeverPushed(invoice) && invoice.status !== "cancelled" && !invoice.is_avoir;
}

/** Bouton ACTIF : existence + connexion active. Aucune borne temporelle (FR-8). */
export function canPushInvoice(
  invoice: AbbyPushEligibilityInput,
  connectionStatus: AbbyConnectionStatus
): boolean {
  return isPushButtonVisible(invoice) && connectionStatus === "active";
}

/** Champs minimaux pour l'éligibilité à la REPRISE (story 3.4). */
export interface AbbyPushResumeInput {
  abby_push_state: string | null;
  abby_push_locked_at: string | null;
  is_avoir: boolean;
  status: string;
}

const INTERMEDIATE_STATES = new Set([
  "pushing",
  "draft_created",
  "lines_set",
  "details_set",
]);

/**
 * Push interrompu reprenable : état intermédiaire + verrou périmé (> 2 min)
 * ou NULL. `status !== "cancelled"` est OBLIGATOIRE ici : le verrou serveur
 * du contenu n'arrive qu'en 3.5 — sans ce terme, une facture annulée au push
 * interrompu pourrait être finalisée légalement. `now` en paramètre (pure).
 */
export function isPushResumable(invoice: AbbyPushResumeInput, now: Date): boolean {
  if (invoice.is_avoir || invoice.status === "cancelled") return false;
  if (
    invoice.abby_push_state === null ||
    !INTERMEDIATE_STATES.has(invoice.abby_push_state)
  ) {
    return false;
  }
  if (invoice.abby_push_locked_at === null) return true;
  const lockedAt = Date.parse(invoice.abby_push_locked_at);
  return Number.isNaN(lockedAt) || now.getTime() - lockedAt >= ABBY_PUSH_LOCK_TTL_MS;
}

/**
 * État curseur → PROCHAINE étape à exécuter (bandeau de reprise + libellés
 * de boucle du dialog — source unique, remplace le mapping local 3.3).
 */
export function getResumeStep(state: AbbyPushState | string): number {
  switch (state) {
    case "pushing":
      return 2;
    case "draft_created":
      return 3;
    case "lines_set":
      return 4;
    case "details_set":
      return 5;
    default:
      return 1;
  }
}

/** Tooltip du bouton désactivé — verbatim EXPERIENCE.md § Component Patterns. */
export const PUSH_DISABLED_TOOLTIP =
  "Reconnectez le compte Abby de cette entité dans les paramètres";

/** Message du tooltip focusable si la connexion empêche le push, sinon null. */
export function getPushDisabledReason(
  status: AbbyConnectionStatus
): string | null {
  return status === "desactivee" || status === "en_erreur"
    ? PUSH_DISABLED_TOOLTIP
    : null;
}
