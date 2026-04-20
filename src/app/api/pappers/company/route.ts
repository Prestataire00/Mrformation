import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PappersDirigeant {
  nom: string;
  prenom: string | null;
  qualite: string;
  date_naissance_formate: string | null;
}

export interface PappersFinances {
  annee: number;
  chiffre_affaires: number | null;
  resultat: number | null;
  effectif: number | null;
}

export interface PappersCompanyDetail {
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
  dirigeants: PappersDirigeant[];
  finances: PappersFinances[];
  website: string | null;
  is_demo?: boolean;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_DETAIL: PappersCompanyDetail = {
  company_name: "FORMATION EXCELLENCE SAS",
  siret: "44306184100047",
  siren: "443061841",
  legal_form: "Société par actions simplifiée",
  address: "12 Rue de la Formation",
  city: "Paris",
  postal_code: "75008",
  capital: 10000,
  naf_code: "8559A",
  naf_label: "Autres formations",
  creation_date: "2001-03-15",
  employees: "10 à 19 salariés",
  dirigeants: [
    {
      nom: "DUPONT",
      prenom: "Jean-Marc",
      qualite: "Président",
      date_naissance_formate: "Janvier 1972",
    },
  ],
  finances: [
    { annee: 2022, chiffre_affaires: 850000, resultat: 62000, effectif: 12 },
    { annee: 2021, chiffre_affaires: 720000, resultat: 48000, effectif: 10 },
    { annee: 2020, chiffre_affaires: 580000, resultat: 31000, effectif: 9 },
  ],
  website: null,
  is_demo: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapPappersDetail(entreprise: Record<string, unknown>): PappersCompanyDetail {
  const siege = (entreprise.siege ?? {}) as Record<string, unknown>;

  const dirigeants: PappersDirigeant[] = ((entreprise.dirigeants as Record<string, unknown>[]) ?? []).map(
    (d) => ({
      nom: (d.nom as string) ?? "",
      prenom: (d.prenom as string) ?? null,
      qualite: (d.qualite as string) ?? "",
      date_naissance_formate: (d.date_naissance_formate as string) ?? null,
    })
  );

  const finances: PappersFinances[] = ((entreprise.finances as Record<string, unknown>[]) ?? []).map(
    (f) => ({
      annee: (f.annee as number) ?? 0,
      chiffre_affaires: (f.chiffre_affaires as number) ?? null,
      resultat: (f.resultat as number) ?? null,
      effectif: (f.effectif as number) ?? null,
    })
  );

  return {
    company_name: (entreprise.nom_entreprise as string) ?? "",
    siret: (siege.siret as string) ?? "",
    siren: (entreprise.siren as string) ?? "",
    legal_form: (entreprise.forme_juridique as string) ?? "",
    address: (siege.adresse_ligne_1 as string) ?? "",
    city: (siege.ville as string) ?? "",
    postal_code: (siege.code_postal as string) ?? "",
    capital: (entreprise.capital as number) ?? null,
    naf_code: (entreprise.code_naf as string) ?? null,
    naf_label: (entreprise.libelle_code_naf as string) ?? null,
    creation_date: (entreprise.date_creation as string) ?? null,
    employees: (entreprise.tranche_effectif as string) ?? null,
    dirigeants,
    finances,
    website: (entreprise.site_web as string) ?? null,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin"]);
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

    const apiKey = process.env.PAPPERS_API_KEY;
    const isDemo = !apiKey || apiKey === "votre-cle-pappers" || apiKey.trim() === "";
    const cleanSiret = siret.trim().replace(/\s/g, "");

    // ── Mode démo ─────────────────────────────────────────────────────────────
    if (isDemo) {
      return NextResponse.json({
        data: { ...MOCK_DETAIL, siret: cleanSiret },
        demo: true,
        message: "Mode démo — configurez PAPPERS_API_KEY pour des données réelles",
      });
    }

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

    // ── Appel API Pappers réel ─────────────────────────────────────────────────
    const url = new URL("https://api.pappers.fr/v2/entreprise");
    url.searchParams.set("siret", cleanSiret);
    url.searchParams.set("api_token", apiKey);

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[Pappers company] API error:", response.status, text);
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Ce SIRET n'existe pas chez Pappers. Vérifiez le numéro ou recherchez par nom.", status_code: 404 },
          { status: 404 }
        );
      }
      if (response.status === 429) {
        return NextResponse.json(
          { error: "Limite Pappers atteinte. Réessayez dans 1h.", status_code: 429 },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: `Service Pappers indisponible (${response.status})`, status_code: response.status },
        { status: response.status }
      );
    }

    const json = (await response.json()) as Record<string, unknown>;
    const detail = mapPappersDetail(json);

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
    return NextResponse.json({ error: sanitizeError(error, "pappers/company") }, { status: 500 });
  }
}
