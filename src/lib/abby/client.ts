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
