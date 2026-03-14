import { NextRequest, NextResponse } from "next/server";
import { searchBySiret, searchByName } from "@/lib/services/infogreffe";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const siret = searchParams.get("siret");
    const name = searchParams.get("name");

    if (siret) {
      const company = await searchBySiret(siret);
      if (!company) {
        return NextResponse.json({ error: "Entreprise non trouvée" }, { status: 404 });
      }
      return NextResponse.json({ data: company });
    }

    if (name) {
      const companies = await searchByName(name);
      return NextResponse.json({ data: companies });
    }

    return NextResponse.json(
      { error: "Paramètre 'siret' ou 'name' requis" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "infogreffe/search") }, { status: 500 });
  }
}
