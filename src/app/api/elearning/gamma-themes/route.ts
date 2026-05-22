import { requireRole } from "@/lib/auth/require-role";
import { NextResponse } from "next/server";
import { listGammaThemes } from "@/lib/services/gamma";
import { sanitizeError } from "@/lib/api-error";

/**
 * GET /api/elearning/gamma-themes
 * Returns available Gamma themes for the admin to pick from.
 */
export async function GET() {
  try {
    const auth = await requireRole(["admin", "super_admin"]);
    if (auth.error) return auth.error;

    const themes = await listGammaThemes();
    return NextResponse.json({ data: themes });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError(error, "fetching Gamma themes") },
      { status: 500 }
    );
  }
}
