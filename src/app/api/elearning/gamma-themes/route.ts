import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { listGammaThemes } from "@/lib/services/gamma";
import { sanitizeError } from "@/lib/api-error";

/**
 * GET /api/elearning/gamma-themes
 * Returns available Gamma themes for the admin to pick from.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const themes = await listGammaThemes();
    return NextResponse.json({ data: themes });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeError(error, "fetching Gamma themes") },
      { status: 500 }
    );
  }
}
