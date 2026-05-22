import { requireRole } from "@/lib/auth/require-role";
import { NextRequest, NextResponse } from "next/server";
import { extractFromUrl } from "@/lib/services/doc-extraction";
import { sanitizeError } from "@/lib/api-error";

export const maxDuration = 120;

/**
 * POST /api/elearning/extract-url
 * Extract text content from a URL (web page or YouTube video)
 * Body: { url: string }
 * Returns: { text, word_count, preview, metadata }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["admin", "super_admin"]);
    if (auth.error) return auth.error;

    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL requise" }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "URL invalide" }, { status: 400 });
    }

    const { text, metadata } = await extractFromUrl(url.trim());

    if (!text || text.trim().length < 50) {
      return NextResponse.json({ error: "Contenu extrait trop court ou vide" }, { status: 400 });
    }

    // Truncate to 200k chars max
    const truncatedText = text.substring(0, 200000);

    return NextResponse.json({
      data: {
        text: truncatedText,
        word_count: truncatedText.split(/\s+/).length,
        preview: truncatedText.substring(0, 500),
        metadata,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "extracting content from URL") }, { status: 500 });
  }
}
