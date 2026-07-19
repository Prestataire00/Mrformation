"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";

import { BPF_FUNDING_LABELS, BPF_OBJECTIVE_LABELS } from "@/lib/bpf-labels";
import { BPF_TRAINEE_TYPE_LABELS } from "@/lib/bpf-labels";
import type { DataGapsResult } from "@/lib/bpf-calculator";
import type {
  BPFInvoice,
  BPFEnrollment,
  BPFTraining,
  BPFFormationTrainer,
  BPFSession,
} from "@/lib/services/bpf-report-service";
import {
  updateInvoiceBPF,
  updateEnrollmentBPF,
  batchUpdateEnrollmentsBPF,
  updateTrainingBPF,
  updateFormationTrainerCost,
  batchConfirmInvoiceDates,
} from "@/lib/services/bpf-report-service";

// ─── Props ─────────────────────────────────────────────────────

interface DataGapsPanelProps {
  gaps: DataGapsResult;
  invoices: BPFInvoice[];
  enrollments: BPFEnrollment[];
  trainings: BPFTraining[];
  formationTrainers: BPFFormationTrainer[];
  sessions: BPFSession[];
  onRefresh: () => void;
  entityId: string;
}

// ─── Component ─────────────────────────────────────────────────

export function DataGapsPanel({
  gaps,
  invoices,
  enrollments,
  trainings,
  formationTrainers,
  sessions,
  onRefresh,
  entityId,
}: DataGapsPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const totalGaps =
    gaps.invoices_sans_funding +
    gaps.invoices_non_confirmees +
    gaps.enrollments_sans_type +
    gaps.trainings_sans_objective +
    gaps.sessions_sans_cout;

  if (totalGaps === 0) return null;

  // Filter data to only show items with gaps
  const invoicesWithGaps = invoices.filter(
    (inv) => !inv.funding_type || !inv.invoice_date_confirmed
  );
  const enrollmentsWithGaps = enrollments.filter(
    (e) => e.status !== "cancelled" && !e.bpf_trainee_type
  );
  const trainingsWithGaps = trainings.filter((t) => !t.bpf_objective);
  const trainersWithGaps = formationTrainers.filter(
    (ft) => ft.agreed_cost_ht === null && (ft.hourly_rate === null || ft.hourly_rate === 0)
  );

  // Determine which tabs to show
  const tabs: Array<{ key: string; label: string; count: number }> = [];
  if (invoicesWithGaps.length > 0)
    tabs.push({ key: "invoices", label: "Factures", count: invoicesWithGaps.length });
  if (enrollmentsWithGaps.length > 0)
    tabs.push({ key: "enrollments", label: "Inscriptions", count: enrollmentsWithGaps.length });
  if (trainingsWithGaps.length > 0)
    tabs.push({ key: "trainings", label: "Formations", count: trainingsWithGaps.length });
  if (trainersWithGaps.length > 0)
    tabs.push({ key: "trainers", label: "Formateurs", count: trainersWithGaps.length });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-yellow-300 bg-yellow-50">
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between text-left">
              <CardTitle className="flex items-center gap-2 text-base">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Données à compléter
                <Badge variant="warning">{totalGaps} éléments</Badge>
              </CardTitle>
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            {tabs.length > 0 && (
              <Tabs defaultValue={tabs[0].key}>
                <TabsList>
                  {tabs.map((tab) => (
                    <TabsTrigger key={tab.key} value={tab.key}>
                      {tab.label} ({tab.count})
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="invoices" className="mt-4">
                  <InvoicesGapTable
                    invoices={invoicesWithGaps}
                    onRefresh={onRefresh}
                    entityId={entityId}
                  />
                </TabsContent>

                <TabsContent value="enrollments" className="mt-4">
                  <EnrollmentsGapTable
                    enrollments={enrollmentsWithGaps}
                    sessions={sessions}
                    onRefresh={onRefresh}
                  />
                </TabsContent>

                <TabsContent value="trainings" className="mt-4">
                  <TrainingsGapTable
                    trainings={trainingsWithGaps}
                    onRefresh={onRefresh}
                  />
                </TabsContent>

                <TabsContent value="trainers" className="mt-4">
                  <TrainersGapTable
                    formationTrainers={trainersWithGaps}
                    sessions={sessions}
                    onRefresh={onRefresh}
                  />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─── Invoices Gap Table ────────────────────────────────────────

function InvoicesGapTable({
  invoices,
  onRefresh,
  entityId,
}: {
  invoices: BPFInvoice[];
  onRefresh: () => void;
  entityId: string;
}) {
  const { toast } = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Fiabilisation "risque d'abord" : dates manquantes ou invalides et frontière
  // d'année civile (décembre/janvier = seul vrai risque d'attribution BPF)
  // remontent en tête pour vérification avant toute confirmation en masse.
  const sortedInvoices = [...invoices].sort((a, b) => {
    const risk = (inv: BPFInvoice) => {
      if (!inv.invoice_date) return 0;
      const m = new Date(inv.invoice_date).getMonth();
      if (Number.isNaN(m)) return 0;
      return m === 11 || m === 0 ? 0 : 1;
    };
    const ra = risk(a);
    const rb = risk(b);
    if (ra !== rb) return ra - rb;
    return (a.invoice_date || "").localeCompare(b.invoice_date || "");
  });

  const unconfirmedIds = invoices
    .filter((i) => !i.invoice_date_confirmed)
    .map((i) => i.id);

  async function handleBatchConfirm() {
    // Recompté à l'exécution pour un compteur de toast fidèle même si une
    // confirmation ligne-à-ligne est intervenue entre-temps.
    const ids = invoices.filter((i) => !i.invoice_date_confirmed).map((i) => i.id);
    if (ids.length === 0) return;
    setBatchLoading(true);
    try {
      await batchConfirmInvoiceDates(supabase, entityId, ids);
      toast({ title: `${ids.length} date(s) confirmée(s)` });
      onRefresh();
    } catch {
      toast({ title: "Erreur lors de la confirmation en masse", variant: "destructive" });
    } finally {
      setBatchLoading(false);
      setConfirming(false);
    }
  }

  async function handleUpdateFunding(invoiceId: string, fundingType: string) {
    setLoading(invoiceId);
    try {
      await updateInvoiceBPF(supabase, invoiceId, { funding_type: fundingType });
      toast({ title: "Catégorie mise à jour" });
      onRefresh();
    } catch {
      toast({ title: "Erreur lors de la mise à jour", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  async function handleConfirmDate(invoiceId: string) {
    setLoading(invoiceId);
    try {
      await updateInvoiceBPF(supabase, invoiceId, { invoice_date_confirmed: true });
      toast({ title: "Date confirmée" });
      onRefresh();
    } catch {
      toast({ title: "Erreur lors de la confirmation", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  async function handleUpdateDate(invoiceId: string, date: string) {
    setLoading(invoiceId);
    try {
      await updateInvoiceBPF(supabase, invoiceId, { invoice_date: date });
      toast({ title: "Date mise à jour" });
      onRefresh();
    } catch (e) {
      // Le verrou Abby (3.5) jette avec un message actionnable « créez un
      // avoir » — le faire remonter au lieu du générique
      toast({
        title: "Erreur lors de la mise à jour",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {unconfirmedIds.length > 0 && (
        <div className="flex items-center justify-between gap-2 pb-2 border-b">
          <p className="text-xs text-muted-foreground">
            Vérifiez d&apos;abord les factures de décembre/janvier (en tête) avant de confirmer en masse.
          </p>
          {confirming ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium">Confirmer {unconfirmedIds.length} date(s) ?</span>
              <Button size="sm" className="h-7 text-xs" onClick={handleBatchConfirm} disabled={batchLoading}>
                Oui
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setConfirming(false)}
                disabled={batchLoading}
              >
                Annuler
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs shrink-0"
              onClick={() => setConfirming(true)}
            >
              Confirmer les {unconfirmedIds.length} dates
            </Button>
          )}
        </div>
      )}
      <div className="grid grid-cols-[1fr_100px_140px_200px_120px] gap-2 text-xs font-medium text-muted-foreground px-2 pb-1 border-b">
        <span>Client / Formation</span>
        <span>Montant</span>
        <span>Date</span>
        <span>Catégorie</span>
        <span>Actions</span>
      </div>
      {sortedInvoices.map((inv) => (
        <div
          key={inv.id}
          className="grid grid-cols-[1fr_100px_140px_200px_120px] gap-2 items-center px-2 py-1.5 rounded hover:bg-yellow-100/50 text-sm"
        >
          <span className="truncate">
            {inv.recipient_name || inv.external_reference || "—"}
          </span>
          <span className="font-mono">
            {inv.amount.toLocaleString("fr-FR")} €
          </span>
          <Input
            type="date"
            defaultValue={inv.invoice_date?.slice(0, 10) || ""}
            className="h-7 text-xs"
            onBlur={(e) => {
              if (e.target.value && e.target.value !== inv.invoice_date?.slice(0, 10)) {
                handleUpdateDate(inv.id, e.target.value);
              }
            }}
            disabled={loading === inv.id}
          />
          <Select
            defaultValue={inv.funding_type || undefined}
            onValueChange={(val) => handleUpdateFunding(inv.id, val)}
            disabled={loading === inv.id}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Choisir..." />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(BPF_FUNDING_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => handleConfirmDate(inv.id)}
            disabled={loading === inv.id || inv.invoice_date_confirmed}
          >
            {inv.invoice_date_confirmed ? "Confirmée" : "Confirmer"}
          </Button>
        </div>
      ))}
    </div>
  );
}

// ─── Enrollments Gap Table ─────────────────────────────────────

function EnrollmentsGapTable({
  enrollments,
  sessions,
  onRefresh,
}: {
  enrollments: BPFEnrollment[];
  sessions: BPFSession[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState<string | null>(null);

  const sessionMap = new Map(sessions.map((s) => [s.id, s.title]));

  // Group enrollments by session for batch actions
  const bySession = new Map<string, BPFEnrollment[]>();
  for (const e of enrollments) {
    const arr = bySession.get(e.session_id) || [];
    arr.push(e);
    bySession.set(e.session_id, arr);
  }

  async function handleUpdate(enrollmentId: string, type: string) {
    setLoading(enrollmentId);
    try {
      await updateEnrollmentBPF(supabase, enrollmentId, type);
      toast({ title: "Type stagiaire mis à jour" });
      onRefresh();
    } catch {
      toast({ title: "Erreur lors de la mise à jour", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  async function handleBatchUpdate(sessionId: string) {
    const ids = (bySession.get(sessionId) || []).map((e) => e.id);
    if (ids.length === 0) return;
    setLoading(sessionId);
    try {
      await batchUpdateEnrollmentsBPF(supabase, ids, "salarie_prive");
      toast({ title: `${ids.length} inscriptions mises à jour` });
      onRefresh();
    } catch {
      toast({ title: "Erreur lors de la mise à jour batch", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4 max-h-96 overflow-y-auto">
      {Array.from(bySession.entries()).map(([sessionId, sessionEnrollments]) => (
        <div key={sessionId} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {sessionMap.get(sessionId) || sessionId}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => handleBatchUpdate(sessionId)}
              disabled={loading === sessionId}
            >
              Tout mettre à &quot;Salarié privé&quot;
            </Button>
          </div>
          {sessionEnrollments.map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[1fr_200px] gap-2 items-center px-2 py-1 rounded hover:bg-yellow-100/50 text-sm"
            >
              <span className="text-muted-foreground text-xs">
                Apprenant {e.learner_id.slice(0, 8)}...
              </span>
              <Select
                defaultValue={e.bpf_trainee_type || undefined}
                onValueChange={(val) => handleUpdate(e.id, val)}
                disabled={loading === e.id}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Type..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BPF_TRAINEE_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Trainings Gap Table ───────────────────────────────────────

function TrainingsGapTable({
  trainings,
  onRefresh,
}: {
  trainings: BPFTraining[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleUpdate(trainingId: string, objective: string) {
    setLoading(trainingId);
    try {
      await updateTrainingBPF(supabase, trainingId, objective);
      toast({ title: "Objectif BPF mis à jour" });
      onRefresh();
    } catch {
      toast({ title: "Erreur lors de la mise à jour", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      <div className="grid grid-cols-[1fr_280px] gap-2 text-xs font-medium text-muted-foreground px-2 pb-1 border-b">
        <span>Formation</span>
        <span>Objectif BPF</span>
      </div>
      {trainings.map((t) => (
        <div
          key={t.id}
          className="grid grid-cols-[1fr_280px] gap-2 items-center px-2 py-1.5 rounded hover:bg-yellow-100/50 text-sm"
        >
          <span className="truncate">{t.title}</span>
          <Select
            defaultValue={t.bpf_objective || undefined}
            onValueChange={(val) => handleUpdate(t.id, val)}
            disabled={loading === t.id}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Choisir objectif..." />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(BPF_OBJECTIVE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

// ─── Trainers Gap Table ────────────────────────────────────────

function TrainersGapTable({
  formationTrainers,
  sessions,
  onRefresh,
}: {
  formationTrainers: BPFFormationTrainer[];
  sessions: BPFSession[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const supabase = createClient();
  const [loading, setLoading] = useState<string | null>(null);

  const sessionMap = new Map(sessions.map((s) => [s.id, s.title]));

  async function handleUpdate(ftId: string, cost: number) {
    setLoading(ftId);
    try {
      await updateFormationTrainerCost(supabase, ftId, cost);
      toast({ title: "Coût formateur mis à jour" });
      onRefresh();
    } catch {
      toast({ title: "Erreur lors de la mise à jour", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      <div className="grid grid-cols-[1fr_1fr_140px] gap-2 text-xs font-medium text-muted-foreground px-2 pb-1 border-b">
        <span>Session</span>
        <span>Formateur</span>
        <span>Coût HT (€)</span>
      </div>
      {formationTrainers.map((ft) => {
        const trainer = Array.isArray(ft.trainers) ? ft.trainers[0] : ft.trainers;
        const trainerName = trainer
          ? `${trainer.first_name || ""} ${trainer.last_name || ""}`.trim()
          : ft.trainer_id.slice(0, 8);
        return (
          <div
            key={ft.id}
            className="grid grid-cols-[1fr_1fr_140px] gap-2 items-center px-2 py-1.5 rounded hover:bg-yellow-100/50 text-sm"
          >
            <span className="truncate">
              {sessionMap.get(ft.session_id) || ft.session_id.slice(0, 8)}
            </span>
            <span className="truncate">{trainerName}</span>
            <Input
              type="number"
              placeholder="0"
              className="h-7 text-xs"
              defaultValue={ft.agreed_cost_ht ?? ""}
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0) {
                  handleUpdate(ft.id, val);
                }
              }}
              disabled={loading === ft.id}
            />
          </div>
        );
      })}
    </div>
  );
}
