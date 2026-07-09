"use client";

import type { CSSProperties } from "react";
import {
  Building2,
  Users,
  BookOpen,
  CheckCircle,
  Euro,
  TrendingUp,
  ClipboardCheck,
  MessageSquare,
  Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { KpiConfigItem } from "./types";

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1).replace(".", ",")} M€`;
  }
  if (value >= 10_000) {
    const k = value / 1_000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1).replace(".", ",")} k€`;
  }
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

interface AdminKPICardsProps {
  loading: boolean;
  year: number;
  activeClients: number;
  newLearners: number;
  ongoingSessions: number;
  doneSessions: number;
  caRealise: number;
  caPrevisionnel: number;
  tauxCompletion: number;
  nbQuestionnaireResponses: number;
  kpiConfig: KpiConfigItem[];
}

export function AdminKPICards({
  loading,
  year,
  activeClients,
  newLearners,
  ongoingSessions,
  doneSessions,
  caRealise,
  caPrevisionnel,
  tauxCompletion,
  nbQuestionnaireResponses,
  kpiConfig,
}: AdminKPICardsProps) {
  const ALL_KPIS = [
    { id: "clients_actifs",      icon: <Building2 className="h-6 w-6 text-purple-600" />, bg: "bg-purple-100", value: activeClients, label: "Clients Actifs", format: "number", help: "Nombre de clients au statut « actif » (toutes années confondues)." },
    { id: "nouveaux_apprenants", icon: <Users className="h-6 w-6 text-blue-600" />,       bg: "bg-blue-100",   value: newLearners,   label: "Apprenants Inscrits", format: "number", help: `Apprenants créés durant l'année ${year}.` },
    { id: "sessions_en_cours",   icon: <BookOpen className="h-6 w-6 text-orange-500" />,  bg: "bg-orange-100", value: ongoingSessions, label: "Formations En Cours", format: "number", help: "Sessions au statut « en cours » (toutes années confondues)." },
    { id: "sessions_terminees",  icon: <CheckCircle className="h-6 w-6 text-green-600" />,bg: "bg-green-100",  value: doneSessions,  label: "Formations Terminées", format: "number", help: `Sessions terminées dont la date de fin est en ${year}.` },
    { id: "ca_realise",          icon: <Euro className="h-6 w-6" style={{ color: "#374151" }} />, bg: "", bgStyle: { backgroundColor: "#e0f5f8" } as CSSProperties, value: caRealise, label: `CA Réalisé ${year}`, format: "currency", help: `Total facturé ENCAISSÉ en ${year} : factures payées, hors avoirs. Somme des montants des factures « payées » dont l'encaissement (ou la création) est en ${year}.` },
    { id: "ca_previsionnel",     icon: <TrendingUp className="h-6 w-6 text-indigo-600" />,bg: "bg-indigo-100", value: caPrevisionnel, label: `CA Prévisionnel ${year}`, format: "currency", help: `Total facturé NON ENCORE ENCAISSÉ en ${year} : factures émises en attente / envoyées / en retard, hors avoirs. C'est ce qu'il reste à encaisser sur ce qui est déjà facturé (pas les devis ni les sessions non facturées).` },
    { id: "taux_completion",     icon: <ClipboardCheck className="h-6 w-6 text-teal-600" />, bg: "bg-teal-100", value: tauxCompletion, label: "Taux de Complétion", format: "percent", help: `Part des inscriptions ${year} terminées : inscriptions terminées ÷ total des inscriptions de l'année.` },
    { id: "nb_questionnaires",   icon: <MessageSquare className="h-6 w-6 text-pink-600" />,  bg: "bg-pink-100",  value: nbQuestionnaireResponses, label: "Réponses ce mois", format: "number", help: "Réponses aux questionnaires soumises durant le mois en cours." },
  ];

  const visibleKpis = kpiConfig
    .filter((k) => k.visible)
    .sort((a, b) => a.order - b.order)
    .map((k) => ALL_KPIS.find((kpi) => kpi.id === k.id))
    .filter(Boolean) as typeof ALL_KPIS;

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-28 rounded-lg bg-gray-200 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4")}>
        {visibleKpis.map((kpi) => (
          <Card key={kpi.id} className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn("rounded-full p-3 shrink-0", kpi.bg)} style={(kpi as {bgStyle?: CSSProperties}).bgStyle}>
                {kpi.icon}
              </div>
              <div className="min-w-0">
                <p className={cn("font-bold text-gray-800", kpi.format === "currency" ? "text-lg lg:text-xl" : "text-3xl")}>
                  {kpi.format === "currency"
                    ? formatCurrency(Number(kpi.value))
                    : kpi.format === "percent"
                    ? `${kpi.value}%`
                    : kpi.value}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                  <span className="truncate">{kpi.label}</span>
                  {/* Info-bulle native (pas de dépendance Tooltip) : méthode de calcul au survol. */}
                  <span title={kpi.help} aria-label={kpi.help} className="shrink-0 cursor-help inline-flex">
                    <Info className="h-3 w-3 text-gray-400" />
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500 px-1">
        <span><strong className="text-gray-800">{ongoingSessions}</strong> formation{ongoingSessions > 1 ? "s" : ""} en cours</span>
        <span><strong className="text-gray-800">{doneSessions}</strong> terminée{doneSessions > 1 ? "s" : ""} {year}</span>
      </div>
    </div>
  );
}
