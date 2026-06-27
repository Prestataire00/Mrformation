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
import { Loader2, Save } from "lucide-react";

const BRAND = "#374151";

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
  onSave: () => Promise<void>;
  saving: boolean;
}

export function EditProgramDialog({
  open,
  onOpenChange,
  editForm,
  setEditForm,
  onSave,
  saving,
}: EditProgramDialogProps) {
  return (
    <>
      {/* ── Edit Dialog (métadonnées uniquement — Lot C) ───────────────────── */}
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

            {/* Lot C : l'éditeur de séquences (modules) est retiré. Le contenu
                pédagogique se (re)génère via l'IA (« Générer avec l'IA »). */}

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
