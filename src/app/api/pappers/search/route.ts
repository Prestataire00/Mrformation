import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PappersCompany {
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

// ─── Mock data (mode démo) ────────────────────────────────────────────────────

const MOCK_COMPANIES: PappersCompany[] = [
  {
    company_name: "FORMATION EXCELLENCE SAS",
    siret: "44306184100047",
    siren: "443061841",
    legal_form: "Société par actions simplifiée",
    address: "12 Rue de la Formation",
    city: "Paris",
    postal_code: "75008",
    capital: 10000,
    revenue: 850000,
    employees: "10 à 19 salariés",
    naf_code: "8559A",
    creation_date: "2001-03-15",
    is_demo: true,
  },
  {
    company_name: "GROUPE CONSEIL & FORMATION SARL",
    siret: "53229580700021",
    siren: "532295807",
    legal_form: "Société à responsabilité limitée",
    address: "45 Avenue des Entrepreneurs",
    city: "Lyon",
    postal_code: "69003",
    capital: 5000,
    revenue: 420000,
    employees: "6 à 9 salariés",
    naf_code: "8559B",
    creation_date: "2011-07-22",
    is_demo: true,
  },
  {
    company_name: "ACAD'EVEIL FORMATION",
    siret: "80812356200018",
    siren: "808123562",
    legal_form: "Entrepreneur individuel",
    address: "8 Rue de l'Innovation",
    city: "Bordeaux",
    postal_code: "33000",
    capital: null,
    revenue: 175000,
    employees: "1 ou 2 salariés",
    naf_code: "8559A",
    creation_date: "2015-02-10",
    is_demo: true,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapPappersResult(entreprise: Record<string, unknown>): PappersCompany {
  const siege = (entreprise.siege ?? {}) as Record<string, unknown>;

  return {
    company_name: (entreprise.nom_entreprise as string) ?? "",
    siret: (siege.siret as string) ?? "",
    siren: (entreprise.siren as string) ?? "",
    legal_form: (entreprise.forme_juridique as string) ?? "",
    address: (siege.adresse_ligne_1 as string) ?? "",
    city: (siege.ville as string) ?? "",
    postal_code: (siege.code_postal as string) ?? "",
    capital: (entreprise.capital as number) ?? null,
    revenue: null, // available in full company endpoint
    employees: (entreprise.tranche_effectif as string) ?? null,
    naf_code: (entreprise.code_naf as string) ?? null,
    creation_date: (entreprise.date_creation as string) ?? null,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");

    if (!q || q.trim().length < 2) {
      return NextResponse.json(
        { error: "Le paramètre 'q' doit contenir au moins 2 caractères" },
        { status: 400 }
      );
    }

    const apiKey = process.env.PAPPERS_API_KEY;
    const isDemo = !apiKey || apiKey === "votre-cle-pappers" || apiKey.trim() === "";

    // ── Mode démo ─────────────────────────────────────────────────────────────
    if (isDemo) {
      const query = q.toLowerCase();
      const filtered = MOCK_COMPANIES.filter(
        (c) =>
          c.company_name.toLowerCase().includes(query) ||
          c.siret.includes(query) ||
          c.siren.includes(query) ||
          c.city.toLowerCase().includes(query)
      );

      return NextResponse.json({
        data: filtered.length > 0 ? filtered : MOCK_COMPANIES,
        demo: true,
        message: "Mode démo — configurez PAPPERS_API_KEY pour des données réelles",
      });
    }

    // ── Appel API Pappers réel ─────────────────────────────────────────────────
    const url = new URL("https://api.pappers.fr/v2/recherche");
    url.searchParams.set("q", q.trim());
    url.searchParams.set("api_token", apiKey);
    url.searchParams.set("par_page", "5");

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 }, // cache 5 min
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[Pappers search] API error:", response.status, text);
      return NextResponse.json(
        { error: `Erreur API Pappers (${response.status})` },
        { status: response.status }
      );
    }

    const json = (await response.json()) as { resultats?: Record<string, unknown>[] };
    const results = (json.resultats ?? []).map(mapPappersResult);

    return NextResponse.json({ data: results, demo: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    console.error("[Pappers search] Unexpected error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
