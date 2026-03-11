/**
 * Service d'intégration Infogreffe / Papers
 * Utilisé pour enrichir les fiches prospects/clients avec des données légales et financières.
 */

const INFOGREFFE_API_URL = "https://opendata-rncs.inpi.fr/services/diffusion/entreprises";
const PAPERS_API_URL = "https://api.pappers.fr/v2";

function getInfogreffeKey(): string {
  const key = process.env.INFOGREFFE_API_KEY;
  if (!key || key === "votre-cle-infogreffe") {
    throw new Error("INFOGREFFE_API_KEY non configurée. Ajoutez votre clé dans .env.local");
  }
  return key;
}

function getPappersKey(): string {
  const key = process.env.PAPPERS_API_KEY;
  if (!key || key === "votre-cle-pappers") {
    throw new Error("PAPPERS_API_KEY non configurée. Ajoutez votre clé dans .env.local");
  }
  return key;
}

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

/**
 * Recherche une entreprise par SIRET via l'API Pappers
 */
export async function searchBySiret(siret: string): Promise<CompanyInfo | null> {
  const apiKey = getPappersKey();
  const cleanSiret = siret.replace(/\s/g, "");

  if (cleanSiret.length !== 14) {
    throw new Error("Le SIRET doit contenir 14 chiffres");
  }

  const response = await fetch(
    `${PAPERS_API_URL}/entreprise?siret=${cleanSiret}&api_token=${apiKey}`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    const error = await response.json().catch(() => ({}));
    throw new Error(`Pappers API error (${response.status}): ${error.message || "Unknown error"}`);
  }

  const data = await response.json();

  return {
    siren: data.siren || "",
    siret: data.siege?.siret || cleanSiret,
    denomination: data.nom_entreprise || data.denomination || "",
    forme_juridique: data.forme_juridique || "",
    date_creation: data.date_creation || "",
    adresse: data.siege?.adresse_ligne_1 || "",
    code_postal: data.siege?.code_postal || "",
    ville: data.siege?.ville || "",
    code_naf: data.code_naf || "",
    libelle_naf: data.libelle_code_naf || "",
    capital_social: data.capital ? parseFloat(data.capital) : null,
    effectif: data.effectif || null,
    dirigeants: (data.representants || []).map((r: Record<string, string>) => ({
      nom: r.nom || "",
      prenom: r.prenom || "",
      fonction: r.qualite || "",
    })),
    chiffre_affaires: data.finances?.[0]?.chiffre_affaires
      ? parseFloat(data.finances[0].chiffre_affaires)
      : null,
    resultat_net: data.finances?.[0]?.resultat
      ? parseFloat(data.finances[0].resultat)
      : null,
  };
}

/**
 * Recherche une entreprise par nom via l'API Pappers
 */
export async function searchByName(name: string, limit = 5): Promise<CompanyInfo[]> {
  const apiKey = getPappersKey();

  const response = await fetch(
    `${PAPERS_API_URL}/recherche?q=${encodeURIComponent(name)}&par_page=${limit}&api_token=${apiKey}`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    throw new Error(`Pappers API error (${response.status})`);
  }

  const data = await response.json();
  const results = data.resultats || [];

  return results.map((item: Record<string, unknown>) => ({
    siren: (item.siren as string) || "",
    siret: ((item.siege as Record<string, string>)?.siret) || "",
    denomination: (item.nom_entreprise as string) || "",
    forme_juridique: (item.forme_juridique as string) || "",
    date_creation: (item.date_creation as string) || "",
    adresse: ((item.siege as Record<string, string>)?.adresse_ligne_1) || "",
    code_postal: ((item.siege as Record<string, string>)?.code_postal) || "",
    ville: ((item.siege as Record<string, string>)?.ville) || "",
    code_naf: (item.code_naf as string) || "",
    libelle_naf: (item.libelle_code_naf as string) || "",
    capital_social: null,
    effectif: null,
    dirigeants: [],
    chiffre_affaires: null,
    resultat_net: null,
  }));
}

/**
 * Vérifie si une entreprise est en activité via son SIREN
 */
export async function checkCompanyStatus(siren: string): Promise<{
  active: boolean;
  procedure_collective: boolean;
  date_radiation?: string;
}> {
  const apiKey = getPappersKey();
  const cleanSiren = siren.replace(/\s/g, "");

  const response = await fetch(
    `${PAPERS_API_URL}/entreprise?siren=${cleanSiren}&api_token=${apiKey}`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    throw new Error(`Pappers API error (${response.status})`);
  }

  const data = await response.json();

  return {
    active: !data.date_cessation,
    procedure_collective: !!data.procedure_collective,
    date_radiation: data.date_cessation || undefined,
  };
}
