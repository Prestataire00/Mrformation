"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Package, RefreshCw, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface SessionAutomationStep {
  id: string;
  session_id: string;
  source_pack_id: string | null;
  order_index: number;
  trigger_type: string;
  days_offset: number | null;
  recipient_type: string;
  document_type: string | null;
  template_id: string | null;
  condition_subcontracted: boolean | null;
  send_email: boolean | null;
  name: string | null;
  description: string | null;
  is_enabled: boolean;
}

interface AutomationPack {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  entity_id: string;
}

/* ------------------------------------------------------------------ */
/* Trigger labels — copie de TabAutomation.tsx                        */
/* ------------------------------------------------------------------ */

const TRIGGER_LABELS: Record<string, string> = {
  session_start_minus_days: "Avant le début",
  session_end_plus_days: "Après la fin",
  on_session_creation: "À la création",
  on_session_completion: "À la clôture",
  on_enrollment: "À l'inscription",
  on_signature_complete: "Signatures complètes",
  opco_deposit_reminder: "Rappel dépôt OPCO",
  invoice_overdue: "Facture en retard",
  questionnaire_reminder: "Relance questionnaire",
  certificate_ready: "Certificat prêt",
};

/** Déclencheurs avec offset négatif (avant le début) */
const BEFORE_START_TRIGGERS = new Set(["session_start_minus_days", "opco_deposit_reminder"]);

function formatOffset(triggerType: string, daysOffset: number | null): string {
  if (daysOffset === null || daysOffset === 0) return "";
  if (BEFORE_START_TRIGGERS.has(triggerType)) {
    return ` J-${daysOffset}`;
  }
  return ` J+${daysOffset}`;
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

interface FormationAutomationTimelineProps {
  sessionId: string;
  onRefresh?: () => void;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function FormationAutomationTimeline({
  sessionId,
  onRefresh,
}: FormationAutomationTimelineProps) {
  const { toast } = useToast();

  const [steps, setSteps] = useState<SessionAutomationStep[]>([]);
  const [packId, setPackId] = useState<string | null>(null);
  const [packs, setPacks] = useState<AutomationPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [togglingStep, setTogglingStep] = useState<string | null>(null);

  /* -- Pack selector: pending selection before confirmation -- */
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  /* ---------------------------------------------------------------- */
  /* Data fetching                                                     */
  /* ---------------------------------------------------------------- */

  const fetchSteps = useCallback(async () => {
    try {
      const res = await fetch(`/api/formations/${sessionId}/automation-steps`);
      if (!res.ok) {
        const body: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      const data: { steps: SessionAutomationStep[]; automation_pack_id: string | null } =
        await res.json();
      setSteps(data.steps ?? []);
      setPackId(data.automation_pack_id ?? null);
    } catch (err) {
      toast({
        title: "Erreur de chargement de la timeline",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    }
  }, [sessionId, toast]);

  const fetchPacks = useCallback(async () => {
    try {
      const res = await fetch("/api/automation-packs");
      if (!res.ok) {
        const body: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      const data: { packs: AutomationPack[] } = await res.json();
      setPacks(data.packs ?? []);
    } catch (err) {
      toast({
        title: "Erreur de chargement des packs",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchSteps(), fetchPacks()]);
      setLoading(false);
    };
    void load();
  }, [fetchSteps, fetchPacks]);

  /* ---------------------------------------------------------------- */
  /* Apply pack                                                        */
  /* ---------------------------------------------------------------- */

  const handleApplyConfirm = async () => {
    if (!selectedPackId) return;
    setApplying(true);
    try {
      const res = await fetch(
        `/api/formations/${sessionId}/automation-steps/apply-pack`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pack_id: selectedPackId }),
        },
      );
      const data: { ok?: boolean; count?: number; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      toast({
        title: "Pack appliqué",
        description: `${data.count ?? 0} étape(s) configurée(s) pour cette formation.`,
      });
      setConfirmOpen(false);
      await fetchSteps();
      onRefresh?.();
    } catch (err) {
      toast({
        title: "Impossible d'appliquer le pack",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  const handlePackButtonClick = () => {
    if (!selectedPackId && packs.length > 0) {
      // Pre-select the current pack or first available
      setSelectedPackId(packId ?? packs[0].id);
    }
    setConfirmOpen(true);
  };

  /* ---------------------------------------------------------------- */
  /* Toggle step                                                       */
  /* ---------------------------------------------------------------- */

  const handleToggleStep = async (step: SessionAutomationStep, newValue: boolean) => {
    // Optimistic update
    setSteps((prev) =>
      prev.map((s) => (s.id === step.id ? { ...s, is_enabled: newValue } : s)),
    );
    setTogglingStep(step.id);
    try {
      const res = await fetch(`/api/formations/${sessionId}/automation-steps`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_id: step.id, is_enabled: newValue }),
      });
      const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      toast({
        title: newValue ? "Étape activée" : "Étape désactivée",
        description: step.name ?? step.document_type ?? "Étape mise à jour.",
      });
    } catch (err) {
      // Rollback on error
      setSteps((prev) =>
        prev.map((s) => (s.id === step.id ? { ...s, is_enabled: !newValue } : s)),
      );
      toast({
        title: "Erreur lors de la mise à jour",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setTogglingStep(null);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <Card className="mb-4">
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const currentPack = packs.find((p) => p.id === packId);
  const applyButtonLabel =
    steps.length === 0 ? "Appliquer un pack" : "Réappliquer / changer";

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-500" />
            Parcours d&apos;automatisation
            {currentPack && (
              <Badge variant="secondary" className="text-xs font-normal">
                {currentPack.name}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Barre pack */}
          <div className="flex items-center gap-2">
            <Select
              value={selectedPackId ?? packId ?? ""}
              onValueChange={(v) => setSelectedPackId(v)}
              disabled={packs.length === 0}
            >
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Sélectionner un pack…" />
              </SelectTrigger>
              <SelectContent>
                {packs.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant={steps.length === 0 ? "default" : "outline"}
              className="text-xs gap-1.5 shrink-0"
              onClick={handlePackButtonClick}
              disabled={packs.length === 0 || applying}
            >
              {applying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {applyButtonLabel}
            </Button>
          </div>

          {/* Liste des étapes ou empty state */}
          {steps.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 border border-dashed rounded-lg text-center">
              <Zap className="h-7 w-7 text-gray-300" />
              <p className="text-sm text-muted-foreground">
                Aucun parcours appliqué à cette formation
              </p>
              {packs.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Aucun pack disponible pour cette entité
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {steps.map((step) => {
                const label = step.name ?? step.document_type ?? step.trigger_type;
                const triggerLabel =
                  TRIGGER_LABELS[step.trigger_type] ?? step.trigger_type;
                const offsetStr = formatOffset(step.trigger_type, step.days_offset);
                return (
                  <div
                    key={step.id}
                    className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-2.5 transition-opacity ${
                      !step.is_enabled ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{label}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                        <Badge variant="outline" className="text-[10px] py-0 px-1">
                          {triggerLabel}
                          {offsetStr}
                        </Badge>
                        <span>→ {step.recipient_type}</span>
                      </div>
                    </div>
                    <Switch
                      checked={step.is_enabled}
                      onCheckedChange={(v) => handleToggleStep(step, v)}
                      disabled={togglingStep === step.id}
                      aria-label={`${step.is_enabled ? "Désactiver" : "Activer"} l'étape : ${label}`}
                      className="shrink-0"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appliquer le pack ?</DialogTitle>
            <DialogDescription>
              Ceci remplace la timeline actuelle par le pack ; les
              activations/désactivations locales seront perdues.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select
              value={selectedPackId ?? ""}
              onValueChange={(v) => setSelectedPackId(v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Sélectionner un pack…" />
              </SelectTrigger>
              <SelectContent>
                {packs.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={applying}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              onClick={handleApplyConfirm}
              disabled={!selectedPackId || applying}
            >
              {applying && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
