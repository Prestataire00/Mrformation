import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { convertDocxToPdfWithVariables } from "@/lib/services/docx-converter";
import { computeCacheKey, getCachedPdf, setCachedPdf } from "@/lib/services/pdf-cache";

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
    // Cache key basé uniquement sur l'URL .docx (preview brut, pas de variables).
    // Le path Storage du .docx contient un UUID immuable → si l'admin re-upload
    // un nouveau .docx, l'URL change donc le hash change automatiquement.
    const cacheKey = computeCacheKey({
      entity_id: auth.profile.entity_id,
      template_id: docxUrl, // utilise l'URL comme clé (immuable par UUID)
    });

    const cachedBuffer = await getCachedPdf(auth.supabase, auth.profile.entity_id, cacheKey);
    if (cachedBuffer) {
      console.log(`[preview-docx] Cache HIT (${cacheKey.slice(0, 8)})`);
      return new Response(new Uint8Array(cachedBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="preview.pdf"`,
          "Content-Length": String(cachedBuffer.byteLength),
          "Cache-Control": "private, max-age=300",
          "X-Pdf-Cache": "hit",
        },
      });
    }

    console.log(`[preview-docx] Cache MISS (${cacheKey.slice(0, 8)}) — generating`);
    const pdf = await convertDocxToPdfWithVariables(docxUrl, null);

    // Sauvegarde best-effort
    setCachedPdf(auth.supabase, auth.profile.entity_id, cacheKey, pdf.buffer).catch(() => { /* silent */ });

    return new Response(new Uint8Array(pdf.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="preview.pdf"`,
        "Content-Length": String(pdf.buffer.byteLength),
        "Cache-Control": "private, max-age=300",
        "X-Pdf-Cache": "miss",
      },
    });
  } catch (err) {
    // Route admin-only → on retourne le vrai message d'erreur pour faciliter
    // le debug (config CloudConvert, URL Storage, etc.) au lieu du sanitize.
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[documents/preview-docx] error:", err);
    return NextResponse.json(
      { error: `Échec génération PDF preview : ${message}` },
      { status: 500 }
    );
  }
}
