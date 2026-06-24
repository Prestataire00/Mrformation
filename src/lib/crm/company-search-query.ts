/**
 * Contrat de la recherche entreprise (Annuaire Entreprises — data.gouv.fr).
 *
 * L'API publique `recherche-entreprises.api.gouv.fr` impose un MINIMUM de
 * 3 caractères pour les termes de la requête `q` (sinon HTTP 400 :
 * « 3 caractères minimum pour les termes de la requête »). Pappers (l'ancien
 * fournisseur) tolérait 2 caractères — d'où un bug après migration : une
 * recherche de 2 lettres atteignait data.gouv et renvoyait un 400 affiché
 * comme « service indisponible ».
 *
 * Source unique de vérité partagée par le frontend (CompanySearch, panneaux
 * d'enrichissement) ET le backend (route /api/pappers/search) pour qu'ils ne
 * puissent plus diverger. Ne pas hardcoder « 2 » ou « 3 » ailleurs.
 */
export const MIN_COMPANY_QUERY_LENGTH = 3;

/** Vrai si la requête respecte le minimum de l'API data.gouv (après trim). */
export function isCompanyQueryValid(q: string | null | undefined): boolean {
  return (q ?? "").trim().length >= MIN_COMPANY_QUERY_LENGTH;
}
