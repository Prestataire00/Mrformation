"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  TrainerQuestionnaireBuilder, type BuilderInitial, type BuilderQuestion, type BuilderQuestionType,
} from "@/components/trainer/TrainerQuestionnaireBuilder";

export default function EditTrainerQuestionnairePage() {
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();
  const [initial, setInitial] = useState<BuilderInitial | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: q } = await supabase
        .from("questionnaires")
        .select("title, description, type")
        .eq("id", id)
        .maybeSingle();
      const { data: questions } = await supabase
        .from("questions")
        .select("text, type, options, is_required, order_index")
        .eq("questionnaire_id", id)
        .order("order_index", { ascending: true });
      if (q) {
        setInitial({
          title: q.title ?? "",
          description: q.description ?? "",
          type: q.type ?? "evaluation",
          questions: ((questions as Array<{ text: string; type: string; options: string[] | null; is_required: boolean }> | null) ?? []).map((qq) => ({
            text: qq.text,
            type: (["rating", "text", "multiple_choice", "yes_no"].includes(qq.type) ? qq.type : "text") as BuilderQuestionType,
            options: qq.options ?? [],
            is_required: qq.is_required,
          } as BuilderQuestion)),
        });
      }
      setLoading(false);
    })();
  }, [id, supabase]);

  return (
    <div className="space-y-6">
      <Link href="/trainer/questionnaires" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>
      <h1 className="text-xl font-bold">Modifier le questionnaire</h1>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : initial ? (
        <TrainerQuestionnaireBuilder questionnaireId={id} initial={initial} />
      ) : (
        <p className="text-sm text-muted-foreground">Questionnaire introuvable.</p>
      )}
    </div>
  );
}
