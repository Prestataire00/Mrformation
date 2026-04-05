"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Loader2, BarChart3, AlertTriangle, CheckCircle2, XCircle, ClipboardCheck } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

import { BPFData, defaultBPF, FINANCIAL_LINES, CHARGE_LINES } from "./bpf/types";
import {
  BPFHeader,
  SectionA,
  SectionB,
  SectionC,
  SectionD,
  SectionE,
  SectionF1,
  SectionF2,
  SectionF3,
  SectionF4,
  SectionG,
} from "./bpf";
import { computeSectionC, computeSectionD, getF3Index, isRncpIndex } from "@/lib/bpf-calculator";
import type { SectionDResult } from "@/lib/bpf-calculator";

// ─── Component ──────────────────────────────────────

interface BPFFormProps {
  title: string;
}

export function BPFForm({ title }: BPFFormProps) {
  const supabase = createClient();
  const { entity } = useEntity();
  const { toast } = useToast();

  const entityId = entity?.id;
  const entityName = entity?.name ?? "MR FORMATION";

  const currentYear = new Date().getFullYear();
  const [dateFrom, setDateFrom] = useState(`${currentYear}-01-01`);
  const [dateTo, setDateTo] = useState(`${currentYear}-12-31`);
  const [filteredFrom, setFilteredFrom] = useState(`${currentYear}-01-01`);
  const [filteredTo, setFilteredTo] = useState(`${currentYear}-12-31`);
  const [loading, setLoading] = useState(true);

  // Computed BPF data
  const [bpf, setBpf] = useState<BPFData>(defaultBPF);

  // Financial data (auto-calculated, read-only)
  const [sectionC, setSectionC] = useState<Record<string, number>>({});
  const [sectionD, setSectionD] = useState<Record<string, number>>({});
  const [sectionGManual, setSectionGManual] = useState<{ stagiaires: number; heures: number }>({ stagiaires: 0, heures: 0 });

  // KPI & satisfaction
  const [satisfactionScore, setSatisfactionScore] = useState<number | null>(null);
  const [totalStagiaires, setTotalStagiaires] = useState(0);
  const [totalHeures, setTotalHeures] = useState(0);
  const [totalActions, setTotalActions] = useState(0);
  const [totalCA, setTotalCA] = useState(0);

  // Comparison N-1
  const [showComparison, setShowComparison] = useState(false);
  const [prevYearData, setPrevYearData] = useState<{
    stagiaires: number; heures: number; actions: number; ca: number; satisfaction: number | null;
  } | null>(null);

  // Data verification
  interface VerificationCheck {
    label: string;
    ok: boolean;
    total: number;
    valid: number;
    link?: string;
  }
  const [verifications, setVerifications] = useState<VerificationCheck[]>([]);

  const fiscalYear = dateFrom ? new Date(dateFrom).getFullYear() : currentYear;

  const fetchData = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    try {
      // ─── Section E: Trainers (internal vs external) ───
      const { count: internalCount } = await supabase
        .from("trainers")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", entityId)
        .eq("type", "internal");

      const { count: externalCount } = await supabase
        .from("trainers")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", entityId)
        .eq("type", "external");

      // Get sessions with trainer type, training hours, and bpf_objective
      const sessionQuery = supabase
        .from("sessions")
        .select("id, mode, trainer:trainers(type), training:trainings(duration_hours, classification, nsf_code, nsf_label, bpf_objective, bpf_funding_type)")
        .eq("entity_id", entityId)
        .neq("status", "cancelled");

      if (dateFrom) sessionQuery.gte("start_date", dateFrom);
      if (dateTo) sessionQuery.lte("start_date", dateTo + "T23:59:59");

      const { data: sessions } = await sessionQuery;

      let internalHours = 0;
      let externalHours = 0;

      // Map session_id -> session info
      const sessionMap: Record<string, {
        duration: number;
        mode: string;
        classification: string | null;
        bpfObjective: string | null;
        nsf_code: string | null;
        nsf_label: string | null;
      }> = {};

      if (sessions) {
        for (const s of sessions) {
          const trainer = Array.isArray(s.trainer)
            ? (s.trainer as Record<string, unknown>[])[0]
            : (s.trainer as Record<string, unknown> | null);
          const training = Array.isArray(s.training)
            ? (s.training as Record<string, unknown>[])[0]
            : (s.training as Record<string, unknown> | null);

          const hours = (training?.duration_hours as number) || 0;
          const trainerType = (trainer?.type as string) || "internal";
          const mode = (s.mode as string) || "presentiel";
          const classification = (training?.classification as string | null) || null;
          const bpfObjective = (training?.bpf_objective as string | null) || null;
          const nsfCode = (training?.nsf_code as string | null) || null;
          const nsfLabel = (training?.nsf_label as string | null) || null;

          if (trainerType === "external") {
            externalHours += hours;
          } else {
            internalHours += hours;
          }

          sessionMap[s.id as string] = {
            duration: hours,
            mode,
            classification,
            bpfObjective,
            nsf_code: nsfCode,
            nsf_label: nsfLabel,
          };
        }
      }

      const sessionIds = sessions ? sessions.map((s) => s.id as string) : [];

      // ─── Section C: Auto-calculate revenue from accepted quotes ───
      const quoteQuery = supabase
        .from("crm_quotes")
        .select("id, amount, bpf_funding_type, program_id, program:programs(bpf_funding_type), client:clients(bpf_category), created_at")
        .eq("entity_id", entityId)
        .eq("status", "accepted");

      if (dateFrom) quoteQuery.gte("created_at", dateFrom);
      if (dateTo) quoteQuery.lte("created_at", dateTo + "T23:59:59");

      const { data: acceptedQuotes } = await quoteQuery;

      const quotesForCalc = (acceptedQuotes || []).map((q) => {
        const program = Array.isArray(q.program)
          ? (q.program as Record<string, unknown>[])[0]
          : (q.program as Record<string, unknown> | null);
        const client = Array.isArray(q.client)
          ? (q.client as Record<string, unknown>[])[0]
          : (q.client as Record<string, unknown> | null);

        return {
          amount: q.amount as number | null,
          bpf_funding_type: q.bpf_funding_type as string | null,
          program: program ? { bpf_funding_type: program.bpf_funding_type as string | null } : null,
          client: client ? { bpf_category: client.bpf_category as string | null } : null,
        };
      });

      const computedSectionC = computeSectionC(quotesForCalc);
      setSectionC(computedSectionC);

      // ─── Section D: Auto-calculate charges from formation_trainers ───
      let computedD: SectionDResult = { total_charges: 0, salaires_formateurs: 0, achats_prestation: 0 };

      if (sessionIds.length > 0) {
        const { data: sessionTrainers } = await supabase
          .from("formation_trainers")
          .select("id, session_id, hourly_rate, trainer:trainers(type)")
          .in("session_id", sessionIds);

        if (sessionTrainers) {
          const durationMap: Record<string, number> = {};
          for (const [sid, info] of Object.entries(sessionMap)) {
            durationMap[sid] = info.duration;
          }

          computedD = computeSectionD(
            sessionTrainers.map((st) => ({
              hourly_rate: st.hourly_rate as number | null,
              session_id: st.session_id as string,
              trainer: Array.isArray(st.trainer)
                ? (st.trainer as Record<string, unknown>[])[0] as { type: string } | null
                : st.trainer as { type: string } | null,
            })),
            durationMap
          );
        }
      }

      setSectionD({
        total_charges: computedD.total_charges,
        salaires_formateurs: computedD.salaires_formateurs,
        achats_prestation: computedD.achats_prestation,
      });

      // ─── Section F-1: Learner types ───
      const enrollQuery = supabase
        .from("enrollments")
        .select("id, session_id, learner_id, learner:learners(id, client_id, learner_type)")
        .neq("status", "cancelled");

      if (sessionIds.length > 0) {
        enrollQuery.in("session_id", sessionIds);
      }

      const { data: enrollments } = await enrollQuery;

      // Aggregate F-1 by learner type (deduplicate learners)
      const learnerTypes: Record<string, Set<string>> = {
        salarie: new Set(),
        apprenti: new Set(),
        demandeur_emploi: new Set(),
        particulier: new Set(),
        autre: new Set(),
      };
      const learnerHours: Record<string, number> = {
        salarie: 0,
        apprenti: 0,
        demandeur_emploi: 0,
        particulier: 0,
        autre: 0,
      };
      const distanceLearners = new Set<string>();

      // F-3: aggregate by bpf_objective (new) with classification fallback
      const f3IndexCounts: Record<number, { learners: Set<string>; heures: number }> = {};
      for (let i = 0; i <= 12; i++) {
        f3IndexCounts[i] = { learners: new Set(), heures: 0 };
      }

      // F-4: aggregate by NSF code
      const f4Map: Record<string, { label: string; learners: Set<string>; heures: number }> = {};

      if (enrollments) {
        for (const e of enrollments) {
          const learner = Array.isArray(e.learner)
            ? (e.learner as Record<string, unknown>[])[0]
            : (e.learner as Record<string, unknown> | null);

          const learnerId = (learner?.id as string) || (e.learner_id as string) || "";
          if (!learnerId) continue;

          const clientId = learner?.client_id as string | null;
          let lType = (learner?.learner_type as string) || null;

          // Fallback logic: if learner_type not set, derive from client_id
          if (!lType || lType === "salarie") {
            if (clientId) {
              lType = "salarie";
            } else {
              lType = "particulier";
            }
          }

          if (!learnerTypes[lType]) lType = "autre";

          const sessionId = e.session_id as string;
          const sessionInfo = sessionMap[sessionId];
          const hours = sessionInfo?.duration || 0;

          learnerTypes[lType].add(learnerId);
          learnerHours[lType] += hours;

          // Distance learners
          if (sessionInfo && (sessionInfo.mode === "distanciel" || sessionInfo.mode === "hybride")) {
            distanceLearners.add(learnerId);
          }

          // F-3: Use bpf_objective (new) with classification fallback
          let f3Idx: number;
          if (sessionInfo?.bpfObjective) {
            f3Idx = getF3Index(sessionInfo.bpfObjective);
          } else {
            // Legacy fallback from classification
            const classif = sessionInfo?.classification;
            if (classif === "certifiant") {
              f3Idx = 0; // RNCP total row (a)
            } else if (classif === "reglementaire") {
              f3Idx = 7; // Certifications RS (b)
            } else {
              f3Idx = 9; // Autres formations (d)
            }
          }

          f3IndexCounts[f3Idx].learners.add(learnerId);
          f3IndexCounts[f3Idx].heures += hours;

          // F-4 NSF
          if (sessionInfo?.nsf_code) {
            if (!f4Map[sessionInfo.nsf_code]) {
              f4Map[sessionInfo.nsf_code] = { label: sessionInfo.nsf_label || sessionInfo.nsf_code, learners: new Set(), heures: 0 };
            }
            f4Map[sessionInfo.nsf_code].learners.add(learnerId);
            f4Map[sessionInfo.nsf_code].heures += hours;
          }
        }
      }

      // Build F-1 rows
      const f1Rows = [
        { label: "a. Salariés d'employeurs privés hors apprentis", stagiaires: learnerTypes.salarie.size, heures: learnerHours.salarie },
        { label: "b. Apprentis", stagiaires: learnerTypes.apprenti.size, heures: learnerHours.apprenti },
        { label: "c. Personnes en recherche d'emploi formées par votre organisme de formation", stagiaires: learnerTypes.demandeur_emploi.size, heures: learnerHours.demandeur_emploi },
        { label: "d. Particuliers à leurs propres frais formés par votre organisme de formation", stagiaires: learnerTypes.particulier.size, heures: learnerHours.particulier },
        { label: "e. Autres stagiaires", stagiaires: learnerTypes.autre.size, heures: learnerHours.autre },
      ];
      const totalF1Learners = f1Rows.reduce((s, r) => s + r.stagiaires, 0);
      const totalF1Hours = f1Rows.reduce((s, r) => s + r.heures, 0);
      f1Rows.push({ label: "Total", stagiaires: totalF1Learners, heures: totalF1Hours });

      // Build F-3 rows with bpf_objective-based mapping
      const f3Rows = [...defaultBPF.f3.map((r) => ({ ...r }))];

      // Aggregate RNCP sub-levels (indices 1-6) into parent row 0
      let rncpTotalLearners = new Set<string>();
      let rncpTotalHeures = 0;

      for (let i = 0; i < f3Rows.length - 1; i++) {
        const counts = f3IndexCounts[i];
        if (counts && i > 0) {
          f3Rows[i] = { ...f3Rows[i], stagiaires: counts.learners.size, heures: counts.heures };
          // Accumulate RNCP sub-levels into parent
          if (isRncpIndex(i)) {
            counts.learners.forEach((l) => rncpTotalLearners.add(l));
            rncpTotalHeures += counts.heures;
          }
        }
      }

      // Row 0 (a) = RNCP total + any directly assigned to index 0
      const directRow0 = f3IndexCounts[0];
      if (directRow0) {
        directRow0.learners.forEach((l) => rncpTotalLearners.add(l));
        rncpTotalHeures += directRow0.heures;
      }
      f3Rows[0] = { ...f3Rows[0], stagiaires: rncpTotalLearners.size, heures: rncpTotalHeures };

      // Total row (last)
      const totalF3Learners = f3Rows.slice(0, -1).filter((r) => !r.indent).reduce((s, r) => s + r.stagiaires, 0);
      const totalF3Hours = f3Rows.slice(0, -1).filter((r) => !r.indent).reduce((s, r) => s + r.heures, 0);
      f3Rows[f3Rows.length - 1] = { label: "Total", stagiaires: totalF3Learners, heures: totalF3Hours };

      // Build F-4 rows
      const f4Rows = Object.entries(f4Map).map(([code, data]) => ({
        code: `${code} - ${data.label}`,
        label: data.label,
        stagiaires: data.learners.size,
        heures: data.heures,
      }));

      // ─── Section G: Manual (from bpf_financial_data) ───
      const { data: finData } = await supabase
        .from("bpf_financial_data")
        .select("*")
        .eq("entity_id", entityId)
        .eq("fiscal_year", fiscalYear)
        .maybeSingle();

      const gData = finData ? ((finData.section_g as Record<string, number>) || {}) : {};
      const gManual = { stagiaires: gData.stagiaires || 0, heures: gData.heures || 0 };
      setSectionGManual(gManual);

      // ─── KPI totals ───
      const kpiStagiaires = totalF1Learners;
      const kpiHeures = totalF1Hours;
      const kpiActions = sessions?.length || 0;
      const kpiCA = (() => {
        const l1 = computedSectionC["line_1"] || 0;
        const l2Keys = FINANCIAL_LINES.find((l) => l.key === "line_2_total")?.sumKeys || [];
        const l2Total = l2Keys.reduce((s, k) => s + (computedSectionC[k] || 0), 0);
        const l3 = computedSectionC["line_3"] || 0;
        const l9 = computedSectionC["line_9"] || 0;
        const l10 = computedSectionC["line_10"] || 0;
        const l11 = computedSectionC["line_11"] || 0;
        const pub = (computedSectionC["line_4"] || 0) + (computedSectionC["line_5"] || 0) + (computedSectionC["line_6"] || 0) + (computedSectionC["line_7"] || 0) + (computedSectionC["line_8"] || 0);
        return l1 + l2Total + l3 + pub + l9 + l10 + l11;
      })();
      setTotalStagiaires(kpiStagiaires);
      setTotalHeures(kpiHeures);
      setTotalActions(kpiActions);
      setTotalCA(kpiCA);

      // ─── Satisfaction score from questionnaire_responses ───
      let satisfactionResponseCount = 0;
      try {
        const { data: satisfactionResponses } = await supabase
          .from("questionnaire_responses")
          .select("responses")
          .in("session_id", sessionIds.length > 0 ? sessionIds : ["__none__"]);
        satisfactionResponseCount = satisfactionResponses?.length || 0;

        let satScore: number | null = null;
        if (satisfactionResponses && satisfactionResponses.length > 0) {
          const allRatings: number[] = [];
          for (const resp of satisfactionResponses) {
            const answers = resp.responses as Record<string, unknown>;
            for (const value of Object.values(answers)) {
              const num = Number(value);
              if (!isNaN(num) && num >= 1 && num <= 5) {
                allRatings.push(num);
              }
            }
          }
          if (allRatings.length > 0) {
            satScore = Math.round((allRatings.reduce((a, b) => a + b, 0) / allRatings.length) * 10) / 10;
          }
        }
        setSatisfactionScore(satScore);
      } catch {
        setSatisfactionScore(null);
      }

      // ─── Comparison N-1 (lightweight) ───
      try {
        const prevYear = fiscalYear - 1;
        const prevFrom = `${prevYear}-01-01`;
        const prevTo = `${prevYear}-12-31T23:59:59`;

        const { data: prevSessions } = await supabase
          .from("sessions")
          .select("id, training:trainings(duration_hours)")
          .eq("entity_id", entityId)
          .neq("status", "cancelled")
          .gte("start_date", prevFrom)
          .lte("start_date", prevTo);

        const prevSessionIds = prevSessions?.map((s) => s.id as string) || [];
        let prevHeures = 0;
        for (const s of prevSessions || []) {
          const t = Array.isArray(s.training) ? (s.training as Record<string, unknown>[])[0] : (s.training as Record<string, unknown> | null);
          prevHeures += (t?.duration_hours as number) || 0;
        }

        let prevStagiaires = 0;
        if (prevSessionIds.length > 0) {
          const { count } = await supabase
            .from("enrollments")
            .select("learner_id", { count: "exact", head: true })
            .in("session_id", prevSessionIds)
            .neq("status", "cancelled");
          prevStagiaires = count || 0;
        }

        const prevQuoteQuery = supabase
          .from("crm_quotes")
          .select("amount")
          .eq("entity_id", entityId)
          .eq("status", "accepted")
          .gte("created_at", prevFrom)
          .lte("created_at", prevTo);
        const { data: prevQuotes } = await prevQuoteQuery;
        const prevCA = (prevQuotes || []).reduce((s, q) => s + ((q.amount as number) || 0), 0);

        setPrevYearData({
          stagiaires: prevStagiaires,
          heures: prevHeures,
          actions: prevSessionIds.length,
          ca: prevCA,
          satisfaction: null,
        });
      } catch {
        setPrevYearData(null);
      }

      // ─── Data verification checks ───
      const checks: VerificationCheck[] = [];

      // 1. Sessions avec heures
      const sessionsWithHours = sessions ? sessions.filter((s) => {
        const t = Array.isArray(s.training) ? (s.training as Record<string, unknown>[])[0] : (s.training as Record<string, unknown> | null);
        return ((t?.duration_hours as number) || 0) > 0;
      }).length : 0;
      const totalSessions = sessions?.length || 0;
      checks.push({ label: "Sessions avec heures renseignées", ok: sessionsWithHours === totalSessions && totalSessions > 0, total: totalSessions, valid: sessionsWithHours, link: "/admin/sessions" });

      // 2. Formations avec objectif BPF
      const trainingsWithObj = sessions ? sessions.filter((s) => {
        const t = Array.isArray(s.training) ? (s.training as Record<string, unknown>[])[0] : (s.training as Record<string, unknown> | null);
        return !!(t?.bpf_objective);
      }).length : 0;
      checks.push({ label: "Formations avec objectif BPF", ok: trainingsWithObj === totalSessions && totalSessions > 0, total: totalSessions, valid: trainingsWithObj, link: "/admin/trainings" });

      // 3. Formations avec code NSF
      const trainingsWithNsf = sessions ? sessions.filter((s) => {
        const t = Array.isArray(s.training) ? (s.training as Record<string, unknown>[])[0] : (s.training as Record<string, unknown> | null);
        return !!(t?.nsf_code);
      }).length : 0;
      checks.push({ label: "Formations avec code NSF", ok: trainingsWithNsf === totalSessions && totalSessions > 0, total: totalSessions, valid: trainingsWithNsf, link: "/admin/trainings" });

      // 4. Devis acceptés
      const nbQuotes = acceptedQuotes?.length || 0;
      checks.push({ label: "Devis acceptés (CA)", ok: nbQuotes > 0, total: nbQuotes, valid: nbQuotes, link: "/admin/crm" });

      // 5. Formateurs avec type + taux horaire
      const { data: allTrainers } = await supabase
        .from("trainers")
        .select("id, type, hourly_rate")
        .eq("entity_id", entityId);
      const trainersComplete = (allTrainers || []).filter((t) => t.type && t.hourly_rate != null && t.hourly_rate > 0).length;
      const trainersTotal = allTrainers?.length || 0;
      checks.push({ label: "Formateurs avec type et taux horaire", ok: trainersComplete === trainersTotal && trainersTotal > 0, total: trainersTotal, valid: trainersComplete, link: "/admin/trainers" });

      // 6. Apprenants avec learner_type
      const { data: allLearners } = await supabase
        .from("learners")
        .select("id, learner_type")
        .eq("entity_id", entityId);
      const learnersWithType = (allLearners || []).filter((l) => l.learner_type && l.learner_type !== "").length;
      const learnersTotal = allLearners?.length || 0;
      checks.push({ label: "Apprenants avec type renseigné", ok: learnersWithType === learnersTotal && learnersTotal > 0, total: learnersTotal, valid: learnersWithType, link: "/admin/clients" });

      // 7. Questionnaires satisfaction
      const satisfactionCount = satisfactionResponseCount;
      checks.push({ label: "Questionnaires de satisfaction", ok: satisfactionCount > 0, total: satisfactionCount, valid: satisfactionCount, link: "/admin/questionnaires" });

      setVerifications(checks);

      setBpf({
        personnesInternes: { nombre: internalCount ?? 0, heures: internalHours },
        personnesExternes: { nombre: externalCount ?? 0, heures: externalHours },
        f1: f1Rows,
        f1DistanceCount: distanceLearners.size,
        f2: { stagiaires: gManual.stagiaires, heures: gManual.heures },
        f3: f3Rows,
        f4: f4Rows,
        g: gManual,
      });

      if (dateFrom || dateTo) {
        setFilteredFrom(dateFrom);
        setFilteredTo(dateTo);
      }
    } catch (err) {
      console.error("BPF fetch error:", err);
    }

    setLoading(false);
  }, [supabase, entityId, dateFrom, dateTo, fiscalYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilter = () => fetchData();

  // Section G is the only manually-saveable section now
  const handleSaveG = async () => {
    if (!entityId) return;

    const { error } = await supabase
      .from("bpf_financial_data")
      .upsert(
        {
          entity_id: entityId,
          fiscal_year: fiscalYear,
          section_g: sectionGManual,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "entity_id,fiscal_year" }
      );

    if (error) {
      toast({ title: "Erreur", description: "Impossible de sauvegarder.", variant: "destructive" });
    } else {
      toast({ title: "Succès", description: "Données sauvegardées." });
    }
  };

  const fmtEur = (val: number) => `${(val || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;

  const getLineValue = (key: string): number => {
    const line = FINANCIAL_LINES.find((l) => l.key === key);
    if (line?.isTotal && line.sumKeys) {
      return line.sumKeys.reduce((sum, k) => sum + (sectionC[k] || 0), 0);
    }
    return sectionC[key] || 0;
  };

  const totalProduits = (): number => {
    const line1 = sectionC["line_1"] || 0;
    const line2Total = FINANCIAL_LINES.find((l) => l.key === "line_2_total")!.sumKeys!.reduce((s, k) => s + (sectionC[k] || 0), 0);
    const line3 = sectionC["line_3"] || 0;
    const line9 = sectionC["line_9"] || 0;
    const line10 = sectionC["line_10"] || 0;
    const line11 = sectionC["line_11"] || 0;
    const publicFunds = (sectionC["line_4"] || 0) + (sectionC["line_5"] || 0) + (sectionC["line_6"] || 0) + (sectionC["line_7"] || 0) + (sectionC["line_8"] || 0);
    return line1 + line2Total + line3 + publicFunds + line9 + line10 + line11;
  };

  // ─── Export helpers ───
  const handleExportExcel = () => {
    const headers = ["Section", "Libellé", "Valeur / Stagiaires", "Heures"];
    const rows: (string | number)[][] = [];

    // Section E
    rows.push(["E", "Personnes internes", bpf.personnesInternes.nombre, bpf.personnesInternes.heures]);
    rows.push(["E", "Personnes externes", bpf.personnesExternes.nombre, bpf.personnesExternes.heures]);

    // Section F-1
    bpf.f1.forEach((r) => rows.push(["F-1", r.label, r.stagiaires, r.heures]));
    rows.push(["F-1", "dont à distance", bpf.f1DistanceCount, ""]);

    // Section F-3
    bpf.f3.forEach((r) => rows.push(["F-3", r.label, r.stagiaires, r.heures]));

    // Section F-4
    bpf.f4.forEach((r) => rows.push(["F-4", r.code, r.stagiaires, r.heures]));

    // Section C
    FINANCIAL_LINES.forEach((l) => rows.push(["C", l.label, getLineValue(l.key), ""]));
    rows.push(["C", "TOTAL PRODUITS", totalProduits(), ""]);

    // Section D
    CHARGE_LINES.forEach((l) => rows.push(["D", l.label, sectionD[l.key] || 0, ""]));

    // Section G
    rows.push(["G", "Formations sous-traitées", sectionGManual.stagiaires, sectionGManual.heures]);

    downloadXlsx(headers, rows, `BPF_${entityName.replace(/\s+/g, "_")}_${fiscalYear}.xlsx`);
  };

  const handleExportPDF = async () => {
    const { exportBPFFullToPDF } = await import("@/lib/pdf-export");
    exportBPFFullToPDF({
      entityName,
      fiscalYear,
      dateFrom: filteredFrom,
      dateTo: filteredTo,
      bpf,
      sectionC,
      sectionD,
      sectionGManual,
      financialLines: FINANCIAL_LINES,
      chargeLines: CHARGE_LINES,
      getLineValue,
      totalProduits: totalProduits(),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <BPFHeader
        title={title}
        onExportExcel={handleExportExcel}
        onExportPDF={handleExportPDF}
      />

      {/* ═══ KPI CARDS ═══ */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-blue-900 flex items-center gap-2 text-sm">
            <BarChart3 className="h-4 w-4" />
            Synthèse {fiscalYear} — Calculée automatiquement
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Comparer avec {fiscalYear - 1}</span>
            <Switch checked={showComparison} onCheckedChange={setShowComparison} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {([
            { icon: "🎓", label: "Stagiaires formés", value: totalStagiaires, prev: prevYearData?.stagiaires, fmt: (v: number) => String(v) },
            { icon: "⏱️", label: "Heures dispensées", value: totalHeures, prev: prevYearData?.heures, fmt: (v: number) => `${v}h` },
            { icon: "📋", label: "Actions de formation", value: totalActions, prev: prevYearData?.actions, fmt: (v: number) => String(v) },
            { icon: "💶", label: "CA formation", value: totalCA, prev: prevYearData?.ca, fmt: (v: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v) },
            { icon: "⭐", label: "Satisfaction", value: satisfactionScore, prev: prevYearData?.satisfaction, fmt: (v: number) => `${v}/5` },
          ] as const).map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-lg p-3 shadow-sm border border-blue-100">
              <p className="text-xl mb-0.5">{kpi.icon}</p>
              <p className="text-xl font-bold text-gray-900">
                {kpi.value !== null && kpi.value !== undefined ? kpi.fmt(kpi.value) : "—"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
              {showComparison && kpi.prev != null && kpi.value != null && kpi.prev > 0 && (
                <p className={`text-xs mt-1 font-medium ${kpi.value >= kpi.prev ? "text-green-600" : "text-red-500"}`}>
                  {kpi.value >= kpi.prev ? "▲" : "▼"} {Math.abs(Math.round(((kpi.value - kpi.prev) / kpi.prev) * 100))}% vs {fiscalYear - 1}
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Mis à jour : {new Date().toLocaleDateString("fr-FR")} — Données calculées depuis sessions et devis
        </p>
      </div>

      {/* ═══ ALERTES DONNÉES MANQUANTES ═══ */}
      {(() => {
        const alerts: Array<{ type: "error" | "warning" | "success"; message: string }> = [];

        if (totalStagiaires === 0)
          alerts.push({ type: "error", message: "Aucun stagiaire enregistré — vérifiez les inscriptions aux sessions" });
        if (totalHeures === 0)
          alerts.push({ type: "warning", message: "Heures non renseignées — vérifiez planned_hours / duration_hours sur vos formations" });
        if (satisfactionScore === null)
          alerts.push({ type: "warning", message: "Satisfaction non calculable — aucun questionnaire de satisfaction complété cette année" });
        if (totalCA === 0)
          alerts.push({ type: "warning", message: "CA non calculé — aucun devis accepté cette année" });
        if (totalStagiaires > 0 && totalHeures > 0 && totalCA > 0)
          alerts.push({ type: "success", message: "BPF complet — prêt à exporter en PDF ou Excel" });

        if (alerts.length === 0) return null;

        return (
          <div className="space-y-2 mb-6">
            {alerts.map((alert, i) => (
              <div key={i} className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                alert.type === "error" ? "bg-red-50 border border-red-200 text-red-700"
                : alert.type === "warning" ? "bg-amber-50 border border-amber-200 text-amber-700"
                : "bg-green-50 border border-green-200 text-green-700"
              }`}>
                {alert.type === "error" ? <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  : alert.type === "warning" ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  : <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ═══ VÉRIFICATION DES DONNÉES ═══ */}
      {verifications.length > 0 && (
        <div className="border border-indigo-200 rounded-xl p-5 mb-6 bg-indigo-50/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-indigo-900 flex items-center gap-2 text-sm">
              <ClipboardCheck className="h-4 w-4" />
              Vérification des données — Score : {verifications.filter((v) => v.ok).length}/{verifications.length} ({Math.round((verifications.filter((v) => v.ok).length / verifications.length) * 100)}%)
            </h3>
          </div>
          <div className="space-y-1.5">
            {verifications.map((check, i) => (
              <div key={i} className={`flex items-center justify-between text-sm px-3 py-1.5 rounded-lg ${check.ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                <div className="flex items-center gap-2">
                  {check.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                  <span>{check.label} : <strong>{check.valid}/{check.total}</strong></span>
                </div>
                {!check.ok && check.link && (
                  <Link href={check.link} className="text-xs font-medium underline hover:no-underline shrink-0">
                    Corriger →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <SectionA entityName={entityName} />

      <SectionB
        dateFrom={dateFrom}
        dateTo={dateTo}
        filteredFrom={filteredFrom}
        filteredTo={filteredTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onFilter={handleFilter}
      />

      <SectionC
        sectionC={sectionC}
        getLineValue={getLineValue}
        totalProduits={totalProduits()}
        fmtEur={fmtEur}
      />

      <SectionD
        sectionD={sectionD}
        fmtEur={fmtEur}
      />

      <SectionE bpf={bpf} />

      <SectionF1 bpf={bpf} />

      <SectionF2 bpf={bpf} />

      <SectionF3 bpf={bpf} />

      <SectionF4 bpf={bpf} />

      <SectionG
        editingFinancial={true}
        sectionGManual={sectionGManual}
        onSectionGChange={setSectionGManual}
        onSaveG={handleSaveG}
      />
    </div>
  );
}
