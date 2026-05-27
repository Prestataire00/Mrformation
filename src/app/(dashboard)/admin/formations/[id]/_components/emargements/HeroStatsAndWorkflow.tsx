"use client";

import {
  QrCode, Download, UserCheck,
} from "lucide-react";

interface HeroStatsAndWorkflowProps {
  formationId: string;
  hasTimeSlots: boolean;
  totalSigned: number;
  totalExpected: number;
  completionPct: number;
  timeSlotsCount: number;
  // Workflow card states
  generatingTokens: boolean;
  exportingPdf: boolean;
  sendingToTrainer: boolean;
  pdfProgress: { current: number; total: number };
  // Workflow card handlers
  onGenerateAllTokens: () => void;
  onExportPdf: () => void;
  onSendToTrainer: () => void;
  onDownloadPlanningHebdo: () => void;
  onExportEmargementPdf: () => void;
  onExportEmargementPerCompany: () => void;
  onPrintEmpty: () => void;
  // Visibility for per-company button (INTER only, no active filter)
  hasMultipleCompanies: boolean;
  companiesCount: number;
  // Disable send-to-trainer when no trainer assigned
  hasTrainers: boolean;
}

export function HeroStatsAndWorkflow(props: HeroStatsAndWorkflowProps) {
  return (
    <>
      {/* ═══ HERO ROW ═══ */}
      {props.hasTimeSlots && (
        <div className="grid grid-cols-3 gap-3">
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Signatures</p>
            <p className="text-xl font-bold">{props.totalSigned}<span className="text-sm font-normal text-muted-foreground">/{props.totalExpected}</span></p>
            <div className="mt-1.5 bg-gray-100 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full transition-all ${props.completionPct === 100 ? "bg-green-500" : props.completionPct > 0 ? "bg-amber-400" : "bg-gray-200"}`} style={{ width: `${props.completionPct}%` }} />
            </div>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Taux de présence</p>
            <p className="text-xl font-bold">{props.completionPct}%</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Créneaux</p>
            <p className="text-xl font-bold">{props.timeSlotsCount}</p>
          </div>
        </div>
      )}

      {/* ═══ 3 CARDS WORKFLOW ═══ */}
      {props.hasTimeSlots && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1 — PRÉPARER */}
          <div className="border rounded-xl p-4 bg-blue-50/50 border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <QrCode className="h-4 w-4 text-blue-700" />
              </div>
              <h3 className="font-semibold text-gray-900">📤 Préparer</h3>
            </div>
            <p className="text-xs text-gray-600 mb-3">Distribuer la signature aux apprenants</p>
            <a
              href={`/admin/formations/${props.formationId}/emargement-live`}
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg text-center transition-colors mb-2"
              title="1 QR projeté pour toute la session — apprenants scannent et choisissent leur nom"
            >
              📱 Mode présentation
            </a>
            <div className="text-[11px] text-gray-500 space-y-1">
              <button
                type="button"
                onClick={props.onGenerateAllTokens}
                disabled={props.generatingTokens}
                className="block w-full text-left hover:text-blue-700"
              >
                → Générer QR individuels (1 par apprenant)
              </button>
              <button
                type="button"
                onClick={props.onSendToTrainer}
                disabled={props.sendingToTrainer || !props.hasTrainers}
                className="block w-full text-left hover:text-blue-700"
              >
                → Envoyer les QR par email au formateur
              </button>
              <button
                type="button"
                onClick={props.onExportPdf}
                disabled={props.exportingPdf}
                className="block w-full text-left hover:text-blue-700"
              >
                → Télécharger PDF des QR à imprimer
              </button>
            </div>
          </div>

          {/* Card 2 — SUIVRE */}
          <div className="border rounded-xl p-4 bg-emerald-50/50 border-emerald-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <UserCheck className="h-4 w-4 text-emerald-700" />
              </div>
              <h3 className="font-semibold text-gray-900">✅ Suivre</h3>
            </div>
            <p className="text-xs text-gray-600 mb-3">Pendant la formation : vérifier les présences</p>
            <a
              href={`/admin/formations/${props.formationId}/emargement-live`}
              className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2 rounded-lg text-center transition-colors mb-2"
              title="Page live avec liste apprenants signés/en attente, mise à jour toutes les 3 sec"
            >
              👁 Voir les présences en direct
            </a>
            <div className="text-[11px] text-gray-500">
              Vous pouvez également faire signer manuellement chaque apprenant ci-dessous (mode &laquo; appel &raquo;).
            </div>
          </div>

          {/* Card 3 — EXPORTER */}
          <div className="border rounded-xl p-4 bg-purple-50/50 border-purple-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Download className="h-4 w-4 text-purple-700" />
              </div>
              <h3 className="font-semibold text-gray-900">📄 Exporter</h3>
            </div>
            <p className="text-xs text-gray-600 mb-3">Justificatifs Qualiopi après formation</p>
            <button
              type="button"
              onClick={props.onExportEmargementPdf}
              className="block w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium px-3 py-2 rounded-lg text-center transition-colors mb-2"
              title="PDF complet avec toutes les signatures collectées"
            >
              📥 Feuille d&apos;émargement signée
            </button>
            {/* Story 3.4 — Export 1 PDF par entreprise (INTER uniquement, sans filtre actif) */}
            {props.hasMultipleCompanies && (
              <button
                type="button"
                onClick={props.onExportEmargementPerCompany}
                className="block w-full border border-purple-300 text-purple-700 hover:bg-purple-100 disabled:opacity-50 text-sm font-medium px-3 py-2 rounded-lg text-center transition-colors mb-2"
                title="Génère 1 feuille d'émargement par entreprise rattachée"
              >
                📥 1 PDF par entreprise ({props.companiesCount})
              </button>
            )}
            <div className="text-[11px] text-gray-500 space-y-1">
              <button
                type="button"
                onClick={props.onDownloadPlanningHebdo}
                className="block w-full text-left hover:text-purple-700"
              >
                → Planning hebdo signé (paysage)
              </button>
              <button
                type="button"
                onClick={props.onPrintEmpty}
                className="block w-full text-left hover:text-purple-700"
              >
                → Imprimer une feuille vide
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
