import { createClient } from "@/lib/supabase/server";
import { sanitizeError, sanitizeDbError } from "@/lib/api-error";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const { allowed, resetAt } = checkRateLimit(`auth:${ip}`, { limit: 10, windowSeconds: 60 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      return NextResponse.json(
        { data: null, error: sanitizeDbError(signOutError, "sign out") },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: { message: "Déconnexion réussie" }, error: null },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json({ data: null, error: sanitizeError(err, "sign out") }, { status: 500 });
  }
}
