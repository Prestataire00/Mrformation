"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";

import type { Session } from "@/lib/types";
import { computeSessionBpfSummary } from "@/lib/bpf-calculator";
import type { SessionBpfSummary } from "@/lib/bpf-calculator";
import { BPF_TRAINEE_TYPE_LABELS } from "@/lib/bpf-labels";
import { FINANCIAL_LINES } from "@/components/bpf/types";
import {
  fetchBPFDataForSession,
  fetchValidatorName,
  validateSessionBPF,
  unvalidateSessionBPF,
} from "@/lib/services/bpf-report-service";
import type {
  BPFInvoice,
  BPFEnrollment,
  BPFTraining,
  BPFFormationTrainer,
  BPFSession,
} from "@/lib/services/bpf-report-service";
import { DataGapsPanel } from "@/components/bpf/DataGapsPanel";

// ─── Props ─────────────────────────────────────────────────────

interface TabBpfProps {
  formation: Session;
  onRefresh: () => Promise<void>;
}

// ─── Helpers ───────────────────────────────────────────────────

const fmtEur = (val: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(val || 0);

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR") : "";

// Libellés courts des lignes Cadre C (hors lignes d'agrégat / total).
const C_LINE_LABELS: Record<string, string> = Object.fromEntries(
  FINANCIAL_LINES.filter((l) => !l.isTotal && l.key !== "line_2").map((l) => [
    l.key,
    l.label,
  ])
);

// ─── Component ─────────────────────────────────────────────────

export function TabBpf({ formation, onRefresh }: TabBpfProps) {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();

  const sessionId = formation.id;
  const year = useMemo(() => {
    const y = formation.start_date
      ? new Date(formation.start_date).getFullYear()
      : NaN;
    return Number.isNaN(y) ? new Date().getFullYear() : y;
  }, [formation.start_date]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [summary, setSummary] = useState<SessionBpfSummary | null>(null);

  // Données brutes filtrées session (pour alimenter le DataGapsPanel).
  const [invoices, setInvoices] = useState<BPFInvoice[]>([]);
  const [enrollments, setEnrollments] = useState<BPFEnrollment[]>([]);
  const [trainings, setTrainings] = useState<BPFTraining[]>([]);
  const [formationTrainers, setFormationTrainers] = useState<
    BPFFormationTrainer[]
  >([]);
  const [sessions, setSessions] = useState<BPFSession[]>([]);

  // Audit de validation lu depuis la prop `formation` (chargée en select("*"),
  // tolérante aux colonnes absentes) — jamais re-SELECT explicite qui ferait
  // planter l'onglet si la migration/cache de schéma n'est pas encore en place.
  // Rafraîchi via onRefresh (qui recharge la formation parente) après validation.
  const validatedAt = formation.bpf_validated_at ?? null;
  const [validatorName, setValidatorName] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  // ── Fetch (aucune écriture Supabase inline : lecture via service) ──
  const fetchData = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [raw, userRes] = await Promise.all([
        fetchBPFDataForSession(supabase, entityId, sessionId, year),
        supabase.auth.getUser(),
      ]);

      setUserId(userRes.data.user?.id ?? null);

      const sessionRow = raw.sessions[0];
      const trainingRow = raw.trainings[0];
      const isSubcontracted = sessionRow?.is_subcontracted_to_other_of ?? false;
      const durationHours = trainingRow?.duration_hours ?? 0;

      const computed = computeSessionBpfSummary({
        invoices: raw.invoices,
        enrollments: raw.enrollments,
        trainings: raw.trainings,
        formationTrainers: raw.formationTrainers,
        signatures: raw.signatures,
        isSubcontracted,
        durationHours,
      });

      setSummary(computed);
      setInvoices(raw.invoices);
      setEnrollments(raw.enrollments);
      setTrainings(raw.trainings);
      setFormationTrainers(raw.formationTrainers);
      setSessions(raw.sessions);
    } catch (err) {
      console.error("[TabBpf] Erreur chargement BPF session:", err);
      setLoadError(true);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données BPF de la formation.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [supabase, entityId, sessionId, year, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Nom du validateur (best effort), découplé du fetch BPF : dérivé de la prop
  // `formation` → ne peut pas casser le chargement de l'onglet.
  useEffect(() => {
    const validatorId = formation.bpf_validated_by ?? null;
    if (!validatorId) {
      setValidatorName(null);
      return;
    }
    let active = true;
    fetchValidatorName(supabase, validatorId).then((name) => {
      if (active) setValidatorName(name);
    });
    return () => {
      active = false;
    };
  }, [formation.bpf_validated_by, supabase]);

  // Rafraîchit à la fois la formation parente et les données de l'onglet.
  const refetch = useCallback(async () => {
    await Promise.all([onRefresh(), fetchData()]);
  }, [onRefresh, fetchData]);

  // ── Validation ──
  const handleValidate = async () => {
    if (!entityId || !userId) return;
    setValidating(true);
    try {
      await validateSessionBPF(supabase, entityId, sessionId, userId);
      toast({ title: "Formation validée pour le BPF" });
      await refetch();
    } catch (err) {
      console.error("[TabBpf] Erreur validation BPF:", err);
      toast({
        title: "Erreur",
        description: "La validation a échoué.",
        variant: "destructive",
      });
    } finally {
      setValidating(false);
    }
  };

  const handleUnvalidate = async () => {
    if (!entityId) return;
    setValidating(true);
    try {
      await unvalidateSessionBPF(supabase, entityId, sessionId);
      toast({ title: "Validation BPF annulée" });
      await refetch();
    } catch (err) {
      console.error("[TabBpf] Erreur annulation validation BPF:", err);
      toast({
        title: "Erreur",
        description: "L'annulation a échoué.",
        variant: "destructive",
      });
    } finally {
      setValidating(false);
    }
  };

  // ── Rendu ──
  // Formation annulée : exclue du rapport global → on interdit toute
  // validation/synthèse ici pour rester cohérent (pas de bouton Valider).
  if (formation.status === "cancelled") {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-8 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium text-gray-900">
              Formation annulée — non prise en compte dans le BPF
            </p>
            <p className="mt-1 text-xs">
              Les formations annulées sont exclues du rapport BPF : aucune
              synthèse ni validation n&apos;est disponible.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sans date de début, l'exercice BPF (année civile) est indéterminable :
  // on ne devine pas silencieusement l'année, on bloque la validation.
  if (!formation.start_date) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-8 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium text-gray-900">
              Date de session manquante — impossible de déterminer l&apos;exercice
              BPF
            </p>
            <p className="mt-1 text-xs">
              Renseignez la date de début de la formation pour calculer sa
              contribution au BPF.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Échec du fetch : état distinct (≠ "aucune donnée") avec réessai.
  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <p className="font-medium text-gray-900">
            Erreur de chargement des données BPF
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => fetchData()}
            disabled={loading}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Aucune donnée BPF disponible pour cette formation.
      </div>
    );
  }

  const isClean = summary.totalGaps === 0;

  // Lignes Cadre C non nulles à afficher (combined), avec libellé court.
  const cRows = Object.entries(summary.sectionC.combined)
    .filter(([, v]) => v !== 0)
    .map(([key, value]) => ({
      key,
      label: C_LINE_LABELS[key] ?? key,
      value,
    }));

  // Lignes F-1 non nulles.
  const f1Rows = summary.f1.filter(
    (r) => r.stagiaires > 0 || r.heures > 0
  );

  return (
    <div className="space-y-6">
      {/* ═══ PHRASE-RÉSUMÉ + PASTILLE ═══ */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {summary.stagiaires} stagiaire
                {summary.stagiaires !== 1 ? "s" : ""} ·{" "}
                {summary.heures} h · {fmtEur(summary.caTotal)} HT
              </p>
              <p className="text-xs text-muted-foreground">
                Contribution de cette formation au BPF {year}
              </p>
            </div>
          </div>
          {isClean ? (
            <Badge variant="success" className="gap-1 self-start sm:self-auto">
              <CheckCircle2 className="h-3.5 w-3.5" /> Prêt à déclarer
            </Badge>
          ) : (
            <Badge
              variant="destructive"
              className="gap-1 self-start sm:self-auto"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> {summary.totalGaps} à
              corriger
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* ═══ DÉTAIL PAR CADRE (repliable) ═══ */}
      <BpfDetailSection
        summary={summary}
        cRows={cRows}
        f1Rows={f1Rows}
      />

      {/* ═══ DONNÉES À COMPLÉTER (DataGapsPanel filtré session) ═══ */}
      {entityId && (
        <DataGapsPanel
          gaps={summary.gaps}
          invoices={invoices}
          enrollments={enrollments}
          trainings={trainings}
          formationTrainers={formationTrainers}
          sessions={sessions}
          onRefresh={refetch}
          entityId={entityId}
        />
      )}

      {/* ═══ VALIDATION ═══ */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-medium text-gray-900">
                Validation BPF de la formation
              </p>
              <p className="text-xs text-muted-foreground">
                {isClean
                  ? "Toutes les données sont complètes : vous pouvez valider."
                  : "Corrigez les points ci-dessus avant de pouvoir valider."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {validatedAt && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleUnvalidate}
                  disabled={validating}
                >
                  {validating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Annuler la validation
                </Button>
              )}
              <Button
                size="sm"
                className="gap-1.5 bg-green-600 text-xs text-white hover:bg-green-700"
                onClick={handleValidate}
                disabled={!isClean || validating || !userId}
              >
                {validating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Je valide cette formation pour le BPF
              </Button>
            </div>
          </div>

          {validatedAt && (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>
                Validé le {fmtDate(validatedAt)}
                {validatorName ? ` par ${validatorName}` : ""}
                {!isClean && (
                  <span className="ml-1 font-medium text-amber-700">
                    (⚠️ {summary.totalGaps} nouveau
                    {summary.totalGaps !== 1 ? "x" : ""} point
                    {summary.totalGaps !== 1 ? "s" : ""} depuis)
                  </span>
                )}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Détail par cadre (repliable) ──────────────────────────────

function BpfDetailSection({
  summary,
  cRows,
  f1Rows,
}: {
  summary: SessionBpfSummary;
  cRows: { key: string; label: string; value: number }[];
  f1Rows: SessionBpfSummary["f1"];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between text-left">
              <CardTitle className="flex items-center gap-2 text-base">
                {open ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Détail par cadre
              </CardTitle>
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6 text-sm">
            {/* ── Cadre F-1 ── */}
            <div>
              <p className="mb-2 font-medium text-gray-900">
                Cadre F-1 — Stagiaires par type
              </p>
              {f1Rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aucun stagiaire comptabilisé.
                </p>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-[1fr_90px_90px] gap-2 border-b pb-1 text-xs font-medium text-muted-foreground">
                    <span>Type</span>
                    <span className="text-right">Stagiaires</span>
                    <span className="text-right">Heures</span>
                  </div>
                  {f1Rows.map((row) => (
                    <div
                      key={row.type}
                      className="grid grid-cols-[1fr_90px_90px] gap-2"
                    >
                      <span className="truncate">
                        {BPF_TRAINEE_TYPE_LABELS[row.type]}
                      </span>
                      <span className="text-right tabular-nums">
                        {row.stagiaires}
                      </span>
                      <span className="text-right tabular-nums">
                        {row.heures}
                      </span>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_90px_90px] gap-2 border-t pt-1 font-medium">
                    <span>Total</span>
                    <span className="text-right tabular-nums">
                      {summary.stagiaires}
                    </span>
                    <span className="text-right tabular-nums">
                      {summary.heures}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Cadre F-2 ── */}
            <div>
              <p className="mb-2 font-medium text-gray-900">
                Cadre F-2 — Sous-traité à un autre organisme
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.f2.stagiaires} stagiaire
                {summary.f2.stagiaires !== 1 ? "s" : ""} · {summary.f2.heures} h
              </p>
            </div>

            {/* ── Cadre C ── */}
            <div>
              <p className="mb-2 font-medium text-gray-900">
                Cadre C — Produits (CA HT)
              </p>
              {cRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aucun produit facturé sur l&apos;exercice.
                </p>
              ) : (
                <div className="space-y-1">
                  {cRows.map((row) => (
                    <div
                      key={row.key}
                      className="grid grid-cols-[1fr_110px] gap-2"
                    >
                      <span className="truncate text-xs text-muted-foreground">
                        {row.label}
                      </span>
                      <span className="text-right tabular-nums">
                        {fmtEur(row.value)}
                      </span>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_110px] gap-2 border-t pt-1 font-medium">
                    <span>Total</span>
                    <span className="text-right tabular-nums">
                      {fmtEur(summary.caTotal)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_110px] gap-2 text-xs text-muted-foreground">
                    <span>dont fiable (dates confirmées)</span>
                    <span className="text-right tabular-nums">
                      {fmtEur(summary.caFiable)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_110px] gap-2 text-xs text-muted-foreground">
                    <span>
                      dont à vérifier ({summary.aVerifierCount} facture
                      {summary.aVerifierCount !== 1 ? "s" : ""})
                    </span>
                    <span className="text-right tabular-nums">
                      {fmtEur(summary.caAVerifier)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
