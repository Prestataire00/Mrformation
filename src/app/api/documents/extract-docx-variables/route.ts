import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import PizZip from "pizzip";

/**
 * GET /api/documents/extract-docx-variables?url=<docx_url>
 *
 * Télécharge un .docx, extrait son contenu XML et liste tous les
 * placeholders {{xxx}} présents. Utilisé par la modale d'édition pour
 * afficher à l'admin les variables qu'il a déjà mises dans son document.
 *
 * Réponse : { variables: string[] } (tableau des noms de variables, sans les {{}}).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "trainer"]);
  if (auth.error) return auth.error;

  const docxUrl = request.nextUrl.searchParams.get("url");
  if (!docxUrl) {
    return NextResponse.json({ error: "url requis" }, { status: 400 });
  }

  // Anti-SSRF
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !docxUrl.startsWith(supabaseUrl)) {
    return NextResponse.json(
      { error: "URL non autorisée (doit être une URL Supabase Storage)" },
      { status: 403 }
    );
  }

  try {
    const response = await fetch(docxUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${docxUrl}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    const zip = new PizZip(buffer);
    const documentXml = zip.files["word/document.xml"];
    if (!documentXml) {
      return NextResponse.json({ variables: [] });
    }

    // Parse les placeholders {{xxx}} dans le texte XML.
    // Note : Word peut splitter une variable en plusieurs <w:t> runs
    // (ex: {{ et nom_apprenant et }} dans 3 runs séparés). On enlève donc
    // les balises XML avant de chercher les patterns.
    const text = documentXml.asText().replace(/<[^>]+>/g, "");
    const matches = text.match(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g) ?? [];
    const uniqueVars = [...new Set(matches.map((m) => m.replace(/[{}\s]/g, "")))];

    return NextResponse.json({ variables: uniqueVars });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur extraction";
    console.error("[extract-docx-variables] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
