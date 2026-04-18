"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, Loader2, Eye, Calendar, FileText, PenLine,
  ClipboardCheck, GraduationCap, Euro, ShieldCheck, MessageSquare, Zap,
  Users, Clock, Briefcase, CheckCircle, RotateCcw, Copy, MoreHorizontal, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { useEntity } from "@/contexts/EntityContext";
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
import { TabQuestionnaires } from "./_components/TabQuestionnaires";
import { TabConventionDocs } from "./_components/TabConventionDocs";
import { TabElearning } from "./_components/TabElearning";
import { TabFinances } from "./_components/TabFinances";
import { TabQualiopi } from "./_components/TabQualiopi";
import { TabAutomation } from "./_components/TabAutomation";

const MODE_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

export default function FormationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { entityId } = useEntity();
  const supabase = createClient();
  const formationId = params.id as string;

  const [formation, setFormation] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Tab persistence via URL query param
  const initialTab = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  const fetchFormation = useCallback(async () => {
    if (!entityId) return;
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
        .eq("entity_id", entityId)
        .single();

      if (error) throw error;

      if (data?.formation_time_slots) {
        data.formation_time_slots.sort(
          (a: { slot_order: number }, b: { slot_order: number }) => a.slot_order - b.slot_order
        );
      }

      setFormation(data as unknown as Session);
    } catch (err) {
      console.error("Erreur chargement formation:", err);
      toast({ title: "Erreur", description: "Impossible de charger la formation", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [formationId, entityId, supabase, toast]);

  useEffect(() => {
    fetchFormation();
  }, [fetchFormation]);

  // KPI counts
  const kpis = useMemo(() => {
    if (!formation) return { enrollments: 0, docs: 0, slots: 0, qualiopi: 0 };
    return {
      enrollments: formation.enrollments?.length || 0,
      docs: formation.formation_convention_documents?.length || 0,
      slots: formation.formation_time_slots?.length || 0,
      qualiopi: (formation as unknown as { qualiopi_score?: number }).qualiopi_score || 0,
    };
  }, [formation]);

  // Tab definitions with counts
  const tabs = useMemo(() => [
    { value: "overview", label: "Résumé", icon: Eye },
    { value: "planning", label: "Planning", icon: Calendar, count: kpis.slots },
    { value: "documents", label: "Documents", icon: FileText, count: kpis.docs },
    { value: "emargement", label: "Émargement", icon: PenLine },
    { value: "questionnaires", label: "Questionnaires", icon: ClipboardCheck },
    { value: "elearning", label: "E-Learning", icon: GraduationCap },
    { value: "finances", label: "Finances", icon: Euro },
    { value: "qualiopi", label: "Qualiopi", icon: ShieldCheck },
    { value: "automation", label: "Automatisation", icon: Zap },
    { value: "communication", label: "Communication", icon: MessageSquare },
  ], [kpis]);

  // ── Complete / Reopen formation ──
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completing, setCompleting] = useState(false);

  const handleToggleComplete = async () => {
    const isCompleting = formation?.status !== "completed";
    setCompleting(true);
    try {
      const { error } = await supabase
        .from("sessions")
        .update({
          status: isCompleting ? "completed" : "in_progress",
          is_completed: isCompleting,
        })
        .eq("id", formationId)
        .eq("entity_id", entityId);
      if (error) throw error;

      if (isCompleting) {
        // Trigger on_session_completion automation rules
        fetch("/api/formations/automation-rules/trigger-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger_type: "on_session_completion", session_id: formationId }),
        }).catch((err) => console.error("[automation] on_session_completion:", err));
        toast({ title: "Formation terminée", description: "Les automatisations de clôture ont été déclenchées." });
      } else {
        toast({ title: "Formation rouverte" });
      }

      setCompleteDialogOpen(false);
      await fetchFormation();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  };

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
    <div className="p-6 space-y-5">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" className="mt-1" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{formation.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge className={cn("border-0", STATUS_COLORS[formation.status] || "bg-gray-100")}>
                {SESSION_STATUS_LABELS[formation.status] || formation.status}
              </Badge>
              {formation.type && (
                <Badge variant="outline" className={formation.type === "intra" ? "border-blue-300 text-blue-700" : "border-purple-300 text-purple-700"}>
                  {formation.type === "intra" ? "INTRA" : "INTER"}
                </Badge>
              )}
              <Badge variant="outline">
                {MODE_LABELS[formation.mode] || formation.mode}
              </Badge>
              {(formation as unknown as { is_subcontracted?: boolean }).is_subcontracted && (
                <Badge variant="outline" className="border-purple-300 text-purple-700 gap-1">
                  <Briefcase className="h-3 w-3" /> Sous-traitance
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Du {formatDate(formation.start_date)} au {formatDate(formation.end_date)}
              {formation.updated_at && <span className="ml-3">· Mis à jour le {formatDate(formation.updated_at)}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {formation.program_id && (
            <Link href={`/admin/programs/${formation.program_id}`}>
              <Button variant="outline" size="sm" className="text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Programme
              </Button>
            </Link>
          )}
          {formation.status !== "cancelled" && (
            formation.status === "completed" ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => setCompleteDialogOpen(true)}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Rouvrir
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                onClick={() => setCompleteDialogOpen(true)}
              >
                <CheckCircle className="h-3.5 w-3.5" /> Terminer
              </Button>
            )
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2 text-xs">
                <Copy className="h-3.5 w-3.5" /> Dupliquer la formation
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 text-xs text-red-600 focus:text-red-600">
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ═══ KPI CARDS ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-xl font-bold">{kpis.enrollments}</p>
              <p className="text-xs text-muted-foreground">Apprenants</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-purple-500" />
            <div>
              <p className="text-xl font-bold">{kpis.docs}</p>
              <p className="text-xs text-muted-foreground">Documents</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <div>
              <p className="text-xl font-bold">{kpis.slots}</p>
              <p className="text-xs text-muted-foreground">Créneaux</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xl font-bold">{kpis.qualiopi}%</p>
              <p className="text-xs text-muted-foreground">Qualiopi</p>
            </div>
          </div>
        </Card>
      </div>

      {/* ═══ 10 ONGLETS ATOMIQUES ═══ */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-0 overflow-x-auto flex-nowrap">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2.5 text-sm gap-1.5 shrink-0 whitespace-nowrap"
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 ml-0.5">{tab.count}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* 1. Résumé */}
        <TabsContent value="overview" className="mt-6">
          <TabResume formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        {/* 2. Planning */}
        <TabsContent value="planning" className="mt-6 space-y-8">
          <TabPlanning formation={formation} onRefresh={fetchFormation} />
          <TabParcours formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        {/* 3. Documents */}
        <TabsContent value="documents" className="mt-6 space-y-8">
          <TabConventionDocs formation={formation} onRefresh={fetchFormation} />
          <TabDocsPartages formation={formation} onRefresh={fetchFormation} />
          <TabProgramme formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        {/* 4. Émargement */}
        <TabsContent value="emargement" className="mt-6">
          <TabEmargements formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        {/* 5. Questionnaires */}
        <TabsContent value="questionnaires" className="mt-6">
          <TabQuestionnaires formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        {/* 6. E-Learning */}
        <TabsContent value="elearning" className="mt-6">
          <TabElearning formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        {/* 7. Finances */}
        <TabsContent value="finances" className="mt-6">
          <TabFinances formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        {/* 8. Qualiopi */}
        <TabsContent value="qualiopi" className="mt-6">
          <TabQualiopi formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        {/* 9. Automatisation */}
        <TabsContent value="automation" className="mt-6">
          <TabAutomation formation={formation} onRefresh={fetchFormation} />
        </TabsContent>

        {/* 10. Communication */}
        <TabsContent value="communication" className="mt-6 space-y-8">
          <TabMessagerie formation={formation} onRefresh={fetchFormation} />
          <TabAbsences formation={formation} onRefresh={fetchFormation} />
        </TabsContent>
      </Tabs>

      {/* ═══ DIALOG TERMINER / ROUVRIR ═══ */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {formation.status === "completed" ? "Rouvrir la formation ?" : "Terminer la formation ?"}
            </DialogTitle>
            <DialogDescription>
              {formation.status === "completed"
                ? "La formation repassera en statut 'En cours'. L'émargement et les documents seront de nouveau modifiables."
                : "Cela va verrouiller l'émargement et déclencher les automatisations de clôture (envoi certificats, questionnaires satisfaction, etc.)."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>Annuler</Button>
            <Button
              onClick={handleToggleComplete}
              disabled={completing}
              className={formation.status === "completed" ? "" : "bg-green-600 hover:bg-green-700 text-white"}
            >
              {completing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {formation.status === "completed" ? "Rouvrir" : "Terminer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
