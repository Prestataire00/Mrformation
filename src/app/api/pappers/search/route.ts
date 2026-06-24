import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { MIN_COMPANY_QUERY_LENGTH, isCompanyQueryValid } from "@/lib/crm/company-search-query";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompanySearchResult {
  company_name: string;
  siret: string;
  siren: string;
  legal_form: string;
  address: string;
  city: string;
  postal_code: string;
  capital: number | null;
  revenue: number | null;
  employees: string | null;
  naf_code: string | null;
  creation_date: string | null;
  is_demo?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface GouvSiege {
  siret?: string;
  adresse?: string;
  libelle_commune?: string;
  code_postal?: string;
  date_creation?: string;
}

interface GouvEntreprise {
  nom_complet?: string;
  siren?: string;
  nature_juridique?: string;
  activite_principale?: string;
  tranche_effectif_salarie?: string;
  date_creation?: string;
  siege?: GouvSiege;
}

function mapGouvResult(entreprise: GouvEntreprise): CompanySearchResult {
  const siege = entreprise.siege ?? {};

  return {
    company_name: entreprise.nom_complet ?? "",
    siret: siege.siret ?? "",
    siren: entreprise.siren ?? "",
    legal_form: entreprise.nature_juridique ?? "",
    address: siege.adresse ?? "",
    city: siege.libelle_commune ?? "",
    postal_code: siege.code_postal ?? "",
    capital: null,
    revenue: null,
    employees: entreprise.tranche_effectif_salarie ?? null,
    naf_code: entreprise.activite_principale ?? null,
    creation_date: entreprise.date_creation ?? siege.date_creation ?? null,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "commercial"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");

    // Garde autoritaire : l'API data.gouv exige ≥ 3 caractères (cf.
    // company-search-query). On rejette AVANT l'appel amont pour éviter un 400
    // upstream affiché à tort comme « service indisponible ».
    if (!isCompanyQueryValid(q)) {
      return NextResponse.json(
        { error: `Le paramètre 'q' doit contenir au moins ${MIN_COMPANY_QUERY_LENGTH} caractères` },
        { status: 400 }
      );
    }

    // ── Appel API Recherche Entreprises (gouv.fr — gratuit, sans clé) ─────────
    // q est garanti valide (≥ 3 car.) par le guard ci-dessus.
    const term = (q ?? "").trim();
    const url = new URL("https://recherche-entreprises.api.gouv.fr/search");
    url.searchParams.set("q", term);
    url.searchParams.set("per_page", "5");
    url.searchParams.set("page", "1");

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[Entreprise search] API gouv error:", response.status, text);
      if (response.status === 429) {
        return NextResponse.json(
          { error: "Trop de requêtes. Réessayez dans quelques secondes.", status_code: 429 },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: `Service Annuaire Entreprises indisponible (${response.status})`, status_code: response.status },
        { status: response.status }
      );
    }

    const json = (await response.json()) as { results?: GouvEntreprise[] };
    const results = (json.results ?? []).map(mapGouvResult);

    return NextResponse.json({ data: results, demo: false });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "entreprise/search") }, { status: 500 });
  }
}
