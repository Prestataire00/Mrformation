"use client";

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
import {
  Loader2,
  Save,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
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
  return (
    <>
      {/* ── Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={onOpenChange}>
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
