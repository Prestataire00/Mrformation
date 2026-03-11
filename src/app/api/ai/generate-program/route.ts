import { NextRequest, NextResponse } from "next/server";
import { generateTrainingProgram, generateStructuredProgram } from "@/lib/services/openai";
import { requireRole } from "@/lib/auth/require-role";

export async function POST(request: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (auth.error) return auth.error;

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
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
