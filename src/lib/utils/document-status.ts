/**
 * Mapping unifié du `status` d'un document vers les flags booléens utilisés
 * par les consumers historiques (Qualiopi, exports, vues de listes).
 *
 * Source de vérité : la colonne `status` de la table `documents` unifiée
 * (CHECK contraint : 'draft' | 'generated' | 'sent' | 'signed' | 'cancelled').
 *
 * Avant ce module, cette logique était dupliquée dans :
 *  - src/lib/services/documents-store.ts (getDocsForSession)
 *  - src/app/api/ai/qualiopi-mock-audit/route.ts (mapping inline)
 * → risque de divergence silencieuse, corrigé en mutualisant ici.
 */

export type DocStatus = "draft" | "generated" | "sent" | "signed" | "cancelled";

export interface DocFlags {
  /** Le document est plus que brouillon (a été matérialisé au moins une fois). */
  is_confirmed: boolean;
  /** Le document a été envoyé au destinataire (sent ou signed). */
  is_sent: boolean;
  /** Le document est signé (état terminal côté apprenant/entreprise). */
  is_signed: boolean;
}

export function mapStatusToFlags(status: DocStatus | string | null | undefined): DocFlags {
  const s = (status ?? "draft") as DocStatus;
  return {
    is_confirmed: s === "generated" || s === "sent" || s === "signed",
    is_sent: s === "sent" || s === "signed",
    is_signed: s === "signed",
  };
}
