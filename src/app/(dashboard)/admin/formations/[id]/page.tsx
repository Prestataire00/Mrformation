"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { cn, formatDate, SESSION_STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import type { Session } from "@/lib/types";
import { TabResume } from "./_components/TabResume";
import { TabPlanning } from "./_components/TabPlanning";
import { TabParcours } from "./_components/TabParcours";
import { TabEmargements } from "./_components/TabEmargements";
import { TabAbsences } from "./_components/TabAbsences";
import { TabDocsPartages } from "./_components/TabDocsPartages";
import { TabMessagerie } from "./_components/TabMessagerie";
import { TabProgramme } from "./_components/TabProgramme";
import { TabEvaluation } from "./_components/TabEvaluation";
import { TabSatisfaction } from "./_components/TabSatisfaction";
import { TabConventionDocs } from "./_components/TabConventionDocs";
import { TabElearning } from "./_components/TabElearning";

const MODE_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

export default function FormationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();
  const formationId = params.id as string;

  const [formation, setFormation] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("resume");

  const fetchFormation = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("sessions")
        .select(`
          *,
          training:trainings(*),
          program:programs(*),
          manager:profiles!manager_id(id, first_name, last_name, email),
          formation_trainers(id, role, trainer_id, created_at, trainer:trainers(*)),
          enrollments(id, status, completion_rate, enrolled_at, learner:learners(*), client:clients(id, company_name)),
          formation_companies(id, client_id, amount, email, reference, created_at, client:clients(*)),
          formation_financiers(*),
          formation_comments(id, content, created_at, updated_at, author_id, author:profiles(id, first_name, last_name)),
          formation_time_slots(*),
          formation_absences(*, learner:learners(id, first_name, last_name)),
          formation_documents(*),
          signatures(id, signer_id, signer_type, signature_data, signed_at, time_slot_id),
          formation_evaluation_assignments(*, questionnaire:questionnaires(id, title, type, quality_indicator_type)),
          formation_satisfaction_assignments(*, questionnaire:questionnaires(id, title, type, quality_indicator_type)),
          formation_convention_documents(*, template:document_templates(id, name, type)),
          formation_elearning_assignments(*, course:elearning_courses(id, title, status, estimated_duration_minutes))
        `)
        .eq("id", formationId)
        .single();

      if (error) throw error;

      // Trier les time_slots par slot_order
      if (data?.formation_time_slots) {
        data.formation_time_slots.sort(
          (a: { slot_order: number }, b: { slot_order: number }) => a.slot_order - b.slot_order
        );
      }

      setFormation(data as unknown as Session);
    } catch (err) {
      console.error("Erreur chargement formation:", err);
      toast({
        title: "Erreur",
        description: "Impossible de charger la formation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [formationId, supabase, toast]);

  useEffect(() => {
    fetchFormation();
  }, [fetchFormation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!formation) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Formation introuvable</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{formation.title}</h1>
              {formation.type && (
                <Badge variant="outline" className="text-sm">
                  {formation.type === "intra" ? "Intra" : "Inter"}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              {formation.domain && <span>Domaine: {formation.domain}</span>}
              <span>
                Du {formatDate(formation.start_date)} au {formatDate(formation.end_date)}
              </span>
              {formation.training?.category && <span>{formation.training.category}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn(STATUS_COLORS[formation.status] || "bg-gray-100")}>
            {SESSION_STATUS_LABELS[formation.status] || formation.status}
          </Badge>
          <Badge variant="outline">
            {MODE_LABELS[formation.mode] || formation.mode}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent flex-wrap">
          {[
            { value: "resume", label: "Résumé" },
            { value: "planning", label: "Planning" },
            { value: "parcours", label: "Parcours" },
            { value: "emargements", label: "Émargements" },
            { value: "absences", label: "Absences" },
            { value: "docs", label: "Docs Partagés" },
            { value: "messagerie", label: "Messagerie" },
            { value: "programme", label: "Programme" },
            { value: "evaluation", label: "Évaluation" },
            { value: "satisfaction", label: "Satisfaction & Qualité" },
            { value: "convention", label: "Convention & Documents" },
            { value: "elearning", label: "e-Learning" },
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5"
              disabled={false}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resume" className="mt-6">
          <TabResume formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        <TabsContent value="planning" className="mt-6">
          <TabPlanning formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        <TabsContent value="parcours" className="mt-6">
          <TabParcours formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        <TabsContent value="emargements" className="mt-6">
          <TabEmargements formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        <TabsContent value="absences" className="mt-6">
          <TabAbsences formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        <TabsContent value="docs" className="mt-6">
          <TabDocsPartages formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        <TabsContent value="messagerie" className="mt-6">
          <TabMessagerie formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        <TabsContent value="programme" className="mt-6">
          <TabProgramme formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        <TabsContent value="evaluation" className="mt-6">
          <TabEvaluation formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        <TabsContent value="satisfaction" className="mt-6">
          <TabSatisfaction formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        <TabsContent value="convention" className="mt-6">
          <TabConventionDocs formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        <TabsContent value="elearning" className="mt-6">
          <TabElearning formation={formation} onRefresh={fetchFormation} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
