import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompanyDirigeant {
  nom: string;
  prenom: string | null;
  qualite: string;
  date_naissance_formate: string | null;
}

export interface CompanyFinances {
  annee: number;
  chiffre_affaires: number | null;
  resultat: number | null;
  effectif: number | null;
}

export interface CompanyDetail {
  company_name: string;
  siret: string;
  siren: string;
  legal_form: string;
  address: string;
  city: string;
  postal_code: string;
  capital: number | null;
  naf_code: string | null;
  naf_label: string | null;
  creation_date: string | null;
  employees: string | null;
  dirigeants: CompanyDirigeant[];
  finances: CompanyFinances[];
  website: string | null;
  is_demo?: boolean;
}

// ─── Gouv API types ──────────────────────────────────────────────────────────

interface GouvDirigeant {
  nom?: string;
  prenoms?: string;
  qualite?: string;
  date_naissance?: string;
}

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
  section_activite_principale?: string;
  tranche_effectif_salarie?: string;
  date_creation?: string;
  siege?: GouvSiege;
  dirigeants?: GouvDirigeant[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapGouvDetail(entreprise: GouvEntreprise): CompanyDetail {
  const siege = entreprise.siege ?? {};

  const dirigeants: CompanyDirigeant[] = (entreprise.dirigeants ?? []).map(
    (d) => ({
      nom: d.nom ?? "",
      prenom: d.prenoms ?? null,
      qualite: d.qualite ?? "",
      date_naissance_formate: d.date_naissance ?? null,
    })
  );

  return {
    company_name: entreprise.nom_complet ?? "",
    siret: siege.siret ?? "",
    siren: entreprise.siren ?? "",
    legal_form: entreprise.nature_juridique ?? "",
    address: siege.adresse ?? "",
    city: siege.libelle_commune ?? "",
    postal_code: siege.code_postal ?? "",
    capital: null, // non disponible via API gouv gratuite
    naf_code: entreprise.activite_principale ?? null,
    naf_label: entreprise.section_activite_principale ?? null,
    creation_date: entreprise.date_creation ?? siege.date_creation ?? null,
    employees: entreprise.tranche_effectif_salarie ?? null,
    dirigeants,
    finances: [], // non disponible via API gouv gratuite
    website: null, // non disponible via API gouv gratuite
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "commercial"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const siret = searchParams.get("siret");

    if (!siret || siret.trim().length < 9) {
      return NextResponse.json(
        { error: "Le paramètre 'siret' est requis (SIRET ou SIREN)" },
        { status: 400 }
      );
    }

    const cleanSiret = siret.trim().replace(/\s/g, "");

    // ── Cache DB (30 jours) ───────────────────────────────────────────────────
    const { data: cached } = await auth.supabase
      .from("pappers_cache")
      .select("data, expires_at")
      .eq("siret", cleanSiret)
      .eq("endpoint", "company")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached) {
      return NextResponse.json({ data: cached.data, demo: false, cached: true });
    }

    // ── Appel API Recherche Entreprises (gouv.fr — gratuit, sans clé) ─────────
    const url = new URL("https://recherche-entreprises.api.gouv.fr/search");
    url.searchParams.set("q", cleanSiret);
    url.searchParams.set("per_page", "1");
    url.searchParams.set("page", "1");

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[Entreprise company] API gouv error:", response.status, text);
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
    const results = json.results ?? [];

    if (results.length === 0) {
      return NextResponse.json(
        { error: "Ce SIRET/SIREN n'a pas été trouvé. Vérifiez le numéro ou recherchez par nom.", status_code: 404 },
        { status: 404 }
      );
    }

    const detail = mapGouvDetail(results[0]);

    // ── Stocker en cache ──────────────────────────────────────────────────────
    await auth.supabase
      .from("pappers_cache")
      .upsert({
        siret: cleanSiret,
        siren: detail.siren,
        endpoint: "company",
        data: detail,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "siret" })
      .then(() => {}); // fire & forget

    return NextResponse.json({ data: detail, demo: false });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "entreprise/company") }, { status: 500 });
  }
}
