/**
 * Service d'intégration Annuaire Entreprises (recherche-entreprises.api.gouv.fr)
 * Utilisé pour enrichir les fiches prospects/clients avec des données légales.
 * API gratuite, données INSEE/SIRENE — aucune clé API nécessaire.
 */

const ENTREPRISES_API_URL = "https://recherche-entreprises.api.gouv.fr";

export interface CompanyInfo {
  siren: string;
  siret: string;
  denomination: string;
  forme_juridique: string;
  date_creation: string;
  adresse: string;
  code_postal: string;
  ville: string;
  code_naf: string;
  libelle_naf: string;
  capital_social: number | null;
  effectif: string | null;
  dirigeants: { nom: string; prenom: string; fonction: string }[];
  chiffre_affaires: number | null;
  resultat_net: number | null;
}

interface GouvDirigeant {
  nom?: string;
  prenoms?: string;
  qualite?: string;
}

interface GouvSiege {
  siret?: string;
  adresse?: string;
  libelle_commune?: string;
  code_postal?: string;
}

interface GouvEntreprise {
  nom_complet?: string;
  siren?: string;
  nature_juridique?: string;
  activite_principale?: string;
  section_activite_principale?: string;
  tranche_effectif_salarie?: string;
  date_creation?: string;
  siege?: GouvSiege;
  dirigeants?: GouvDirigeant[];
}

function mapGouvToCompanyInfo(item: GouvEntreprise): CompanyInfo {
  const siege = item.siege ?? {};
  return {
    siren: item.siren ?? "",
    siret: siege.siret ?? "",
    denomination: item.nom_complet ?? "",
    forme_juridique: item.nature_juridique ?? "",
    date_creation: item.date_creation ?? "",
    adresse: siege.adresse ?? "",
    code_postal: siege.code_postal ?? "",
    ville: siege.libelle_commune ?? "",
    code_naf: item.activite_principale ?? "",
    libelle_naf: item.section_activite_principale ?? "",
    capital_social: null,
    effectif: item.tranche_effectif_salarie ?? null,
    dirigeants: (item.dirigeants ?? []).map((d) => ({
      nom: d.nom ?? "",
      prenom: d.prenoms ?? "",
      fonction: d.qualite ?? "",
    })),
    chiffre_affaires: null,
    resultat_net: null,
  };
}

/**
 * Recherche une entreprise par SIRET via l'API Recherche Entreprises
 */
export async function searchBySiret(siret: string): Promise<CompanyInfo | null> {
  const cleanSiret = siret.replace(/\s/g, "");

  if (cleanSiret.length !== 14) {
    throw new Error("Le SIRET doit contenir 14 chiffres");
  }

  const response = await fetch(
    `${ENTREPRISES_API_URL}/search?q=${cleanSiret}&per_page=1`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`API Annuaire Entreprises erreur (${response.status})`);
  }

  const data = (await response.json()) as { results?: GouvEntreprise[] };
  const results = data.results ?? [];

  if (results.length === 0) return null;

  return mapGouvToCompanyInfo(results[0]);
}

/**
 * Recherche une entreprise par nom via l'API Recherche Entreprises
 */
export async function searchByName(name: string, limit = 5): Promise<CompanyInfo[]> {
  const response = await fetch(
    `${ENTREPRISES_API_URL}/search?q=${encodeURIComponent(name)}&per_page=${limit}`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    throw new Error(`API Annuaire Entreprises erreur (${response.status})`);
  }

  const data = (await response.json()) as { results?: GouvEntreprise[] };
  const results = data.results ?? [];

  return results.map(mapGouvToCompanyInfo);
}

/**
 * Vérifie si une entreprise est en activité via son SIREN
 */
export async function checkCompanyStatus(siren: string): Promise<{
  active: boolean;
  procedure_collective: boolean;
  date_radiation?: string;
}> {
  const cleanSiren = siren.replace(/\s/g, "");

  const response = await fetch(
    `${ENTREPRISES_API_URL}/search?q=${cleanSiren}&per_page=1`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    throw new Error(`API Annuaire Entreprises erreur (${response.status})`);
  }

  const data = (await response.json()) as {
    results?: Array<{ etat_administratif?: string; date_cessation?: string }>;
  };
  const results = data.results ?? [];

  if (results.length === 0) {
    return { active: false, procedure_collective: false };
  }

  const entreprise = results[0];

  return {
    active: entreprise.etat_administratif === "A",
    procedure_collective: false, // non disponible via cette API
    date_radiation: entreprise.etat_administratif === "C" ? entreprise.date_cessation : undefined,
  };
}
