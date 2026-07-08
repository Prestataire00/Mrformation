import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { getOwnedQuestionnaire } from "@/lib/services/trainer-questionnaire";

const ALLOWED_TYPES = ["rating", "text", "multiple_choice", "yes_no"] as const;

interface QuestionInput {
  text: string;
  type: string;
  options: string[] | null;
  is_required: boolean;
  correct_answer?: string | null;
}

/** PUT — édite titre/description/type + remplace les questions (créateur uniquement). */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const owned = await getOwnedQuestionnaire(supabase, user.id, params.id);
    if (!owned) return NextResponse.json({ error: "Questionnaire introuvable ou non autorisé" }, { status: 404 });

    const body = (await request.json()) as {
      title?: string; description?: string; type?: string; questions?: QuestionInput[];
    };
    if (!body.title?.trim()) return NextResponse.json({ error: "Titre requis" }, { status: 400 });
    const qType = ["satisfaction", "evaluation", "survey"].includes(body.type ?? "")
      ? body.type : "evaluation";

    const { error: upErr } = await supabase
      .from("questionnaires")
      .update({ title: body.title.trim(), description: body.description?.trim() || null, type: qType })
      .eq("id", params.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    // Remplace les questions (delete + re-insert) — simple et correct pour un builder.
    await supabase.from("questions").delete().eq("questionnaire_id", params.id);
    const questions = (body.questions ?? []).filter((q) => q.text?.trim());
    if (questions.length > 0) {
      const rows = questions.map((q, i) => ({
        questionnaire_id: params.id,
        text: q.text.trim(),
        type: ALLOWED_TYPES.includes(q.type as typeof ALLOWED_TYPES[number]) ? q.type : "text",
        options: q.type === "multiple_choice" ? (q.options ?? []).filter((o) => o.trim()) : null,
        is_required: q.is_required !== false,
        order_index: i + 1,
        correct_answer:
          (q.type === "multiple_choice" || q.type === "yes_no") ? (q.correct_answer ?? null) : null,
      }));
      const { error: qErr } = await supabase.from("questions").insert(rows);
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires/[id] PUT") }, { status: 500 });
  }
}

/** DELETE — supprime le questionnaire (créateur uniquement). Cascade questions + liens. */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const owned = await getOwnedQuestionnaire(supabase, user.id, params.id);
    if (!owned) return NextResponse.json({ error: "Questionnaire introuvable ou non autorisé" }, { status: 404 });

    const { error } = await supabase.from("questionnaires").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires/[id] DELETE") }, { status: 500 });
  }
}
