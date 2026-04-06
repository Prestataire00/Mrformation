"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { formatDate } from "@/lib/utils";
import type { Program } from "@/lib/types";
import {
  ArrowLeft,
  Loader2,
  FileText,
  Download,
  Pencil,
  BookOpen,
  Clock,
  MapPin,
  Award,
  Users,
  ClipboardCheck,
  Lightbulb,
  Save,
  X,
  Sparkles,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Monitor,
  CalendarPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import ProgramEnrollments from "./_components/ProgramEnrollments";

// ── Simple markdown → HTML (bold, italic, lists, line breaks) ─────────────────
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul class="list-disc list-inside space-y-1 my-2">${match}</ul>`)
    .replace(/\n/g, "<br />");
}

// ── Split description into "Jour" blocks for grid layout ─────────────────────
function splitDescriptionByJour(text: string): string[] {
  // Split on "Jour N :" pattern but keep the delimiter
  const parts = text.split(/(?=Jour\s+\d+\s*:)/i).filter((s) => s.trim());
  return parts;
}

// ── Brand colors ─────────────────────────────────────────────────────────────
const BRAND = "#DC2626";
const BRAND_LIGHT = "rgba(61, 181, 197, 0.15)";
const BRAND_SECONDARY = "rgba(61, 181, 197, 0.4)";

// ── Metadata stored in content JSONB ─────────────────────────────────────────
interface ProgramMeta {
  modules?: {
    id: number;
    title: string;
    duration_hours?: number;
    objectives?: string[];
    topics?: string[];
  }[];
  duration_hours?: number;
  duration_days?: number;
  location?: string;
  specialty?: string;
  diploma?: string;
  cpf_eligible?: boolean;
  target_audience?: string;
  prerequisites?: string;
  team_description?: string;
  evaluation_methods?: string[];
  pedagogical_resources?: string[];
  certification_results?: string;
  certification_terms?: string;
  certification_details?: string;
}

// ── Divider component ────────────────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <div
      className="flex items-center w-full my-10 py-5 rounded-2xl"
      style={{ backgroundColor: BRAND_LIGHT }}
    >
      <span className="flex-grow h-px bg-gray-400 opacity-50" />
      <span className="mx-3 text-gray-500 text-sm font-normal uppercase tracking-wide">
        {label}
      </span>
      <span className="flex-grow h-px bg-gray-400 opacity-50" />
    </div>
  );
}

// ── Info card for Suivi / Certifications ─────────────────────────────────────
function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-5 pb-10 flex flex-col items-center text-center"
      style={{ backgroundColor: BRAND_SECONDARY }}
    >
      <div className="mb-4 flex flex-col items-center">
        <div
          className="w-[50px] h-[50px] rounded-full flex items-center justify-center mb-3"
          style={{ backgroundColor: BRAND }}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
        <p className="font-bold text-sm uppercase">{title}</p>
      </div>
      {children && (
        <div className="text-sm text-left w-full space-y-1">{children}</div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const programId = params.id as string;

  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Session creation
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [trainers, setTrainers] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [sessionForm, setSessionForm] = useState({
    startDate: "",
    endDate: "",
    mode: "presentiel" as "presentiel" | "distanciel" | "hybride",
    location: "",
    trainerId: "",
  });

  // Edit form - modules
  interface EditModule {
    id: number;
    title: string;
    duration_hours: string;
    topics: string; // one per line
  }
  const [editModules, setEditModules] = useState<EditModule[]>([]);

  // Edit form
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    objectives: "",
    duration_hours: "",
    duration_days: "",
    location: "",
    specialty: "",
    diploma: "",
    cpf_eligible: false,
    target_audience: "",
    prerequisites: "",
    team_description: "",
    evaluation_methods: "",
    pedagogical_resources: "",
    certification_results: "",
    certification_terms: "",
    certification_details: "",
  });

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchProgram = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("programs")
      .select("*")
      .eq("id", programId)
      .single();

    if (error || !data) {
      console.error("fetchProgram error:", error);
    } else {
      setProgram(data as Program);
    }
    setLoading(false);
  }, [programId, supabase]);

  useEffect(() => {
    fetchProgram();
  }, [fetchProgram]);

  // ── Parse metadata ─────────────────────────────────────────────────────────
  const meta: ProgramMeta = (program?.content as ProgramMeta) ?? {};

  // ── Open edit dialog ───────────────────────────────────────────────────────
  function openEdit() {
    if (!program) return;
    const m = (program.content as ProgramMeta) ?? {};
    setEditForm({
      title: program.title,
      description: program.description ?? "",
      objectives: program.objectives ?? "",
      duration_hours: m.duration_hours?.toString() ?? "",
      duration_days: m.duration_days?.toString() ?? "",
      location: m.location ?? "",
      specialty: m.specialty ?? "",
      diploma: m.diploma ?? "",
      cpf_eligible: m.cpf_eligible ?? false,
      target_audience: m.target_audience ?? "",
      prerequisites: m.prerequisites ?? "",
      team_description: m.team_description ?? "",
      evaluation_methods: (m.evaluation_methods ?? []).join("\n"),
      pedagogical_resources: (m.pedagogical_resources ?? []).join("\n"),
      certification_results: m.certification_results ?? "",
      certification_terms: m.certification_terms ?? "",
      certification_details: m.certification_details ?? "",
    });
    setEditModules(
      (m.modules ?? []).map((mod) => ({
        id: mod.id,
        title: mod.title,
        duration_hours: mod.duration_hours?.toString() ?? "",
        topics: (mod.topics ?? []).join("\n"),
      }))
    );
    setEditOpen(true);
  }

  // ── Save edit ──────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!program) return;
    setSaving(true);

    const modules = editModules.map((mod, idx) => ({
      id: mod.id || idx + 1,
      title: mod.title,
      duration_hours: mod.duration_hours ? parseFloat(mod.duration_hours) : undefined,
      objectives: [] as string[],
      topics: mod.topics ? mod.topics.split("\n").filter(Boolean) : [],
    }));

    const content: ProgramMeta = {
      ...(program.content as ProgramMeta),
      modules,
      duration_hours: editForm.duration_hours ? parseFloat(editForm.duration_hours) : undefined,
      duration_days: editForm.duration_days ? parseFloat(editForm.duration_days) : undefined,
      location: editForm.location || undefined,
      specialty: editForm.specialty || undefined,
      diploma: editForm.diploma || undefined,
      cpf_eligible: editForm.cpf_eligible,
      target_audience: editForm.target_audience || undefined,
      prerequisites: editForm.prerequisites || undefined,
      team_description: editForm.team_description || undefined,
      evaluation_methods: editForm.evaluation_methods
        ? editForm.evaluation_methods.split("\n").filter(Boolean)
        : undefined,
      pedagogical_resources: editForm.pedagogical_resources
        ? editForm.pedagogical_resources.split("\n").filter(Boolean)
        : undefined,
      certification_results: editForm.certification_results || undefined,
      certification_terms: editForm.certification_terms || undefined,
      certification_details: editForm.certification_details || undefined,
    };

    const { error } = await supabase
      .from("programs")
      .update({
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        objectives: editForm.objectives.trim() || null,
        content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", program.id);

    setSaving(false);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Programme mis à jour" });
    setEditOpen(false);
    fetchProgram();
  }

  // ── Generate with AI ────────────────────────────────────────────────────
  async function handleGenerateAI() {
    if (!program) return;
    setGenerating(true);

    try {
      const m = (program.content as ProgramMeta) ?? {};
      const res = await fetch("/api/ai/generate-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: program.title,
          duration_hours: m.duration_hours,
          target_audience: m.target_audience,
          structured: true,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        toast({
          title: "Erreur IA",
          description: json.error || "Impossible de générer le contenu.",
          variant: "destructive",
        });
        setGenerating(false);
        return;
      }

      const ai = json.data;

      // Merge AI content into program
      const newContent: ProgramMeta = {
        ...m,
        modules: ai.modules ?? m.modules,
        duration_hours: ai.duration_hours ?? m.duration_hours,
        duration_days: ai.duration_days ?? m.duration_days,
        target_audience: ai.target_audience ?? m.target_audience,
        prerequisites: ai.prerequisites ?? m.prerequisites,
        location: ai.location ?? m.location,
        evaluation_methods: ai.evaluation_methods ?? m.evaluation_methods,
        pedagogical_resources: ai.pedagogical_resources ?? m.pedagogical_resources,
        team_description: ai.team_description ?? m.team_description,
        certification_results: ai.certification_results ?? m.certification_results,
      };

      const { error } = await supabase
        .from("programs")
        .update({
          description: ai.description || program.description,
          objectives: ai.objectives || program.objectives,
          content: newContent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", program.id);

      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Contenu généré par l'IA", description: "Le programme a été enrichi avec succès." });
        fetchProgram();
      }
    } catch (err) {
      console.error("AI generation error:", err);
      toast({ title: "Erreur", description: "Erreur de connexion à l'IA.", variant: "destructive" });
    }

    setGenerating(false);
  }

  // ── Open session dialog ─────────────────────────────────────────────────────
  async function openSessionDialog() {
    if (!program) return;
    setSessionForm({
      startDate: "",
      endDate: "",
      mode: "presentiel",
      location: "",
      trainerId: "",
    });
    // Fetch trainers for this entity
    const { data } = await supabase
      .from("trainers")
      .select("id, first_name, last_name")
      .eq("entity_id", program.entity_id)
      .order("last_name");
    setTrainers(data ?? []);
    setSessionDialogOpen(true);
  }

  // ── Create session from program ─────────────────────────────────────────────
  async function handleCreateSession() {
    if (!program) return;
    if (!sessionForm.startDate || !sessionForm.endDate) {
      toast({ title: "Erreur", description: "Les dates de début et de fin sont requises.", variant: "destructive" });
      return;
    }
    setCreatingSession(true);

    try {
      // 1. Check if a training already exists for this program
      const { data: existingTrainings, error: fetchError } = await supabase
        .from("trainings")
        .select("id")
        .eq("program_id", program.id)
        .eq("entity_id", program.entity_id)
        .limit(1);

      if (fetchError) {
        toast({ title: "Erreur", description: fetchError.message, variant: "destructive" });
        setCreatingSession(false);
        return;
      }

      let trainingId: string;

      if (existingTrainings && existingTrainings.length > 0) {
        trainingId = existingTrainings[0].id;
      } else {
        // 2. Create a training from this program
        const { data: newTraining, error: trainingError } = await supabase
          .from("trainings")
          .insert({
            entity_id: program.entity_id,
            title: program.title,
            program_id: program.id,
            duration_hours: program.duration_hours || null,
            price_per_person: program.price || null,
            nsf_code: program.nsf_code || null,
            nsf_label: program.nsf_label || null,
            bpf_objective: program.bpf_objective || null,
            bpf_funding_type: program.bpf_funding_type || null,
            is_active: true,
          })
          .select("id")
          .single();

        if (trainingError || !newTraining) {
          toast({ title: "Erreur", description: trainingError?.message || "Impossible de créer la formation.", variant: "destructive" });
          setCreatingSession(false);
          return;
        }
        trainingId = newTraining.id;
      }

      // 3. Create the session
      const { data: newSession, error: sessionError } = await supabase
        .from("sessions")
        .insert({
          entity_id: program.entity_id,
          training_id: trainingId,
          program_id: program.id,
          title: program.title,
          start_date: sessionForm.startDate,
          end_date: sessionForm.endDate,
          mode: sessionForm.mode,
          location: sessionForm.location || null,
          status: "upcoming",
          trainer_id: sessionForm.trainerId || null,
        })
        .select("id")
        .single();

      if (sessionError || !newSession) {
        toast({ title: "Erreur", description: sessionError?.message || "Impossible de créer la session.", variant: "destructive" });
        setCreatingSession(false);
        return;
      }

      toast({ title: "Session créée avec succès" });
      setSessionDialogOpen(false);
      router.push(`/admin/formations/${newSession.id}`);
    } catch (err) {
      console.error("Session creation error:", err);
      toast({ title: "Erreur", description: "Une erreur inattendue est survenue.", variant: "destructive" });
    }

    setCreatingSession(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: BRAND }} />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Programme introuvable.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Retour
        </Button>
      </div>
    );
  }

  const durationText = [
    meta.duration_hours ? `${meta.duration_hours} Heures` : null,
    meta.duration_days ? `${meta.duration_days} Jours` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <div className="bg-white min-h-screen">
      {/* Back nav */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <button
          onClick={() => router.push("/admin/programs")}
          className="mb-3 flex items-center gap-1.5 text-xs font-medium transition"
          style={{ color: BRAND }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour aux programmes
        </button>
        <h1 className="text-lg font-medium text-gray-600">
          Bibliothèque /{" "}
          <span className="font-bold text-gray-900">Résumé du Programme</span>
        </h1>
      </div>

      <div className="max-w-[1200px] mx-auto p-5 md:p-10">
        {/* ── Title ──────────────────────────────────────────────────────── */}
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
          {program.title}
        </h2>

        {/* ── Hero Grid ──────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-8 mb-10">
          {/* Entity logo */}
          <div className="w-full max-w-[400px] h-[300px] rounded-3xl bg-gradient-to-br from-[#DC2626]/20 to-[#DC2626]/5 flex items-center justify-center overflow-hidden">
            <img
              src="/mr-formation-img-bibliotheque.png"
              alt="MR Formation"
              className="w-full h-full object-contain p-6"
            />
          </div>

          {/* Metadata */}
          <div className="flex-1 space-y-2 text-gray-800">
            <p>
              <span className="font-medium">Version :</span> {program.version}
            </p>
            <p>
              <span className="font-medium">Date de Création :</span>{" "}
              {formatDate(program.created_at)}
            </p>
            <p>
              <span className="font-medium">Eligible au CPF :</span>{" "}
              {meta.cpf_eligible ? "Oui" : "Non"}
            </p>
            {durationText && (
              <p>
                <span className="font-medium">Durée :</span> {durationText}
              </p>
            )}
            {meta.location && (
              <p>
                <span className="font-medium">Emplacement :</span> {meta.location}
              </p>
            )}
            {meta.specialty && (
              <p>
                <span className="font-medium">Spécialité de Formation :</span>{" "}
                {meta.specialty}
              </p>
            )}
            <p>
              <span className="font-medium">Diplôme :</span>{" "}
              {meta.diploma || "Aucun"}
            </p>
            <p>
              <span className="font-medium">Statut :</span>{" "}
              <Badge
                variant="outline"
                className={
                  program.is_active
                    ? "border-green-300 text-green-700 bg-green-50"
                    : "border-gray-300 text-gray-600"
                }
              >
                {program.is_active ? "Actif" : "Inactif"}
              </Badge>
            </p>

            <div className="pt-4 flex flex-wrap gap-3">
              <Button
                size="sm"
                className="rounded-full gap-2 text-white"
                style={{ backgroundColor: BRAND }}
                onClick={openEdit}
              >
                <Pencil className="w-3.5 h-3.5" />
                Modifier
              </Button>
              <Button
                size="sm"
                className="rounded-full gap-2 text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                onClick={handleGenerateAI}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {generating ? "Génération en cours..." : "Générer avec l'IA"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full gap-2"
                onClick={() => {
                  const printWindow = window.open(window.location.href, '_blank');
                  if (printWindow) {
                    printWindow.addEventListener('afterprint', () => printWindow.close());
                    printWindow.onload = () => {
                      setTimeout(() => printWindow.print(), 500);
                    };
                  }
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Exporter (PDF)
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={() => {
                  const params = new URLSearchParams({
                    from_program: program.id,
                    title: program.title,
                    ...(program.objectives ? { objectives: program.objectives } : {}),
                    ...(meta.duration_hours ? { duration: String(meta.duration_hours) } : {}),
                  });
                  router.push(`/admin/trainings?${params.toString()}`);
                }}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                Créer une formation
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full gap-2 border-green-300 text-green-700 hover:bg-green-50"
                onClick={openSessionDialog}
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                Créer une session
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
                onClick={() => {
                  const params = new URLSearchParams({
                    from_program: program.id,
                    title: program.title,
                    ...(program.objectives ? { objectives: program.objectives } : {}),
                  });
                  router.push(`/admin/elearning/create?${params.toString()}`);
                }}
              >
                <Monitor className="w-3.5 h-3.5" />
                Générer un E-Learning
              </Button>
            </div>
          </div>
        </div>

        {/* ── Description ────────────────────────────────────────────────── */}
        <SectionDivider label="Description du programme" />
        <div className="text-gray-800 leading-relaxed mb-10">
          {program.description ? (() => {
            const jourBlocks = splitDescriptionByJour(program.description!);
            // If multiple "Jour" blocks found, display in grid
            if (jourBlocks.length > 1) {
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {jourBlocks.map((block, idx) => {
                    // Extract "Jour N : title (Xh)" as the header
                    const lines = block.trim().split("\n");
                    const header = lines[0];
                    const body = lines.slice(1).join("\n");
                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-gray-200 p-5 bg-gray-50/50"
                      >
                        <h4
                          className="font-bold text-sm mb-3 pb-2 border-b"
                          style={{ color: BRAND, borderColor: `${BRAND}40` }}
                        >
                          {header}
                        </h4>
                        <div
                          className="text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            }
            // Fallback: single block
            return (
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(program.description!) }} />
            );
          })() : (
            <p className="text-gray-400 italic">Aucune description renseignée.</p>
          )}
        </div>

        {/* ── Objectifs ──────────────────────────────────────────────────── */}
        <SectionDivider label="Objectifs pédagogiques" />
        <div className="space-y-2 mb-10">
          {program.objectives ? (
            <div
              className="text-gray-800 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(program.objectives) }}
            />
          ) : (
            <p className="text-gray-400 italic">Aucun objectif renseigné.</p>
          )}
        </div>

        {/* ── Profils des apprenants ──────────────────────────────────────── */}
        <SectionDivider label="Profils des apprenants" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <div className="flex flex-col space-y-3">
            <div className="flex items-center gap-4">
              <div
                className="w-[50px] h-[50px] rounded-full flex items-center justify-center"
                style={{ backgroundColor: BRAND }}
              >
                <Users className="w-6 h-6 text-white" />
              </div>
              <span className="font-medium pt-1">Pour Qui ?</span>
            </div>
            <p className="text-gray-700 ml-16">
              {meta.target_audience || (
                <span className="text-gray-400 italic">Non renseigné</span>
              )}
            </p>
          </div>
          <div className="flex flex-col space-y-3">
            <div className="flex items-center gap-4">
              <div
                className="w-[50px] h-[50px] rounded-full flex items-center justify-center"
                style={{ backgroundColor: BRAND }}
              >
                <ClipboardCheck className="w-6 h-6 text-white" />
              </div>
              <span className="font-medium pt-1">Pré-requis :</span>
            </div>
            <p className="text-gray-700 ml-16">
              {meta.prerequisites || (
                <span className="text-gray-400 italic">Aucun</span>
              )}
            </p>
          </div>
        </div>

        {/* ── Contenu de la formation ─────────────────────────────────────── */}
        <SectionDivider label="Contenu de la formation" />
        {meta.modules && meta.modules.length > 0 ? (
          <div className="space-y-4 mb-10">
            {meta.modules.map((mod, i) => (
              <div
                key={mod.id ?? i}
                className="border border-gray-200 rounded-xl p-4"
              >
                <div className="flex items-center gap-3 mb-2">
                  <Badge
                    className="text-white text-xs"
                    style={{ backgroundColor: BRAND }}
                  >
                    Module {i + 1}
                  </Badge>
                  <h4 className="font-semibold text-gray-900">{mod.title}</h4>
                  {mod.duration_hours && (
                    <span className="text-xs text-gray-500 ml-auto">
                      {mod.duration_hours}h
                    </span>
                  )}
                </div>
                {mod.objectives && mod.objectives.length > 0 && (
                  <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 ml-2">
                    {mod.objectives.map((obj, j) => (
                      <li key={j}>{obj}</li>
                    ))}
                  </ul>
                )}
                {mod.topics && mod.topics.length > 0 && (
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-2 mt-2">
                    {mod.topics.map((t, j) => (
                      <li key={j}>{t}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 italic mb-10">Aucun module défini.</p>
        )}

        {/* ── Suivi de l'exécution ────────────────────────────────────────── */}
        <SectionDivider label="Suivi de l'exécution" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <InfoCard icon={Users} title="Équipe Pédagogique">
            {meta.team_description && (
              <p className="text-sm">{meta.team_description}</p>
            )}
          </InfoCard>

          <InfoCard icon={ClipboardCheck} title="Suivi de l'exécution et évaluation des résultats">
            {meta.evaluation_methods && meta.evaluation_methods.length > 0 ? (
              meta.evaluation_methods.map((m, i) => (
                <p key={i}>&#10070; {m}</p>
              ))
            ) : (
              <p className="text-gray-500 italic text-center">Non renseigné</p>
            )}
          </InfoCard>

          <InfoCard icon={Lightbulb} title="Ressources techniques et pédagogiques">
            {meta.pedagogical_resources && meta.pedagogical_resources.length > 0 ? (
              meta.pedagogical_resources.map((r, i) => (
                <p key={i}>&#10070; {r}</p>
              ))
            ) : (
              <p className="text-gray-500 italic text-center">Non renseigné</p>
            )}
          </InfoCard>
        </div>

        {/* ── Modalités de Certifications ──────────────────────────────────── */}
        <SectionDivider label="Modalités de Certifications" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <InfoCard icon={Award} title="Résultats attendus à l'issue de la formation">
            {meta.certification_results && (
              <p className="text-sm">{meta.certification_results}</p>
            )}
          </InfoCard>
          <InfoCard icon={FileText} title="Modalités d'obtention">
            {meta.certification_terms && (
              <p className="text-sm">{meta.certification_terms}</p>
            )}
          </InfoCard>
          <InfoCard icon={Award} title="Détails sur la certification">
            {meta.certification_details && (
              <p className="text-sm">{meta.certification_details}</p>
            )}
          </InfoCard>
        </div>
      </div>

      {/* ── Apprenants inscrits ─────────────────────────────────────────────── */}
      <SectionDivider label="Apprenants inscrits au parcours" />
      <ProgramEnrollments programId={program.id} modules={meta.modules ?? []} />

      {/* ── Create Session Dialog ──────────────────────────────────────────── */}
      <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Créer une session</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Date de début */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Date de début <span className="text-red-500">*</span>
              </label>
              <Input
                type="datetime-local"
                value={sessionForm.startDate}
                onChange={(e) =>
                  setSessionForm((p) => ({ ...p, startDate: e.target.value }))
                }
              />
            </div>

            {/* Date de fin */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Date de fin <span className="text-red-500">*</span>
              </label>
              <Input
                type="datetime-local"
                value={sessionForm.endDate}
                onChange={(e) =>
                  setSessionForm((p) => ({ ...p, endDate: e.target.value }))
                }
              />
            </div>

            {/* Mode */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Mode</label>
              <Select
                value={sessionForm.mode}
                onValueChange={(value) =>
                  setSessionForm((p) => ({
                    ...p,
                    mode: value as "presentiel" | "distanciel" | "hybride",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="presentiel">Présentiel</SelectItem>
                  <SelectItem value="distanciel">Distanciel</SelectItem>
                  <SelectItem value="hybride">Hybride</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Lieu (only for presentiel or hybride) */}
            {(sessionForm.mode === "presentiel" || sessionForm.mode === "hybride") && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Lieu</label>
                <Input
                  value={sessionForm.location}
                  onChange={(e) =>
                    setSessionForm((p) => ({ ...p, location: e.target.value }))
                  }
                  placeholder="Adresse ou salle de formation"
                />
              </div>
            )}

            {/* Formateur */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Formateur</label>
              <Select
                value={sessionForm.trainerId}
                onValueChange={(value) =>
                  setSessionForm((p) => ({ ...p, trainerId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un formateur" />
                </SelectTrigger>
                <SelectContent>
                  {trainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.first_name} {t.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSessionDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleCreateSession}
              disabled={creatingSession}
              style={{ backgroundColor: BRAND }}
              className="text-white"
            >
              {creatingSession ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CalendarPlus className="w-4 h-4 mr-2" />
              )}
              {creatingSession ? "Création..." : "Créer la session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le programme</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Titre <span className="text-red-500">*</span>
              </label>
              <Input
                value={editForm.title}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, title: e.target.value }))
                }
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description du programme</label>
              <Textarea
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, description: e.target.value }))
                }
                rows={6}
              />
            </div>

            {/* Objectives */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Objectifs pédagogiques</label>
              <Textarea
                value={editForm.objectives}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, objectives: e.target.value }))
                }
                rows={4}
                placeholder="Un objectif par ligne..."
              />
            </div>

            {/* Duration + CPF */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Durée (heures)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={editForm.duration_hours}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, duration_hours: e.target.value }))
                  }
                  placeholder="10.5"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Durée (jours)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={editForm.duration_days}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, duration_days: e.target.value }))
                  }
                  placeholder="3"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Eligible CPF</label>
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    checked={editForm.cpf_eligible}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, cpf_eligible: e.target.checked }))
                    }
                    className="rounded"
                  />
                  <span className="text-sm text-gray-600">Oui</span>
                </div>
              </div>
            </div>

            {/* Location, Specialty, Diploma */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Emplacement</label>
                <Input
                  value={editForm.location}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, location: e.target.value }))
                  }
                  placeholder="Formation en présentiel"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Spécialité</label>
                <Input
                  value={editForm.specialty}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, specialty: e.target.value }))
                  }
                  placeholder="100 - Formations générales"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Diplôme</label>
                <Input
                  value={editForm.diploma}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, diploma: e.target.value }))
                  }
                  placeholder="Aucun"
                />
              </div>
            </div>

            {/* Profils */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Public cible (Pour Qui)</label>
                <Input
                  value={editForm.target_audience}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, target_audience: e.target.value }))
                  }
                  placeholder="Secrétaire médicale"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Pré-requis</label>
                <Input
                  value={editForm.prerequisites}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, prerequisites: e.target.value }))
                  }
                  placeholder="Aucun"
                />
              </div>
            </div>

            {/* Modules / Contenu de la formation */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Contenu de la formation (Modules)
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() =>
                    setEditModules((prev) => [
                      ...prev,
                      {
                        id: prev.length + 1,
                        title: "",
                        duration_hours: "",
                        topics: "",
                      },
                    ])
                  }
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter un module
                </Button>
              </div>

              {editModules.length === 0 && (
                <p className="text-xs text-gray-400 italic">Aucun module défini.</p>
              )}

              {editModules.map((mod, idx) => (
                <div
                  key={idx}
                  className="border rounded-lg p-3 space-y-2 bg-gray-50/50"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      className="text-white text-xs shrink-0"
                      style={{ backgroundColor: BRAND }}
                    >
                      Module {idx + 1}
                    </Badge>
                    <Input
                      value={mod.title}
                      onChange={(e) => {
                        const updated = [...editModules];
                        updated[idx] = { ...updated[idx], title: e.target.value };
                        setEditModules(updated);
                      }}
                      placeholder="Titre du module"
                      className="flex-1 text-sm h-8"
                    />
                    <Input
                      value={mod.duration_hours}
                      onChange={(e) => {
                        const updated = [...editModules];
                        updated[idx] = { ...updated[idx], duration_hours: e.target.value };
                        setEditModules(updated);
                      }}
                      placeholder="Heures"
                      type="number"
                      min="0"
                      step="0.25"
                      className="w-20 text-sm h-8"
                    />
                    <div className="flex gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === 0}
                        onClick={() => {
                          const updated = [...editModules];
                          [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
                          setEditModules(updated);
                        }}
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === editModules.length - 1}
                        onClick={() => {
                          const updated = [...editModules];
                          [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
                          setEditModules(updated);
                        }}
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          setEditModules((prev) => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={mod.topics}
                    onChange={(e) => {
                      const updated = [...editModules];
                      updated[idx] = { ...updated[idx], topics: e.target.value };
                      setEditModules(updated);
                    }}
                    rows={3}
                    placeholder="Un sujet par ligne..."
                    className="text-xs"
                  />
                </div>
              ))}
            </div>

            {/* Suivi */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Équipe pédagogique</label>
              <Textarea
                value={editForm.team_description}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, team_description: e.target.value }))
                }
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Méthodes d&apos;évaluation{" "}
                <span className="text-xs text-gray-400">(une par ligne)</span>
              </label>
              <Textarea
                value={editForm.evaluation_methods}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, evaluation_methods: e.target.value }))
                }
                rows={3}
                placeholder="Test de positionnement&#10;Évaluation des acquis&#10;Évaluation de l'impact"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Ressources pédagogiques{" "}
                <span className="text-xs text-gray-400">(une par ligne)</span>
              </label>
              <Textarea
                value={editForm.pedagogical_resources}
                onChange={(e) =>
                  setEditForm((p) => ({
                    ...p,
                    pedagogical_resources: e.target.value,
                  }))
                }
                rows={3}
                placeholder="Alternance d'apports théoriques et pratiques&#10;Ateliers de mise en pratique"
              />
            </div>

            {/* Certifications */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Résultats attendus (certification)</label>
              <Textarea
                value={editForm.certification_results}
                onChange={(e) =>
                  setEditForm((p) => ({
                    ...p,
                    certification_results: e.target.value,
                  }))
                }
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Modalités d&apos;obtention</label>
                <Textarea
                  value={editForm.certification_terms}
                  onChange={(e) =>
                    setEditForm((p) => ({
                      ...p,
                      certification_terms: e.target.value,
                    }))
                  }
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Détails certification</label>
                <Textarea
                  value={editForm.certification_details}
                  onChange={(e) =>
                    setEditForm((p) => ({
                      ...p,
                      certification_details: e.target.value,
                    }))
                  }
                  rows={2}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ backgroundColor: BRAND }}
              className="text-white"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
