"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2,
  Save,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Upload,
  Sparkles,
} from "lucide-react";

const BRAND = "#374151";

// Edit form - modules
export interface EditModule {
  id: number;
  title: string;
  duration_hours: string;
  topics: string; // one per line
}

// Edit form state
export interface EditFormState {
  title: string;
  description: string;
  objectives: string;
  duration_hours: string;
  duration_days: string;
  location: string;
  specialty: string;
  diploma: string;
  cpf_eligible: boolean;
  target_audience: string;
  prerequisites: string;
  team_description: string;
  evaluation_methods: string;
  pedagogical_resources: string;
  certification_results: string;
  certification_terms: string;
  certification_details: string;
}

interface EditProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editForm: EditFormState;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  editModules: EditModule[];
  setEditModules: React.Dispatch<React.SetStateAction<EditModule[]>>;
  onSave: () => Promise<void>;
  saving: boolean;
}

export function EditProgramDialog({
  open,
  onOpenChange,
  editForm,
  setEditForm,
  editModules,
  setEditModules,
  onSave,
  saving,
}: EditProgramDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);

  const handleAiExtract = async (file: File) => {
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/programs/ai-extract", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || `Erreur ${res.status}`);
      }

      const e = result.extracted;

      // Pre-fill the form with extracted data (only overwrite non-empty fields)
      setEditForm((prev) => ({
        ...prev,
        title: e.title || prev.title,
        description: e.description || prev.description,
        objectives: e.objectives || prev.objectives,
        duration_hours: e.duration_hours != null ? String(e.duration_hours) : prev.duration_hours,
        duration_days: e.duration_days != null ? String(e.duration_days) : prev.duration_days,
        location: e.location || prev.location,
        specialty: e.specialty || prev.specialty,
        diploma: e.diploma || prev.diploma,
        cpf_eligible: typeof e.cpf_eligible === "boolean" ? e.cpf_eligible : prev.cpf_eligible,
        target_audience: e.target_audience || prev.target_audience,
        prerequisites: e.prerequisites || prev.prerequisites,
        team_description: e.team_description || prev.team_description,
        evaluation_methods: e.evaluation_methods || prev.evaluation_methods,
        pedagogical_resources: e.pedagogical_resources || prev.pedagogical_resources,
        certification_results: e.certification_results || prev.certification_results,
        certification_terms: e.certification_terms || prev.certification_terms,
        certification_details: e.certification_details || prev.certification_details,
      }));

      // Pre-fill modules if extracted
      if (Array.isArray(e.modules) && e.modules.length > 0) {
        setEditModules(
          e.modules.map((m: { title: string; duration_hours: number | null; topics: string }, i: number) => ({
            id: i + 1,
            title: m.title || "",
            duration_hours: m.duration_hours != null ? String(m.duration_hours) : "",
            topics: m.topics || "",
          })),
        );
      }

      const moduleCount = Array.isArray(e.modules) ? e.modules.length : 0;
      toast({
        title: "Programme extrait",
        description: `${moduleCount} module${moduleCount > 1 ? "s" : ""} détecté${moduleCount > 1 ? "s" : ""}. Vérifiez et ajustez les champs.`,
      });
    } catch (err) {
      console.error("[EditProgramDialog] ai-extract failed:", err);
      toast({
        title: "Extraction échouée",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      {/* Hidden file input for AI extract */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleAiExtract(file);
        }}
      />

      {/* ── Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Modifier le programme</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs text-violet-700 border-violet-200 hover:bg-violet-50"
                disabled={extracting}
                onClick={() => fileInputRef.current?.click()}
              >
                {extracting ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extraction IA...</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" /> Remplir depuis un document</>
                )}
              </Button>
            </DialogTitle>
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
                  <Checkbox
                    checked={editForm.cpf_eligible}
                    onCheckedChange={(checked) =>
                      setEditForm((p) => ({ ...p, cpf_eligible: checked === true }))
                    }
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button
              onClick={onSave}
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
    </>
  );
}
