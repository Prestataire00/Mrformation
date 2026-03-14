import { NextRequest, NextResponse } from "next/server";
import { generateTrainingProgram, generateStructuredProgram } from "@/lib/services/openai";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (auth.error) return auth.error;

  const { allowed, resetAt } = checkRateLimit(`ai-program:${auth.profile.id}`, { limit: 5, windowSeconds: 60 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
    const body = await request.json();
    const { title, objectives, duration_hours, target_audience, structured } = body;

    if (!title) {
      return NextResponse.json({ error: "Le titre est requis" }, { status: 400 });
    }

    // Structured JSON mode for program detail page
    if (structured) {
      const program = await generateStructuredProgram({
        title,
        duration_hours,
        target_audience,
      });
      return NextResponse.json({ data: program });
    }

    // Legacy text mode
    const program = await generateTrainingProgram({
      title,
      objectives,
      duration_hours,
      target_audience,
    });

    return NextResponse.json({ data: program });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "ai/generate-program") }, { status: 500 });
  }
}
