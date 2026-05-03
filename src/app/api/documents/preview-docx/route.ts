import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { convertDocxToPdfWithVariables } from "@/lib/services/docx-converter";

/**
 * GET /api/documents/preview-docx?url=<docx_url>
 *
 * Convertit un .docx (URL Storage) en PDF via CloudConvert (LibreOffice)
 * et retourne le PDF en stream pour affichage dans un iframe d'aperçu.
 *
 * Pas de variables substituées (preview brut). Pour générer un PDF avec
 * variables résolues, utiliser POST /api/documents/generate.
 *
 * Réservé aux admins/super_admins/trainers.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(["super_admin", "admin", "trainer"]);
  if (auth.error) return auth.error;

  const docxUrl = request.nextUrl.searchParams.get("url");
  if (!docxUrl) {
    return NextResponse.json({ error: "url requis" }, { status: 400 });
  }

  // Sécurité : vérifier que l'URL pointe bien vers Supabase Storage de l'instance
  // (anti-SSRF — on ne convertit pas n'importe quelle URL externe)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !docxUrl.startsWith(supabaseUrl)) {
    return NextResponse.json(
      { error: "URL non autorisée (doit être une URL Supabase Storage de cette instance)" },
      { status: 403 }
    );
  }

  try {
    const pdf = await convertDocxToPdfWithVariables(docxUrl, null);
    return new Response(new Uint8Array(pdf.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="preview.pdf"`,
        "Content-Length": String(pdf.buffer.byteLength),
        // Cache 5 min (preview rarement modifiée puisque .docx immutable)
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("[documents/preview-docx] error:", err);
    return NextResponse.json(
      { error: sanitizeError(err, "documents/preview-docx") },
      { status: 500 }
    );
  }
}
