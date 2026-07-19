import Abby from "@abby-inc/node";

// ACL Abby (AD-2) : seul module autorisé à importer @abby-inc/node.
// Un client PAR clé (isolation HTTP par instance, documentée par le SDK) —
// jamais l'export singleton `client`.

// Timeout sous la limite Netlify Functions (10 s) — le défaut SDK est 30 s.
const ABBY_TIMEOUT_MS = 8000;

export function createAbbyClient(apiKey: string): Abby {
  return new Abby(apiKey, { timeout: ABBY_TIMEOUT_MS });
}

export interface AbbyCompanyIdentity {
  companyName: string | null;
  companySiret: string;
  isInTestMode: boolean;
}

/**
 * Interroge le compte du client fourni (`company.getMe()`) et retourne
 * l'identité normalisée. Variante utilisée avec `withAbbyConnection`
 * (qui fournit un client déjà construit depuis la clé stockée).
 *
 * ⚠️ Les types du SDK contredisent le runtime (sondes du 13/07) :
 * `commercialName` est déclaré string mais vaut null, `isInTestMode` est
 * déclaré boolean mais vaut 1 — d'où la normalisation défensive.
 */
export async function getCompanyIdentity(
  abby: Abby
): Promise<AbbyCompanyIdentity> {
  const { data } = await abby.company.getMe({});
  const company = (data as { company: Record<string, unknown> }).company;

  return {
    companyName: (company.commercialName as string | null) ?? null,
    companySiret: String(company.siret),
    isInTestMode: Boolean(company.isInTestMode),
  };
}

/** Vérifie une clé API brute (test de connexion) via `getCompanyIdentity`. */
export async function fetchCompanyIdentity(
  apiKey: string
): Promise<AbbyCompanyIdentity> {
  return getCompanyIdentity(createAbbyClient(apiKey));
}

/** Crée une organization Abby (ÉCRITURE — appelée par la saga uniquement). */
export async function createOrganizationCustomer(
  abby: Abby,
  dto: import("@abby-inc/node").CreateOrganizationDto
): Promise<{ id: string }> {
  const { data } = await abby.organization.createOrganization({ body: dto });
  return { id: String((data as { id: unknown }).id) };
}

/** Crée un contact Abby (ÉCRITURE — appelée par la saga uniquement). */
export async function createContactCustomer(
  abby: Abby,
  dto: import("@abby-inc/node").CreateContactDto
): Promise<{ id: string }> {
  const { data } = await abby.contact.createContact({ body: dto });
  return { id: String((data as { id: unknown }).id) };
}

// ─── Écritures facture (saga 3.3) — noms de méthodes SDK EMPIRIQUEMENT
// validés (scripts/abby-recette-mode-test.mjs, run réel du 16/07). Ne pas
// « corriger » depuis la doc SDK, qui ment. ───────────────────────────────

/** Ligne de facturation Abby (forme validée en recette — centimes, HT). */
export interface AbbyBillingLine {
  designation: string;
  /** CENTIMES entiers (conversion dans mappers.ts uniquement, AD-17). */
  unitPrice: number;
  quantity: number;
  quantityUnit: string;
  type: string;
  vatCode: string;
  isTaxIncluded: boolean;
}

/** Crée le brouillon de facture pour un client Abby (ÉCRITURE — saga seule). */
export async function createDraftInvoice(
  abby: Abby,
  customerId: string
): Promise<{ id: string }> {
  const { data } = await abby.invoice.createInvoiceByContactOrOrganizationId({
    path: { customerId },
  });
  return { id: String((data as { id: unknown }).id) };
}

/** Set INTÉGRAL remplaçant des lignes (AD-9 — condition de la reprise sûre). */
export async function setInvoiceLines(
  abby: Abby,
  invoiceId: string,
  lines: AbbyBillingLine[]
): Promise<void> {
  await abby.billing.updateLines({
    path: { billingId: invoiceId },
    body: { lines } as never,
  });
}

/** Dates de la facture — ⚠️ emittedAt en SECONDES (piège an 58509). */
export async function setInvoiceTimeline(
  abby: Abby,
  invoiceId: string,
  timeline: { emittedAt: number; paymentDelay: string }
): Promise<void> {
  await abby.invoice.updateTimeline({
    path: { invoiceId },
    body: timeline as never,
  });
}

/** Mentions (footerNote d'exonération — JAMAIS de vatMention, QO-1). */
export async function setInvoiceGeneralInformations(
  abby: Abby,
  invoiceId: string,
  body: { footerNote?: string }
): Promise<void> {
  await abby.invoice.updateInvoiceGeneralInformations({
    path: { invoiceId },
    body: body as never,
  });
}

/** Finalisation — l'acte d'émission légale (ÉCRITURE — saga seule). */
export async function finalizeBilling(
  abby: Abby,
  billingId: string
): Promise<void> {
  await abby.billing.finalize({ path: { billingId } });
}

/** Relit la facture Abby (number/state) — normalisation défensive. */
export async function getAbbyInvoice(
  abby: Abby,
  invoiceId: string
): Promise<{ id: string; number: string | null; state: string | null }> {
  const { data } = await abby.invoice.getInvoice({ path: { invoiceId } });
  const d = data as Record<string, unknown>;
  // Chaîne vide → null : le numéro est LE signal « finalisée » de la
  // réconciliation 3.4 — un "" concluerait à tort une finalisation (review #353)
  const rawNumber = d.number == null ? null : String(d.number).trim();
  return {
    id: String(d.id),
    number: rawNumber === "" ? null : rawNumber,
    state: d.state == null ? null : String(d.state),
  };
}

export interface AbbyOrganizationSummary {
  id: string;
  name: string;
  siret: string | null;
}

/**
 * Recherche read-only d'organizations par nom (anti-doublon FR-6).
 * `page ≥ 1` obligatoire ; `limit: 100` — un homonyme au SIRET identique
 * au-delà de la première page serait un doublon évitable, pour le même coût.
 */
export async function searchOrganizations(
  abby: Abby,
  name: string
): Promise<AbbyOrganizationSummary[]> {
  const { data } = await abby.organization.retrieveOrganizations({
    query: { page: 1, limit: 100, search: name },
  });
  const docs = (data as { docs?: Array<Record<string, unknown>> }).docs ?? [];
  // Normalisation défensive : les types du SDK mentent (précédent commercialName)
  return docs.map((d) => ({
    id: String(d.id),
    name: (d.name as string | null) ?? "",
    siret: d.siret == null ? null : String(d.siret),
  }));
}
