import { NextRequest, NextResponse } from "next/server";
import { generateSurveyQuestions } from "@/lib/services/openai";
import { requireRole } from "@/lib/auth/require-role";

export async function POST(request: NextRequest) {
  const auth = await requireRole(["admin"]);
  if (auth.error) return auth.error;

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
    const message = error instanceof Error ? error.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
