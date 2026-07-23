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

/** Champs minimaux pour proposer l'enregistrement du paiement (story 4.2). */
export interface AbbyRecordPaymentInput {
  abby_push_state: string | null;
  abby_state: string | null;
  status: string;
  is_avoir: boolean;
}

/**
 * « Enregistrer le paiement dans le LMS » (FR-18, AD-11) : proposé UNIQUEMENT
 * sur une facture poussée-finalisée qu'Abby déclare payée et que le LMS ne
 * considère pas encore payée. Exclut les avoirs (l'Epic 5 en finalisera) et
 * les annulées — alignement sur isPushButtonVisible/isPushResumable.
 * Consommé par l'UI ET re-vérifié serveur (AD-13).
 */
export function canRecordPaymentInLms(invoice: AbbyRecordPaymentInput): boolean {
  return (
    isPushFinalized({ abby_push_state: invoice.abby_push_state }) &&
    invoice.abby_state === "paid" &&
    invoice.status !== "paid" &&
    invoice.status !== "cancelled" &&
    !invoice.is_avoir
  );
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

/**
 * Éligibilité au LOT (story 5.1, AD-13) : une facture est cochable pour le lot
 * SI ET SEULEMENT SI son bouton unitaire « Pousser vers Abby » est visible ET
 * actif. Alias NOMMÉ de `canPushInvoice` — jamais de logique dupliquée, pour que
 * l'éligibilité lot et unitaire ne divergent jamais.
 */
export function isBatchSelectable(
  invoice: AbbyPushEligibilityInput,
  connectionStatus: AbbyConnectionStatus
): boolean {
  return canPushInvoice(invoice, connectionStatus);
}

/**
 * Motif (tooltip focusable) d'une ligne NON cochable au lot, ou `null` si elle
 * l'est. Ordre des branches (la 1ʳᵉ qui matche gagne) : avoir → annulée →
 * poussée-finalisée → push interrompu (état intermédiaire) → connexion inactive.
 * ⚠️ « Déjà transmise » NE couvre PAS un push interrompu : la même ligne affiche
 * un badge « Interrompue » + un bouton « Reprendre le push » (InvoiceRow), dire
 * « déjà transmise » y serait faux. On compose sur `isPushFinalized`.
 */
export function getBatchIneligibilityReason(
  invoice: AbbyPushEligibilityInput,
  connectionStatus: AbbyConnectionStatus
): string | null {
  if (invoice.is_avoir) return "Un avoir se pousse depuis sa facture d'origine.";
  if (invoice.status === "cancelled") return "Facture annulée — non transmissible.";
  if (isPushFinalized(invoice)) return "Déjà transmise à Abby.";
  if (invoice.abby_push_state !== null)
    return "Push interrompu — reprenez-le depuis cette ligne.";
  // Ici : jamais poussée, non avoir, non annulée → cochable SSI connexion active.
  if (connectionStatus !== "active") return PUSH_DISABLED_TOOLTIP;
  return null;
}

// ─── Éligibilité AVOIR (story 5.3, AD-23) ────────────────────────────────────
// Un avoir se pousse via le cycle asset, lié à sa facture Abby PARENTE. Son
// éligibilité dépend donc de l'état de la parente (poussée-finalisée requise),
// pas de la sienne seule. Prédicats séparés de la facture (l'avoir reste exclu
// de isPushButtonVisible/isBatchSelectable/isPushResumable — non-régression).

/** L'avoir à évaluer. */
export interface AbbyAvoirInput {
  is_avoir: boolean;
  abby_push_state: string | null;
  status: string;
}

/** La facture parente (embed) pour la garde SERVEUR. */
export interface AbbyAvoirParent {
  abby_push_state: string | null;
  abby_invoice_id: string | null;
}

/**
 * Éligibilité au PUSH d'un avoir (SERVEUR — buildInvoicePreview + saga, qui ont
 * `abby_invoice_id`) : avoir jamais poussé, non annulé, parente poussée-finalisée
 * ET dotée d'un `abby_invoice_id` (input de `createAsset`). AD-13 re-vérif serveur.
 */
export function canPushAvoir(
  avoir: AbbyAvoirInput,
  parent: AbbyAvoirParent | null
): boolean {
  return (
    avoir.is_avoir &&
    avoir.abby_push_state === null &&
    avoir.status !== "cancelled" &&
    parent !== null &&
    parent.abby_push_state === "finalized" &&
    parent.abby_invoice_id !== null
  );
}

/** Champs minimaux pour la reprise d'un avoir interrompu. */
export interface AbbyAvoirResumeInput {
  is_avoir: boolean;
  abby_push_state: string | null;
  abby_push_locked_at: string | null;
  status: string;
}

/**
 * Avoir au push INTERROMPU reprenable — miroir de `isPushResumable` pour l'avoir :
 * état intermédiaire + verrou périmé/NULL + non annulé + parente finalisée.
 * `parentPushState` (string|null) suffit (dispo côté UI ET serveur). SANS ce
 * prédicat, un avoir interrompu n'aurait AUCUN chemin de reprise UI.
 */
export function canResumeAvoir(
  avoir: AbbyAvoirResumeInput,
  parentPushState: string | null,
  now: Date
): boolean {
  if (!avoir.is_avoir || avoir.status === "cancelled") return false;
  if (parentPushState !== "finalized") return false;
  if (
    avoir.abby_push_state === null ||
    !INTERMEDIATE_STATES.has(avoir.abby_push_state)
  ) {
    return false;
  }
  if (avoir.abby_push_locked_at === null) return true;
  const lockedAt = Date.parse(avoir.abby_push_locked_at);
  return Number.isNaN(lockedAt) || now.getTime() - lockedAt >= ABBY_PUSH_LOCK_TTL_MS;
}

/**
 * Motif du tooltip d'un bouton avoir DÉSACTIVÉ, ou `null` si une action (push ou
 * reprise) est possible. Signature basée sur `parentPushState` (le type UI
 * `Invoice` n'a pas `abby_invoice_id`). Ordre : annulé → déjà transmis → parente
 * non finalisée → null.
 */
export function getAvoirActionReason(
  avoir: { abby_push_state: string | null; status: string },
  parentPushState: string | null
): string | null {
  if (avoir.status === "cancelled") return "Avoir annulé — non transmissible.";
  if (isPushFinalized({ abby_push_state: avoir.abby_push_state }))
    return "Déjà transmis à Abby.";
  if (parentPushState !== "finalized")
    return "La facture d'origine doit d'abord être transmise à Abby.";
  return null;
}
