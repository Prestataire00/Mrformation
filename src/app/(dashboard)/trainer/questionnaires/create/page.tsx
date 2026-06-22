"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TrainerQuestionnaireBuilder } from "@/components/trainer/TrainerQuestionnaireBuilder";

export default function CreateTrainerQuestionnairePage() {
  return (
    <div className="space-y-6">
      <Link href="/trainer/questionnaires" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>
      <h1 className="text-xl font-bold">Nouveau questionnaire</h1>
      <TrainerQuestionnaireBuilder />
    </div>
  );
}
