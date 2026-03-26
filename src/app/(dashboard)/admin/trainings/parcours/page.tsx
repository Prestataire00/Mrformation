"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Training } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  GraduationCap,
  Route,
  Clock,
  BookOpen,
  Pencil,
  Check,
  X,
  Search,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParcoursStep {
  id: string; // training id
  title: string;
  duration_hours: number | null;
  category: string | null;
  objectives: string | null;
  notes: string; // optional admin note for this step
}

interface Parcours {
  id: string;
  entity_id: string;
  title: string;
  description: string | null;
  objectives: string | null;
  is_active: boolean;
  content: {
    type: "parcours";
    steps: ParcoursStep[];
    total_hours: number;
  };
  created_at: string;
  updated_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function totalHours(steps: ParcoursStep[]): number {
  return steps.reduce((acc, s) => acc + (s.duration_hours ?? 0), 0);
}

function formatHours(h: number): string {
  if (h === 0) return "0h";
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h${mins.toString().padStart(2, "0")}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  Informatique: "bg-blue-100 text-blue-700",
  Management: "bg-purple-100 text-purple-700",
  Communication: "bg-pink-100 text-pink-700",
  RH: "bg-orange-100 text-orange-700",
  Finance: "bg-green-100 text-green-700",
  Vente: "bg-yellow-100 text-yellow-700",
  Sécurité: "bg-red-100 text-red-700",
  Qualité: "bg-teal-100 text-teal-700",
  Langues: "bg-indigo-100 text-indigo-700",
};

function getCategoryColor(cat: string | null): string {
  if (!cat) return "bg-gray-100 text-gray-600";
  return CATEGORY_COLORS[cat] || "bg-gray-100 text-gray-700";
}

// ─── Empty form defaults ──────────────────────────────────────────────────────

const emptyParcoursForm = {
  title: "",
  description: "",
  objectives: "",
};

// ─── Step Card Component ──────────────────────────────────────────────────────

interface StepCardProps {
  step: ParcoursStep;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onNoteChange: (note: string) => void;
}

function StepCard({
  step,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onRemove,
  onNoteChange,
}: StepCardProps) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(step.notes);

  const saveNote = () => {
    onNoteChange(noteValue);
    setEditingNote(false);
  };

  return (
    <div className="relative flex gap-0">
      {/* Timeline column */}
      <div className="flex flex-col items-center w-10 shrink-0">
        {/* Step circle */}
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold shadow-sm z-10 shrink-0">
          {index + 1}
        </div>
        {/* Vertical line (not shown for last item) */}
        {index < total - 1 && (
          <div className="flex-1 w-0.5 bg-indigo-200 my-1" style={{ minHeight: "32px" }} />
        )}
      </div>

      {/* Card */}
      <div
        className={cn(
          "flex-1 ml-3 mb-4 border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow",
          index === 0 && "ring-2 ring-indigo-100"
        )}
      >
        {/* Card header */}
        <div className="flex items-start gap-3 p-4 pb-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 shrink-0 mt-0.5">
            <GraduationCap className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 leading-tight">{step.title}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {step.category && (
                <Badge className={cn("text-xs", getCategoryColor(step.category))}>
                  {step.category}
                </Badge>
              )}
              {step.duration_hours != null && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  {formatHours(step.duration_hours)}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Monter"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={onMoveDown}
              disabled={index === total - 1}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Descendre"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              onClick={onRemove}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Supprimer cette étape"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Objectives preview */}
        {step.objectives && (
          <div className="px-4 pb-2">
            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{step.objectives}</p>
          </div>
        )}

        {/* Notes section */}
        <div className="px-4 pb-4">
          {editingNote ? (
            <div className="space-y-2">
              <textarea
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                rows={2}
                placeholder="Note interne pour cette étape..."
                className="w-full text-xs border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={saveNote}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  <Check className="h-3 w-3" />
                  Enregistrer
                </button>
                <button
                  onClick={() => {
                    setNoteValue(step.notes);
                    setEditingNote(false);
                  }}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X className="h-3 w-3" />
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingNote(true)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600 transition-colors"
            >
              <Pencil className="h-3 w-3" />
              {step.notes ? (
                <span className="italic text-gray-600 hover:text-indigo-600">{step.notes}</span>
              ) : (
                "Ajouter une note..."
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ParcoursPage() {
  const supabase = createClient();
  const { entity, entityId } = useEntity();
  const { toast } = useToast();
  const router = useRouter();

  // Parcours réservé à C3V Formation
  useEffect(() => {
    if (entity && entity.slug !== "c3v-formation") {
      router.replace("/admin/trainings");
    }
  }, [entity, router]);

  // Data
  const [parcoursList, setParcoursList] = useState<Parcours[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Selected parcours for the builder
  const [selectedParcours, setSelectedParcours] = useState<Parcours | null>(null);

  // Steps being edited (builder state)
  const [builderSteps, setBuilderSteps] = useState<ParcoursStep[]>([]);
  const [builderDirty, setBuilderDirty] = useState(false);

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyParcoursForm);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [stepSearch, setStepSearch] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [parcoursToDelete, setParcoursToDelete] = useState<Parcours | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const fetchParcours = useCallback(async () => {
    if (!entityId) return;
    const { data, error } = await supabase
      .from("programs")
      .select("*")
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les parcours.", variant: "destructive" });
      return;
    }

    // Filter to only parcours-type programs
    const parcoursData = (data || []).filter(
      (p: Record<string, unknown>) =>
        p.content &&
        typeof p.content === "object" &&
        (p.content as Record<string, unknown>).type === "parcours"
    ) as Parcours[];

    setParcoursList(parcoursData);
  }, [entityId, supabase, toast]);

  const fetchTrainings = useCallback(async () => {
    if (!entityId) return;
    const { data, error } = await supabase
      .from("trainings")
      .select("id, title, duration_hours, category, objectives, is_active")
      .eq("entity_id", entityId)
      .eq("is_active", true)
      .order("title");

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les formations.", variant: "destructive" });
      return;
    }
    setTrainings((data || []) as Training[]);
  }, [entityId, supabase, toast]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchParcours(), fetchTrainings()]);
      setLoading(false);
    };
    load();
  }, [fetchParcours, fetchTrainings]);

  // ── Builder sync ──────────────────────────────────────────────────────────

  const selectParcours = (p: Parcours) => {
    setSelectedParcours(p);
    setBuilderSteps(p.content?.steps ?? []);
    setBuilderDirty(false);
  };

  // ── Step operations ───────────────────────────────────────────────────────

  const addStep = (training: Training) => {
    // Avoid duplicates
    if (builderSteps.find((s) => s.id === training.id)) {
      toast({ title: "Déjà ajoutée", description: "Cette formation est déjà dans le parcours.", variant: "destructive" });
      return;
    }
    const newStep: ParcoursStep = {
      id: training.id,
      title: training.title,
      duration_hours: training.duration_hours,
      category: training.category,
      objectives: training.objectives,
      notes: "",
    };
    setBuilderSteps((prev) => [...prev, newStep]);
    setBuilderDirty(true);
    setAddStepOpen(false);
    setStepSearch("");
  };

  const removeStep = (index: number) => {
    setBuilderSteps((prev) => prev.filter((_, i) => i !== index));
    setBuilderDirty(true);
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    setBuilderSteps((prev) => {
      const next = [...prev];
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= next.length) return prev;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
    setBuilderDirty(true);
  };

  const updateStepNote = (index: number, note: string) => {
    setBuilderSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, notes: note } : s))
    );
    setBuilderDirty(true);
  };

  // ── Save builder ──────────────────────────────────────────────────────────

  const saveParcours = async () => {
    if (!selectedParcours) return;
    setSaving(true);

    const updatedContent = {
      type: "parcours" as const,
      steps: builderSteps,
      total_hours: totalHours(builderSteps),
    };

    const { error } = await supabase
      .from("programs")
      .update({
        content: updatedContent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedParcours.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Parcours sauvegardé", description: `"${selectedParcours.title}" a été mis à jour.` });
      setBuilderDirty(false);
      // Update local state
      setParcoursList((prev) =>
        prev.map((p) =>
          p.id === selectedParcours.id
            ? { ...p, content: updatedContent }
            : p
        )
      );
      setSelectedParcours((prev) =>
        prev ? { ...prev, content: updatedContent } : prev
      );
    }
    setSaving(false);
  };

  // ── Create parcours ───────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createForm.title.trim()) {
      toast({ title: "Titre requis", description: "Le titre du parcours est obligatoire.", variant: "destructive" });
      return;
    }
    if (!entityId) return;

    setSaving(true);
    const { data, error } = await supabase
      .from("programs")
      .insert({
        entity_id: entityId,
        title: createForm.title.trim(),
        description: createForm.description.trim() || null,
        objectives: createForm.objectives.trim() || null,
        is_active: true,
        content: {
          type: "parcours",
          steps: [],
          total_hours: 0,
        },
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    toast({ title: "Parcours créé", description: `"${createForm.title}" est prêt à être configuré.` });
    setCreateDialogOpen(false);
    setCreateForm(emptyParcoursForm);
    setSaving(false);

    await fetchParcours();

    // Auto-select the new parcours
    if (data) {
      selectParcours(data as Parcours);
    }
  };

  // ── Delete parcours ───────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!parcoursToDelete) return;
    setDeleting(true);

    const { error } = await supabase.from("programs").delete().eq("id", parcoursToDelete.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Parcours supprimé" });
      setDeleteDialogOpen(false);
      setParcoursToDelete(null);
      if (selectedParcours?.id === parcoursToDelete.id) {
        setSelectedParcours(null);
        setBuilderSteps([]);
        setBuilderDirty(false);
      }
      await fetchParcours();
    }
    setDeleting(false);
  };

  // ── Filtered trainings for "Add step" modal ───────────────────────────────

  const filteredTrainings = trainings.filter((t) => {
    if (!stepSearch) return true;
    return (
      t.title.toLowerCase().includes(stepSearch.toLowerCase()) ||
      (t.category?.toLowerCase().includes(stepSearch.toLowerCase()) ?? false)
    );
  });

  // Already added training IDs
  const addedIds = new Set(builderSteps.map((s) => s.id));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-gray-50">
      {/* ── Left panel: list of parcours ────────────────────────────────── */}
      <aside className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Route className="h-5 w-5 text-indigo-600" />
              <h2 className="font-bold text-gray-900 text-base">Parcours</h2>
            </div>
            <Button
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => {
                setCreateForm(emptyParcoursForm);
                setCreateDialogOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Créer
            </Button>
          </div>
          <p className="text-xs text-gray-400">
            {parcoursList.length} parcours de formation
          </p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="px-4 space-y-3 mt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : parcoursList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-gray-400">
              <Route className="h-10 w-10 mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">Aucun parcours</p>
              <p className="text-xs mt-1">Créez votre premier parcours de formation.</p>
            </div>
          ) : (
            <ul className="px-2 space-y-1">
              {parcoursList.map((p) => {
                const steps = p.content?.steps ?? [];
                const hours = p.content?.total_hours ?? 0;
                const isSelected = selectedParcours?.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => selectParcours(p)}
                      className={cn(
                        "w-full text-left px-3 py-3 rounded-xl transition-all group",
                        isSelected
                          ? "bg-indigo-50 border border-indigo-200 shadow-sm"
                          : "hover:bg-gray-50 border border-transparent"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-sm font-semibold leading-tight truncate",
                              isSelected ? "text-indigo-700" : "text-gray-800"
                            )}
                          >
                            {p.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400">
                              {steps.length} étape{steps.length !== 1 ? "s" : ""}
                            </span>
                            {hours > 0 && (
                              <>
                                <span className="text-gray-300">·</span>
                                <span className="flex items-center gap-1 text-xs text-gray-400">
                                  <Clock className="h-3 w-3" />
                                  {formatHours(hours)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setParcoursToDelete(p);
                            setDeleteDialogOpen(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Right panel: builder ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {!selectedParcours ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center mb-5">
              <Route className="h-9 w-9 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Circuit de Formation</h2>
            <p className="text-gray-500 text-sm max-w-sm mb-6">
              Sélectionnez un parcours dans la liste ou créez-en un nouveau pour commencer
              à modéliser votre circuit de formation.
            </p>
            <Button
              className="gap-2"
              onClick={() => {
                setCreateForm(emptyParcoursForm);
                setCreateDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Créer un parcours
            </Button>
          </div>
        ) : (
          <div className="p-6 max-w-2xl mx-auto">
            {/* Builder header */}
            <div className="mb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Route className="h-5 w-5 text-indigo-600 shrink-0" />
                    <h1 className="text-xl font-bold text-gray-900 leading-tight truncate">
                      {selectedParcours.title}
                    </h1>
                  </div>
                  {selectedParcours.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      {selectedParcours.description}
                    </p>
                  )}
                  {selectedParcours.objectives && (
                    <p className="text-xs text-indigo-600 mt-1 italic">
                      Objectif : {selectedParcours.objectives}
                    </p>
                  )}
                </div>
                {builderDirty && (
                  <Button onClick={saveParcours} disabled={saving} className="shrink-0 gap-2">
                    <Check className="h-4 w-4" />
                    {saving ? "Sauvegarde..." : "Sauvegarder"}
                  </Button>
                )}
              </div>

              {/* Summary stats */}
              <div className="flex items-center gap-4 mt-4 p-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900 leading-tight">
                      {builderSteps.length}
                    </p>
                    <p className="text-xs text-gray-400">étape{builderSteps.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900 leading-tight">
                      {formatHours(totalHours(builderSteps))}
                    </p>
                    <p className="text-xs text-gray-400">durée totale</p>
                  </div>
                </div>
                {builderDirty && (
                  <div className="ml-auto flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    Modifications non sauvegardées
                  </div>
                )}
              </div>
            </div>

            {/* Timeline builder */}
            <div className="space-y-0">
              {builderSteps.length === 0 ? (
                /* Empty steps state */
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-white">
                  <GraduationCap className="h-10 w-10 mb-3 text-gray-300" />
                  <p className="font-medium text-gray-500 mb-1">Aucune étape</p>
                  <p className="text-sm text-gray-400 mb-4">
                    Ajoutez des formations pour construire votre parcours.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setAddStepOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter une étape
                  </Button>
                </div>
              ) : (
                <>
                  {builderSteps.map((step, index) => (
                    <StepCard
                      key={`${step.id}-${index}`}
                      step={step}
                      index={index}
                      total={builderSteps.length}
                      onMoveUp={() => moveStep(index, "up")}
                      onMoveDown={() => moveStep(index, "down")}
                      onRemove={() => removeStep(index)}
                      onNoteChange={(note) => updateStepNote(index, note)}
                    />
                  ))}

                  {/* Add step button at the bottom of the timeline */}
                  <div className="relative flex gap-0 mt-2">
                    <div className="flex flex-col items-center w-10 shrink-0">
                      <div className="w-0.5 bg-indigo-200 h-4" />
                      <button
                        onClick={() => setAddStepOpen(true)}
                        className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-dashed border-indigo-300 text-indigo-400 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                        title="Ajouter une étape"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="ml-3 flex items-center pb-1 pt-4">
                      <button
                        onClick={() => setAddStepOpen(true)}
                        className="text-sm text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                      >
                        Ajouter une étape
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Dialog: Create parcours ───────────────────────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Route className="h-5 w-5 text-indigo-600" />
              Créer un parcours
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="parcours-title">
                Titre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="parcours-title"
                value={createForm.title}
                onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Ex: Parcours Manager Confirmé"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parcours-description">Description</Label>
              <Textarea
                id="parcours-description"
                value={createForm.description}
                onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                placeholder="Présentation générale du parcours..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parcours-objectives">Objectifs du parcours</Label>
              <Textarea
                id="parcours-objectives"
                value={createForm.objectives}
                onChange={(e) => setCreateForm((p) => ({ ...p, objectives: e.target.value }))}
                rows={2}
                placeholder="À l'issue de ce parcours, le participant sera capable de..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Création..." : "Créer le parcours"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Add step ─────────────────────────────────────────────── */}
      <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-indigo-600" />
              Ajouter une étape
            </DialogTitle>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={stepSearch}
              onChange={(e) => setStepSearch(e.target.value)}
              placeholder="Rechercher une formation..."
              className="pl-9"
              autoFocus
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-2 pb-2">
            {filteredTrainings.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <BookOpen className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">Aucune formation disponible</p>
              </div>
            ) : (
              filteredTrainings.map((t) => {
                const alreadyAdded = addedIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => !alreadyAdded && addStep(t)}
                    disabled={alreadyAdded}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border transition-all",
                      alreadyAdded
                        ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                        : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 cursor-pointer"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          alreadyAdded ? "bg-gray-100" : "bg-indigo-50"
                        )}
                      >
                        <GraduationCap
                          className={cn(
                            "h-4 w-4",
                            alreadyAdded ? "text-gray-400" : "text-indigo-600"
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 leading-tight truncate">
                          {t.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {t.category && (
                            <Badge className={cn("text-xs", getCategoryColor(t.category))}>
                              {t.category}
                            </Badge>
                          )}
                          {t.duration_hours != null && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Clock className="h-3 w-3" />
                              {formatHours(t.duration_hours)}
                            </span>
                          )}
                        </div>
                      </div>
                      {alreadyAdded && (
                        <Badge className="bg-green-100 text-green-700 text-xs shrink-0">
                          Ajoutée
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddStepOpen(false); setStepSearch(""); }}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Delete confirmation ───────────────────────────────────── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer le parcours</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Supprimer{" "}
            <strong>&quot;{parcoursToDelete?.title}&quot;</strong> ? Cette action est
            irréversible. Toutes les étapes configurées seront perdues.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
