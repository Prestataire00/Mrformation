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
 * Vérifie une clé API en interrogeant le compte (`company.getMe()`) et
 * retourne l'identité normalisée.
 *
 * ⚠️ Les types du SDK contredisent le runtime (sondes du 13/07) :
 * `commercialName` est déclaré string mais vaut null, `isInTestMode` est
 * déclaré boolean mais vaut 1 — d'où la normalisation défensive.
 */
export async function fetchCompanyIdentity(
  apiKey: string
): Promise<AbbyCompanyIdentity> {
  const abby = createAbbyClient(apiKey);
  const { data } = await abby.company.getMe({});
  const company = (data as { company: Record<string, unknown> }).company;

  return {
    companyName: (company.commercialName as string | null) ?? null,
    companySiret: String(company.siret),
    isInTestMode: Boolean(company.isInTestMode),
  };
}
