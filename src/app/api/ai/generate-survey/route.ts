import { NextRequest, NextResponse } from "next/server";
import { generateSurveyQuestions } from "@/lib/services/openai";
import { requireRole } from "@/lib/auth/require-role";
import { sanitizeError } from "@/lib/api-error";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (auth.error) return auth.error;

  const { allowed, resetAt } = checkRateLimit(`ai-survey:${auth.profile.id}`, { limit: 5, windowSeconds: 60 });
  if (!allowed) return rateLimitResponse(resetAt);

  try {
    const body = await request.json();
    const { training_title, type, count } = body;

    if (!training_title) {
      return NextResponse.json({ error: "Le titre de la formation est requis" }, { status: 400 });
    }

    const questions = await generateSurveyQuestions({
      training_title,
      type: type || "satisfaction",
      count: count || 10,
    });

    return NextResponse.json({ data: questions });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error, "ai/generate-survey") }, { status: 500 });
  }
}
