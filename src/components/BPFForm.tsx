"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Filter, Loader2, Download, Pencil, Save, FileText } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";
import { useToast } from "@/components/ui/use-toast";

// ─── Types ───────────────────────────────────────────

interface BPFData {
  // Section E
  personnesInternes: { nombre: number; heures: number };
  personnesExternes: { nombre: number; heures: number };
  // Section F-1
  f1: { label: string; stagiaires: number; heures: number; indent?: boolean }[];
  f1DistanceCount: number;
  // Section F-2
  f2: { stagiaires: number; heures: number };
  // Section F-3
  f3: { label: string; stagiaires: number; heures: number; indent?: boolean }[];
  // Section F-4
  f4: { code: string; label: string; stagiaires: number; heures: number }[];
  // Section G
  g: { stagiaires: number; heures: number };
}

const defaultBPF: BPFData = {
  personnesInternes: { nombre: 0, heures: 0 },
  personnesExternes: { nombre: 0, heures: 0 },
  f1: [
    { label: "a. Salariés d'employeurs privés hors apprentis", stagiaires: 0, heures: 0 },
    { label: "b. Apprentis", stagiaires: 0, heures: 0 },
    { label: "c. Personnes en recherche d'emploi formées par votre organisme de formation", stagiaires: 0, heures: 0 },
    { label: "d. Particuliers à leurs propres frais formés par votre organisme de formation", stagiaires: 0, heures: 0 },
    { label: "e. Autres stagiaires", stagiaires: 0, heures: 0 },
    { label: "Total", stagiaires: 0, heures: 0 },
  ],
  f1DistanceCount: 0,
  f2: { stagiaires: 0, heures: 0 },
  f3: [
    { label: "a. Formations visant un diplôme, un titre à finalité professionnelle ou un certificat de qualification professionnelle enregistré au Répertoire national des certifications professionnelles (RNCP)", stagiaires: 0, heures: 0 },
    { label: "dont de niveau 6 à 8 (Licence, Master, diplôme d'ingénieur, Doctorat...)", stagiaires: 0, heures: 0, indent: true },
    { label: "dont de niveau 5 (BTS, DUT, écoles de formation sanitaire et sociale ...)", stagiaires: 0, heures: 0, indent: true },
    { label: "dont de niveau 4 (BAC professionnel, BT, BP, BM...)", stagiaires: 0, heures: 0, indent: true },
    { label: "dont de niveau 3 (BEP, CAP...)", stagiaires: 0, heures: 0, indent: true },
    { label: "dont de niveau 2", stagiaires: 0, heures: 0, indent: true },
    { label: "dont certificat de qualification professionnelle (CQP) sans niveau de qualification", stagiaires: 0, heures: 0, indent: true },
    { label: "b. Formations visant une certification (dont CQP) ou une habilitation enregistrée au répertoire spécifique (RS)", stagiaires: 0, heures: 0 },
    { label: "c. Formations visant un CQP non enregistré au RNCP ou au RS", stagiaires: 0, heures: 0 },
    { label: "d. Autres formations professionnelles", stagiaires: 0, heures: 0 },
    { label: "e. Bilans de compétences", stagiaires: 0, heures: 0 },
    { label: "f. Actions d'accompagnement à la validation des acquis de l'expérience", stagiaires: 0, heures: 0 },
    { label: "Total", stagiaires: 0, heures: 0 },
  ],
  f4: [],
  g: { stagiaires: 0, heures: 0 },
};

// ─── Financial lines (Section C) ────────────────────

interface FinancialLine {
  key: string;
  label: string;
  indent?: number;
  bold?: boolean;
  isTotal?: boolean;
  sumKeys?: string[];
}

const FINANCIAL_LINES: FinancialLine[] = [
  { key: "line_1", label: "1. des entreprises pour la formation de leurs salariés", indent: 0 },
  { key: "line_2", label: "2. des organismes gestionnaires des fonds de la formation professionnelle pour des actions dispensées dans le cadre :", indent: 0, bold: true },
  { key: "line_2a", label: "a. des contrats d'apprentissage", indent: 1 },
  { key: "line_2b", label: "b. des contrats de professionnalisation", indent: 1 },
  { key: "line_2c", label: "c. de la promotion ou de la reconversion par alternance", indent: 1 },
  { key: "line_2d", label: "d. des congés individuels de formation et des projets de transition professionnelle", indent: 1 },
  { key: "line_2e", label: "e. du compte personnel de formation", indent: 1 },
  { key: "line_2f", label: "f. des dispositifs spécifiques pour les personnes en recherche d'emploi", indent: 1 },
  { key: "line_2g", label: "g. des dispositifs spécifiques pour les travailleurs non-salariés", indent: 1 },
  { key: "line_2h", label: "h. du plan de développement des compétences ou d'autres dispositifs", indent: 1 },
  { key: "line_2_total", label: "Total des produits provenant des organismes gestionnaires des fonds de la formation", indent: 1, bold: true, isTotal: true, sumKeys: ["line_2a", "line_2b", "line_2c", "line_2d", "line_2e", "line_2f", "line_2g", "line_2h"] },
  { key: "line_3", label: "3. des pouvoirs publics pour la formation de leurs agents (État, collectivités territoriales, établissements publics à caractère administratif)", indent: 0 },
  { key: "line_4", label: "4. Instances européennes", indent: 1 },
  { key: "line_5", label: "5. Etat", indent: 1 },
  { key: "line_6", label: "6. Conseils régionaux", indent: 1 },
  { key: "line_7", label: "7. Pôle emploi", indent: 1 },
  { key: "line_8", label: "8. Autres ressources publiques", indent: 1 },
  { key: "line_9", label: "9. de contrats conclus avec des personnes à titre individuel et à leurs frais", indent: 0 },
  { key: "line_10", label: "10. de contrats conclus avec d'autres organismes de formation (y compris CFA)", indent: 0 },
  { key: "line_11", label: "11. Autres produits au titre de la formation professionnelle", indent: 0 },
];

const CHARGE_LINES: { key: string; label: string; indent?: boolean }[] = [
  { key: "total_charges", label: "Total des charges de l'organisme liées à l'activité de formation" },
  { key: "salaires_formateurs", label: "dont Salaires des formateurs", indent: true },
  { key: "achats_prestation", label: "dont Achats de prestation de formation et honoraires de formation", indent: true },
];

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

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filteredFrom, setFilteredFrom] = useState("");
  const [filteredTo, setFilteredTo] = useState("");
  const [showFinancier, setShowFinancier] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingFinancial, setEditingFinancial] = useState(false);
  const [savingFinancial, setSavingFinancial] = useState(false);

  // Computed BPF data
  const [bpf, setBpf] = useState<BPFData>(defaultBPF);

  // Financial data (editable)
  const [sectionC, setSectionC] = useState<Record<string, number>>({});
  const [sectionD, setSectionD] = useState<Record<string, number>>({});
  const [sectionGManual, setSectionGManual] = useState<{ stagiaires: number; heures: number }>({ stagiaires: 0, heures: 0 });

  const fiscalYear = dateFrom ? new Date(dateFrom).getFullYear() : new Date().getFullYear();

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

      // Get sessions with trainer type and training hours
      const sessionQuery = supabase
        .from("sessions")
        .select("id, mode, trainer:trainers(type), training:trainings(duration_hours, classification, nsf_code, nsf_label)")
        .eq("entity_id", entityId)
        .neq("status", "cancelled");

      if (dateFrom) sessionQuery.gte("start_date", dateFrom);
      if (dateTo) sessionQuery.lte("start_date", dateTo + "T23:59:59");

      const { data: sessions } = await sessionQuery;

      let internalHours = 0;
      let externalHours = 0;

      // Map session_id -> { duration_hours, mode, classification, nsf_code, nsf_label }
      const sessionMap: Record<string, { duration: number; mode: string; classification: string | null; nsf_code: string | null; nsf_label: string | null }> = {};

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
          const nsfCode = (training?.nsf_code as string | null) || null;
          const nsfLabel = (training?.nsf_label as string | null) || null;

          if (trainerType === "external") {
            externalHours += hours;
          } else {
            internalHours += hours;
          }

          sessionMap[s.id as string] = { duration: hours, mode, classification, nsf_code: nsfCode, nsf_label: nsfLabel };
        }
      }

      // ─── Section F-1: Learner types ───
      const enrollQuery = supabase
        .from("enrollments")
        .select("id, session_id, learner_id, learner:learners(id, client_id, learner_type)")
        .neq("status", "cancelled");

      const sessionIds = sessions ? sessions.map((s) => s.id as string) : [];
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

      // F-3: aggregate by classification
      const f3Counts: Record<string, { learners: Set<string>; heures: number }> = {
        certifiant: { learners: new Set(), heures: 0 },
        reglementaire: { learners: new Set(), heures: 0 },
        qualifiant: { learners: new Set(), heures: 0 },
        other: { learners: new Set(), heures: 0 },
      };

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

          // F-3 classification
          const classif = sessionInfo?.classification;
          if (classif && f3Counts[classif]) {
            f3Counts[classif].learners.add(learnerId);
            f3Counts[classif].heures += hours;
          } else {
            f3Counts.other.learners.add(learnerId);
            f3Counts.other.heures += hours;
          }

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

      // Build F-3 rows
      const f3Rows = [...defaultBPF.f3];
      // Row 0 (a): certifiant
      f3Rows[0] = { ...f3Rows[0], stagiaires: f3Counts.certifiant.learners.size, heures: f3Counts.certifiant.heures };
      // Row 7 (b): reglementaire -> RS
      f3Rows[7] = { ...f3Rows[7], stagiaires: f3Counts.reglementaire.learners.size, heures: f3Counts.reglementaire.heures };
      // Row 9 (d): qualifiant + other
      f3Rows[9] = {
        ...f3Rows[9],
        stagiaires: f3Counts.qualifiant.learners.size + f3Counts.other.learners.size,
        heures: f3Counts.qualifiant.heures + f3Counts.other.heures,
      };
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

      setBpf({
        personnesInternes: { nombre: internalCount ?? 0, heures: internalHours },
        personnesExternes: { nombre: externalCount ?? 0, heures: externalHours },
        f1: f1Rows,
        f1DistanceCount: distanceLearners.size,
        f2: { stagiaires: 0, heures: 0 },
        f3: f3Rows,
        f4: f4Rows,
        g: sectionGManual,
      });

      // ─── Financial data (Sections C/D/G) ───
      const { data: finData } = await supabase
        .from("bpf_financial_data")
        .select("*")
        .eq("entity_id", entityId)
        .eq("fiscal_year", fiscalYear)
        .maybeSingle();

      if (finData) {
        setSectionC((finData.section_c as Record<string, number>) || {});
        setSectionD((finData.section_d as Record<string, number>) || {});
        const gData = (finData.section_g as Record<string, number>) || {};
        setSectionGManual({ stagiaires: gData.stagiaires || 0, heures: gData.heures || 0 });
      } else {
        setSectionC({});
        setSectionD({});
        setSectionGManual({ stagiaires: 0, heures: 0 });
      }

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

  const handleSaveFinancial = async () => {
    if (!entityId) return;
    setSavingFinancial(true);

    const { error } = await supabase
      .from("bpf_financial_data")
      .upsert(
        {
          entity_id: entityId,
          fiscal_year: fiscalYear,
          section_c: sectionC,
          section_d: sectionD,
          section_g: sectionGManual,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "entity_id,fiscal_year" }
      );

    setSavingFinancial(false);

    if (error) {
      toast({ title: "Erreur", description: "Impossible de sauvegarder les données financières.", variant: "destructive" });
    } else {
      toast({ title: "Succès", description: "Données financières sauvegardées." });
      setEditingFinancial(false);
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: "#3DB5C5" }}
          >
            <Download className="h-4 w-4" />
            Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: "#2563EB" }}
          >
            <FileText className="h-4 w-4" />
            PDF
          </button>
        </div>
      </div>

      {/* ─── SECTION A ─── */}
      <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
        <h2 className="font-bold text-gray-900 text-base mb-4 uppercase">
          A. Identification de l&apos;organisme de formation
        </h2>
        <div className="space-y-2 text-sm text-gray-800">
          <p>Numéro de déclaration: <strong>93132013113</strong></p>
          <p>Numéro de SIRET: <strong>91311329600036</strong></p>
          <p>Code NAF: <strong>8559A</strong></p>
          <p>Nom et prénom ou dénomination (sigle): <strong>{entityName}</strong></p>
          <p>Adresse: <strong>24/26 Boulevard Gay Lussac 13014 Marseille</strong></p>
          <p>Téléphone: <strong>0750461245</strong></p>
          <p>Email: <strong>contact@mrformation.fr</strong></p>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <span className="text-sm text-gray-600">Réglages du bilan financier</span>
          <button
            onClick={() => setShowFinancier(!showFinancier)}
            className={`w-12 h-6 rounded-full transition-colors relative ${showFinancier ? "bg-[#3DB5C5]" : "bg-gray-300"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showFinancier ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
        </div>
      </div>

      {/* ─── SECTION B ─── */}
      <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
        <h2 className="font-bold text-gray-900 text-base mb-3">
          B. Caractéristiques de l&apos;organisme
        </h2>
        <p className="text-sm text-gray-700 mb-4">
          Le bilan pédagogique et financier porte sur l&apos;activité de dispensateur de formation de l&apos;organisme au cours du dernier exercice comptable clos :
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-sm text-gray-700">Début de l&apos;exercice comptable</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
          />
          <span className="text-sm text-gray-700">Fin de l&apos;exercice comptable</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
          />
          <button
            onClick={handleFilter}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: "#3DB5C5" }}
          >
            <Filter className="h-4 w-4" />
            Filtrer
          </button>
        </div>

        <div className="text-sm text-gray-700 space-y-1">
          <p>Après filtre:</p>
          <p>Début de l&apos;exercice comptable: <strong>{filteredFrom || "—"}</strong></p>
          <p>Fin de l&apos;exercice comptable: <strong>{filteredTo || "—"}</strong></p>
        </div>
      </div>

      {/* ─── SECTION C ─── */}
      <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900 text-base">
            C. Bilan financier hors taxes : origine des produits de l&apos;organisme
          </h2>
          <div className="flex items-center gap-2">
            {editingFinancial ? (
              <button
                onClick={handleSaveFinancial}
                disabled={savingFinancial}
                className="text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50"
              >
                {savingFinancial ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Sauvegarder
              </button>
            ) : (
              <button
                onClick={() => setEditingFinancial(true)}
                className="text-gray-600 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 border border-gray-300 hover:bg-white"
              >
                <Pencil className="h-3.5 w-3.5" />
                Modifier
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-700 mb-4">Produits provenant :</p>

        <div className="space-y-2">
          {FINANCIAL_LINES.map((line) => (
            <div
              key={line.key}
              className="flex items-start justify-between gap-4"
              style={{ paddingLeft: line.indent ? `${line.indent * 24}px` : undefined }}
            >
              <p className={`text-sm text-gray-700 flex-1 ${line.bold ? "font-semibold" : ""}`}>
                {line.label}
              </p>
              {editingFinancial && !line.isTotal ? (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={sectionC[line.key] || ""}
                  onChange={(e) => setSectionC((prev) => ({ ...prev, [line.key]: parseFloat(e.target.value) || 0 }))}
                  className="w-36 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-[#3DB5C5]"
                  placeholder="0.00"
                />
              ) : (
                <span className="text-sm text-gray-700 whitespace-nowrap shrink-0">
                  {fmtEur(getLineValue(line.key))}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-300">
          <p className="text-sm text-gray-700">
            des pouvoirs publics pour la formation de publics spécifiques :
          </p>
        </div>

        <div className="mt-6 pt-3 border-t border-gray-300 flex items-start justify-between gap-4">
          <p className="text-sm text-gray-700 font-semibold flex-1">
            Total des produits réalisés au titre de la formation professionnelle
          </p>
          <span className="text-sm text-gray-900 font-bold whitespace-nowrap">
            {fmtEur(totalProduits())}
          </span>
        </div>
      </div>

      {/* ─── SECTION D ─── */}
      <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
        <h2 className="font-bold text-gray-900 text-base mb-3">
          D. Bilan financier hors taxes : charges de l&apos;organisme
        </h2>
        <div className="space-y-2">
          {CHARGE_LINES.map((line) => (
            <div key={line.key} className={`flex justify-between ${line.indent ? "pl-6" : ""}`}>
              <span className="text-sm text-gray-700">{line.label}</span>
              {editingFinancial ? (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={sectionD[line.key] || ""}
                  onChange={(e) => setSectionD((prev) => ({ ...prev, [line.key]: parseFloat(e.target.value) || 0 }))}
                  className="w-36 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-[#3DB5C5]"
                  placeholder="0.00"
                />
              ) : (
                <span className="text-sm text-gray-700">{fmtEur(sectionD[line.key] || 0)}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ─── SECTION E ─── */}
      <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
        <h2 className="font-bold text-gray-900 text-base mb-4">
          E. Personnes dispensant des heures de formation
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-2 w-1/2"></th>
              <th className="text-left py-2">Nombre</th>
              <th className="text-left py-2">Nombre d&apos;heures de formation dispensées</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-300">
              <td className="py-3 text-gray-700">Personnes de votre organisme dispensant des heures de formation</td>
              <td className="py-3 text-gray-800 font-medium">{bpf.personnesInternes.nombre}</td>
              <td className="py-3 text-gray-800 font-medium">{bpf.personnesInternes.heures}</td>
            </tr>
            <tr className="border-t border-gray-200">
              <td className="py-3 text-gray-700">Personnes extérieures à votre organisme dispensant des heures de formation dans le cadre de contrats de sous-traitance</td>
              <td className="py-3 text-gray-800 font-medium">{bpf.personnesExternes.nombre}</td>
              <td className="py-3 text-gray-800 font-medium">{bpf.personnesExternes.heures}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ─── SECTION F-1 ─── */}
      <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
        <h2 className="font-bold text-gray-900 text-base mb-4">
          F – 1. Type de stagiaires de l&apos;organisme
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-2 w-1/2"></th>
              <th className="text-left py-2">Nombre de stagiaires ou d&apos;apprentis</th>
              <th className="text-left py-2">Nombre total d&apos;heures de formation suivies par les stagiaires et les apprentis</th>
            </tr>
          </thead>
          <tbody>
            {bpf.f1.map((row, i) => (
              <tr key={i} className="border-t border-gray-200">
                <td className={`py-3 text-gray-700 ${row.label === "Total" ? "font-semibold" : ""}`}>{row.label}</td>
                <td className="py-3 text-gray-800 font-medium">{row.stagiaires}</td>
                <td className="py-3 text-gray-800 font-medium">{row.heures}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 pt-3 border-t border-gray-300 text-sm text-gray-700">
          dont stagiaires et apprentis ayant suivi une action en tout ou partie à distance: <strong>{bpf.f1DistanceCount}</strong>
        </div>
      </div>

      {/* ─── SECTION F-2 ─── */}
      <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
        <h2 className="font-bold text-gray-900 text-base mb-4">
          F – 2. Dont activité sous-traitée de l&apos;organisme
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-2 w-1/2"></th>
              <th className="text-left py-2">Nombre de stagiaires et d&apos;apprentis</th>
              <th className="text-left py-2">Nombre total d&apos;heures de formation suivies par les stagiaires et les apprentis</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-200">
              <td className="py-3 text-gray-700">a. Stagiaires ou apprentis dont l&apos;action a été confiée par votre organisme à un autre organisme</td>
              <td className="py-3 text-gray-800 font-medium">{bpf.f2.stagiaires}</td>
              <td className="py-3 text-gray-800 font-medium">{bpf.f2.heures}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ─── SECTION F-3 ─── */}
      <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
        <h2 className="font-bold text-gray-900 text-base mb-4">
          F – 3. Objectif général des prestations dispensées
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-2 w-1/2"></th>
              <th className="text-left py-2">Nombre de stagiaires et d&apos;apprentis</th>
              <th className="text-left py-2">Nombre total d&apos;heures de formation suivies par les stagiaires et les apprentis</th>
            </tr>
          </thead>
          <tbody>
            {bpf.f3.map((row, i) => (
              <tr key={i} className="border-t border-gray-200">
                <td className={`py-3 text-gray-700 ${row.indent ? "pl-6" : ""} ${row.label === "Total" ? "font-semibold" : ""}`}>
                  {row.label}
                </td>
                <td className="py-3 text-gray-800 font-medium">{row.stagiaires}</td>
                <td className="py-3 text-gray-800 font-medium">{row.heures}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── SECTION F-4 ─── */}
      <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
        <h2 className="font-bold text-gray-900 text-base mb-4">
          F – 4. Spécialité(s) de formation dispensée(s)
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#3DB5C5] text-white">
              <th className="text-left py-2 px-3">Code & Libellé</th>
              <th className="text-left py-2 px-3">Nombre de stagiaires</th>
              <th className="text-left py-2 px-3">Nombre total d&apos;heures de formation suivies par l&apos;ensemble des stagiaires</th>
            </tr>
          </thead>
          <tbody>
            {bpf.f4.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-gray-400 text-sm">
                  Aucune spécialité enregistrée — Ajoutez des codes NSF aux formations pour remplir cette section
                </td>
              </tr>
            ) : (
              bpf.f4.map((row, i) => (
                <tr key={i} className="border-t border-gray-200">
                  <td className="py-2 px-3 text-gray-700">{row.code}</td>
                  <td className="py-2 px-3 text-gray-800 font-medium">{row.stagiaires}</td>
                  <td className="py-2 px-3 text-gray-800 font-medium">{row.heures}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── SECTION G ─── */}
      <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
        <h2 className="font-bold text-gray-900 text-base mb-4">
          G. Bilan pédagogique : stagiaires dont la formation a été confiée à votre organisme par un autre organisme de formation
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-2 w-1/2"></th>
              <th className="text-left py-2">Nombre de stagiaires et d&apos;apprentis</th>
              <th className="text-left py-2">Nombre total d&apos;heures de formation suivies par les stagiaires et les apprentis</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-200">
              <td className="py-3 text-gray-700">Formations confiées à votre organisme par un autre organisme de formation</td>
              {editingFinancial ? (
                <>
                  <td className="py-3">
                    <input
                      type="number"
                      min="0"
                      value={sectionGManual.stagiaires || ""}
                      onChange={(e) => setSectionGManual((prev) => ({ ...prev, stagiaires: parseInt(e.target.value) || 0 }))}
                      className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-[#3DB5C5]"
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="number"
                      min="0"
                      value={sectionGManual.heures || ""}
                      onChange={(e) => setSectionGManual((prev) => ({ ...prev, heures: parseInt(e.target.value) || 0 }))}
                      className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-[#3DB5C5]"
                    />
                  </td>
                </>
              ) : (
                <>
                  <td className="py-3 text-gray-800 font-medium">{sectionGManual.stagiaires}</td>
                  <td className="py-3 text-gray-800 font-medium">{sectionGManual.heures}</td>
                </>
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
