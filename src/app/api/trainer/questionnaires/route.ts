import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeError } from "@/lib/api-error";
import { resolveTrainerIds } from "@/lib/services/trainer-questionnaire";

const ALLOWED_TYPES = ["rating", "text", "multiple_choice", "yes_no"] as const;

/** GET — questionnaires de l'entité (mes créations éditables + bibliothèque). */
export async function GET(_request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles").select("entity_id").eq("id", user.id).single();
    if (!profile?.entity_id) return NextResponse.json({ error: "Profil introuvable" }, { status: 403 });

    const trainerIds = await resolveTrainerIds(supabase, user.id);

    const { data: questionnaires, error } = await supabase
      .from("questionnaires")
      .select("id, title, description, type, is_active, quality_indicator_type, created_by_trainer_id")
      .eq("entity_id", profile.entity_id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const data = ((questionnaires as Array<{ created_by_trainer_id: string | null }> | null) ?? []).map((q) => ({
      ...q,
      mine: q.created_by_trainer_id != null && trainerIds.includes(q.created_by_trainer_id),
    }));
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires GET") }, { status: 500 });
  }
}

interface QuestionInput {
  text: string;
  type: string;
  options: string[] | null;
  is_required: boolean;
}

/** POST — crée un questionnaire { title, description, type, questions[] }. */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles").select("entity_id").eq("id", user.id).single();
    if (!profile?.entity_id) return NextResponse.json({ error: "Profil introuvable" }, { status: 403 });

    const trainerIds = await resolveTrainerIds(supabase, user.id);
    if (trainerIds.length === 0) return NextResponse.json({ error: "Fiche formateur introuvable" }, { status: 403 });

    const body = (await request.json()) as {
      title?: string; description?: string; type?: string; questions?: QuestionInput[];
    };
    if (!body.title?.trim()) return NextResponse.json({ error: "Titre requis" }, { status: 400 });
    const qType = ["satisfaction", "evaluation", "survey"].includes(body.type ?? "")
      ? body.type : "evaluation";

    const { data: created, error: insErr } = await supabase
      .from("questionnaires")
      .insert({
        title: body.title.trim(),
        description: body.description?.trim() || null,
        type: qType,
        is_active: true,
        entity_id: profile.entity_id,
        created_by_trainer_id: trainerIds[0],
      })
      .select("id")
      .single();
    if (insErr || !created) {
      return NextResponse.json({ error: insErr?.message ?? "Création échouée" }, { status: 500 });
    }

    const questions = (body.questions ?? []).filter((q) => q.text?.trim());
    if (questions.length > 0) {
      const rows = questions.map((q, i) => ({
        questionnaire_id: created.id,
        text: q.text.trim(),
        type: ALLOWED_TYPES.includes(q.type as typeof ALLOWED_TYPES[number]) ? q.type : "text",
        options: q.type === "multiple_choice" ? (q.options ?? []).filter((o) => o.trim()) : null,
        is_required: q.is_required !== false,
        order_index: i + 1,
      }));
      const { error: qErr } = await supabase.from("questions").insert(rows);
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id: created.id } });
  } catch (e) {
    return NextResponse.json({ error: sanitizeError(e, "trainer/questionnaires POST") }, { status: 500 });
  }
}
