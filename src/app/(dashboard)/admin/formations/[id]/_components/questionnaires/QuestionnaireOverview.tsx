"use client";

import { CheckCircle2, AlertCircle, Pause } from "lucide-react";

interface Props {
  attributed: number;
  sent: number;
  expectedSent: number;
  answered: number;
  pending: number;
  qualiopi: {
    satisfactionRate: number | null;
    satisfactionResponses: number;
    acquisitionRate: number | null;
    evaluationCount: number;
  } | null;
  onScrollToPending?: () => void;
}

function getQualiopiStatus(rate: number | null, count: number): "ok" | "partial" | "pending" {
  if (count === 0) return "pending";
  if (rate !== null && rate >= 70) return "ok";
  return "partial";
}

function StatusIcon({ status }: { status: "ok" | "partial" | "pending" }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-300 inline" />;
  if (status === "partial") return <AlertCircle className="h-4 w-4 text-amber-300 inline" />;
  return <Pause className="h-4 w-4 text-gray-300 inline" />;
}

export function QuestionnaireOverview({ attributed, sent, expectedSent, answered, pending, qualiopi, onScrollToPending }: Props) {
  const satisfactionStatus = qualiopi ? getQualiopiStatus(qualiopi.satisfactionRate, qualiopi.satisfactionResponses) : "pending";
  const acquisitionStatus = qualiopi ? getQualiopiStatus(qualiopi.acquisitionRate, qualiopi.evaluationCount) : "pending";

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-xl p-5 mb-6">
      <h2 className="text-lg font-semibold mb-4">Questionnaires de la session</h2>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white/10 rounded-lg p-3">
          <p className="text-[11px] text-white/60 uppercase">Attribués</p>
          <p className="text-2xl font-bold mt-1">{attributed}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-3">
          <p className="text-[11px] text-white/60 uppercase">Envoyés</p>
          <p className="text-2xl font-bold mt-1">{sent}<span className="text-sm text-white/60">/{expectedSent}</span></p>
        </div>
        <div className="bg-white/10 rounded-lg p-3">
          <p className="text-[11px] text-white/60 uppercase">Répondus</p>
          <p className="text-2xl font-bold mt-1">{answered}<span className="text-sm text-white/60">/{sent}</span></p>
        </div>
        <button
          onClick={onScrollToPending}
          className="bg-white/10 rounded-lg p-3 text-left hover:bg-white/20 transition-colors cursor-pointer"
          disabled={!onScrollToPending}
        >
          <p className="text-[11px] text-white/60 uppercase">En attente</p>
          <p className="text-2xl font-bold mt-1">{pending}</p>
        </button>
      </div>

      <div className="text-sm flex items-center flex-wrap gap-x-4 gap-y-1 text-white/90">
        <span className="text-white/70 font-semibold">Qualiopi :</span>
        <span><StatusIcon status={satisfactionStatus} /> Satisfaction ({qualiopi?.satisfactionResponses ?? 0} réponse{(qualiopi?.satisfactionResponses ?? 0) > 1 ? "s" : ""})</span>
        <span><StatusIcon status={acquisitionStatus} /> Acquisition ({qualiopi?.evaluationCount ?? 0} évaluation{(qualiopi?.evaluationCount ?? 0) > 1 ? "s" : ""})</span>
      </div>
    </div>
  );
}
