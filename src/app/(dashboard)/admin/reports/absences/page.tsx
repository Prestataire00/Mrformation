"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";

interface AbsenceRow {
  creneau: string;
  formation: string;
  apprenant: string;
  motif: string;
  dateRetour: string;
  type: string;
}

const ALL_ABSENCES: AbsenceRow[] = [
  { creneau: "2025-05-23 09:00:00 - 2025-05-23 12:00:00", formation: "LA TOILETTE BIENVEILLANTE ET SIMULATEUR DE VIEILLISSEMENT", apprenant: "VENTURINI Brigitte", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-05-23 13:00:00 - 2025-05-23 17:00:00", formation: "LA TOILETTE BIENVEILLANTE ET SIMULATEUR DE VIEILLISSEMENT", apprenant: "VENTURINI Brigitte", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-05-23 09:00:00 - 2025-05-23 12:00:00", formation: "LA TOILETTE BIENVEILLANTE ET SIMULATEUR DE VIEILLISSEMENT", apprenant: "OUASSEM Fathia", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-05-23 13:00:00 - 2025-05-23 17:00:00", formation: "LA TOILETTE BIENVEILLANTE ET SIMULATEUR DE VIEILLISSEMENT", apprenant: "OUASSEM Fathia", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-05-23 09:00:00 - 2025-05-23 12:00:00", formation: "LA TOILETTE BIENVEILLANTE ET SIMULATEUR DE VIEILLISSEMENT", apprenant: "SANCHEZ Alexandra", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-05-23 13:00:00 - 2025-05-23 17:00:00", formation: "LA TOILETTE BIENVEILLANTE ET SIMULATEUR DE VIEILLISSEMENT", apprenant: "SANCHEZ Alexandra", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-05-27 09:00:00 - 2025-05-27 12:00:00", formation: "Communication non violente", apprenant: "BAILLEUX Vanessa", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-05-19 09:00:00 - 2025-05-19 12:00:00", formation: "LA BIENTRAITANCE", apprenant: "RIGUTTO Martine", motif: "non communiqué", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-06-03 09:00:00 - 2025-06-03 12:00:00", formation: "FAIRE FACE À LA PRESSION PROFESSIONNELLE", apprenant: "VOLBRECHT Myriam", motif: "?", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-06-03 09:00:00 - 2025-06-03 12:00:00", formation: "FAIRE FACE À LA PRESSION PROFESSIONNELLE", apprenant: "JULIEN Carine", motif: "ABSENCE QUI M4 2T2 ANNONC2E PAR LES RH", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-06-12 09:00:00 - 2025-06-12 12:00:00", formation: "Soins des pieds en EHPAD", apprenant: "CASCINO Marie-Laure", motif: "maladie", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-06-13 09:00:00 - 2025-06-13 12:00:00", formation: "Accompagnement des personnes en situation de handicap au sport", apprenant: "SIVIGNON Florian", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-06-13 13:00:00 - 2025-06-13 17:00:00", formation: "Accompagnement des personnes en situation de handicap au sport", apprenant: "SIVIGNON Florian", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-06-17 09:00:00 - 2025-06-17 12:00:00", formation: "FAIRE FACE À LA PRESSION PROFESSIONNELLE", apprenant: "MANFREDIE Laure", motif: "ABSENCE QUI M4 2T2 ANNONC2E PAR LES RH", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-06-26 13:00:00 - 2025-06-26 17:00:00", formation: "MANAGERS – PRÉVENTION DES RISQUES PSYCHO-SOCIAUX", apprenant: "MOUSSA Ikram", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-06-27 13:00:00 - 2025-06-27 17:00:00", formation: "MANAGERS – PRÉVENTION DES RISQUES PSYCHO-SOCIAUX", apprenant: "MOUSSA Ikram", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-07-10 09:00:00 - 2025-07-10 12:00:00", formation: "DONNER DES CLES AUX METIERS DE PROXIMITE POUR ABORDER LE QUOTIDIEN AVEC SERENITE", apprenant: "PARRA Bernard", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-07-10 13:00:00 - 2025-07-10 17:00:00", formation: "DONNER DES CLES AUX METIERS DE PROXIMITE POUR ABORDER LE QUOTIDIEN AVEC SERENITE", apprenant: "PARRA Bernard", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-07-11 09:00:00 - 2025-07-11 12:00:00", formation: "DONNER DES CLES AUX METIERS DE PROXIMITE POUR ABORDER LE QUOTIDIEN AVEC SERENITE", apprenant: "PARRA Bernard", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-07-11 13:00:00 - 2025-07-11 17:00:00", formation: "DONNER DES CLES AUX METIERS DE PROXIMITE POUR ABORDER LE QUOTIDIEN AVEC SERENITE", apprenant: "PARRA Bernard", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-01 09:00:00 - 2025-09-01 12:00:00", formation: "L\u2019ACCOMPAGNEMENT SPECIFIQUE DES PERSONNES VIEILLISSANTES A PATHOLOGIES PSYCHIATRIQUES ET CONDUITES ADDICTIVES", apprenant: "BOUXIN Karine", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-01 13:00:00 - 2025-09-01 17:00:00", formation: "L\u2019ACCOMPAGNEMENT SPECIFIQUE DES PERSONNES VIEILLISSANTES A PATHOLOGIES PSYCHIATRIQUES ET CONDUITES ADDICTIVES", apprenant: "BOUXIN Karine", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-02 09:00:00 - 2025-09-02 12:00:00", formation: "L\u2019ACCOMPAGNEMENT SPECIFIQUE DES PERSONNES VIEILLISSANTES A PATHOLOGIES PSYCHIATRIQUES ET CONDUITES ADDICTIVES", apprenant: "BOUXIN Karine", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-02 13:00:00 - 2025-09-02 17:00:00", formation: "L\u2019ACCOMPAGNEMENT SPECIFIQUE DES PERSONNES VIEILLISSANTES A PATHOLOGIES PSYCHIATRIQUES ET CONDUITES ADDICTIVES", apprenant: "BOUXIN Karine", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-01 09:00:00 - 2025-09-01 12:00:00", formation: "L\u2019ACCOMPAGNEMENT SPECIFIQUE DES PERSONNES VIEILLISSANTES A PATHOLOGIES PSYCHIATRIQUES ET CONDUITES ADDICTIVES", apprenant: "YOUCEF Maissane", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-01 13:00:00 - 2025-09-01 17:00:00", formation: "L\u2019ACCOMPAGNEMENT SPECIFIQUE DES PERSONNES VIEILLISSANTES A PATHOLOGIES PSYCHIATRIQUES ET CONDUITES ADDICTIVES", apprenant: "YOUCEF Maissane", motif: "", dateRetour: "2025-09-02", type: "Absence Injustifiée" },
  { creneau: "2025-09-09 09:00:00 - 2025-09-09 12:00:00", formation: "MANAGEMENT VISUEL", apprenant: "CAMINADE Anne Marie", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-09 09:00:00 - 2025-09-09 12:00:00", formation: "MANAGEMENT VISUEL", apprenant: "DELLA VECCHIA Martine", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-17 09:00:00 - 2025-09-17 12:00:00", formation: "MANAGEMENT VISUEL", apprenant: "GIOCANTI Vanessa", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-10 09:00:00 - 2025-09-10 12:00:00", formation: "Le Toucher Relationnel", apprenant: "BABENKO Emmanuelle", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-10 13:00:00 - 2025-09-10 17:00:00", formation: "Le Toucher Relationnel", apprenant: "BABENKO Emmanuelle", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-11 09:00:00 - 2025-09-11 12:00:00", formation: "Le Toucher Relationnel", apprenant: "BABENKO Emmanuelle", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-11 13:00:00 - 2025-09-11 17:00:00", formation: "Le Toucher Relationnel", apprenant: "BABENKO Emmanuelle", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-23 09:00:00 - 2025-09-23 12:00:00", formation: "Etat des lieux d\u2019entree", apprenant: "BENMEHDI Rayan", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-23 13:00:00 - 2025-09-23 17:00:00", formation: "Etat des lieux d\u2019entree", apprenant: "BENMEHDI Rayan", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-24 09:00:00 - 2025-09-24 12:00:00", formation: "Etat des lieux d\u2019entree", apprenant: "BENMEHDI Rayan", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-24 13:00:00 - 2025-09-24 17:00:00", formation: "Etat des lieux d\u2019entree", apprenant: "BENMEHDI Rayan", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-09-29 09:00:00 - 2025-09-29 12:00:00", formation: "Gestions des appels téléphoniques", apprenant: "ZIBO ADAMOU Haoua", motif: "ARRET MALADIE", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-10-06 09:00:00 - 2025-10-06 12:00:00", formation: "GESTION DES CONFLITS", apprenant: "RIVIERE Anne-Cecile", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-10-06 09:00:00 - 2025-10-06 12:00:00", formation: "GESTION DES CONFLITS", apprenant: "TIMERICHT Mohamed", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-06-17 09:00:00 - 2025-06-17 12:00:00", formation: "Soins palliatifs : Accompagnement en fin de vie", apprenant: "BLANCHARD Manon", motif: "Directrice de l\u2019 établissement", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-06-17 13:00:00 - 2025-06-17 17:00:00", formation: "Soins palliatifs : Accompagnement en fin de vie", apprenant: "BLANCHARD Manon", motif: "Directrice de l\u2019 établissement", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-06 09:00:00 - 2025-11-06 12:00:00", formation: "Les fondamentaux pour devenir manager de proximité", apprenant: "BENAZA Karim", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-11-06 09:00:00 - 2025-11-06 12:00:00", formation: "Les fondamentaux pour devenir manager de proximité", apprenant: "PORCHEDDU RIFFAUT Odin", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-11-06 09:00:00 - 2025-11-06 12:00:00", formation: "Les fondamentaux pour devenir manager de proximité", apprenant: "MEKHAREF Rachid", motif: "ARRET MALADIE", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-11-17 09:00:00 - 2025-11-17 12:00:00", formation: "LA BIENTRAITANCE AUTOURS DU REPAS", apprenant: "SPIEGEL Karlin", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-17 13:00:00 - 2025-11-17 17:00:00", formation: "LA BIENTRAITANCE AUTOURS DU REPAS", apprenant: "SPIEGEL Karlin", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-18 09:00:00 - 2025-11-18 12:00:00", formation: "LA BIENTRAITANCE AUTOURS DU REPAS", apprenant: "SPIEGEL Karlin", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-18 13:00:00 - 2025-11-18 17:00:00", formation: "LA BIENTRAITANCE AUTOURS DU REPAS", apprenant: "SPIEGEL Karlin", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2025-11-17 09:00:00 - 2025-11-17 12:00:00", formation: "LA BIENTRAITANCE AUTOURS DU REPAS", apprenant: "REGAZZONI Marlène", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-17 13:00:00 - 2025-11-17 17:00:00", formation: "LA BIENTRAITANCE AUTOURS DU REPAS", apprenant: "REGAZZONI Marlène", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-18 09:00:00 - 2025-11-18 12:00:00", formation: "LA BIENTRAITANCE AUTOURS DU REPAS", apprenant: "REGAZZONI Marlène", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-18 13:00:00 - 2025-11-18 17:00:00", formation: "LA BIENTRAITANCE AUTOURS DU REPAS", apprenant: "REGAZZONI Marlène", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-20 09:00:00 - 2025-11-20 12:00:00", formation: "Éthique et Fin de Vie", apprenant: "PACUTA Amandine", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-20 13:00:00 - 2025-11-20 17:00:00", formation: "Éthique et Fin de Vie", apprenant: "PACUTA Amandine", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-21 09:00:00 - 2025-11-21 12:00:00", formation: "Éthique et Fin de Vie", apprenant: "PACUTA Amandine", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-21 13:00:00 - 2025-11-21 17:00:00", formation: "Éthique et Fin de Vie", apprenant: "PACUTA Amandine", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-20 09:00:00 - 2025-11-20 12:00:00", formation: "Éthique et Fin de Vie", apprenant: "LAURE Angeline", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-20 13:00:00 - 2025-11-20 17:00:00", formation: "Éthique et Fin de Vie", apprenant: "LAURE Angeline", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-21 09:00:00 - 2025-11-21 12:00:00", formation: "Éthique et Fin de Vie", apprenant: "LAURE Angeline", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-21 13:00:00 - 2025-11-21 17:00:00", formation: "Éthique et Fin de Vie", apprenant: "LAURE Angeline", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-20 09:00:00 - 2025-11-20 12:00:00", formation: "Éthique et Fin de Vie", apprenant: "NOWAK Julie", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-20 13:00:00 - 2025-11-20 17:00:00", formation: "Éthique et Fin de Vie", apprenant: "NOWAK Julie", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-21 09:00:00 - 2025-11-21 12:00:00", formation: "Éthique et Fin de Vie", apprenant: "NOWAK Julie", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2025-11-21 13:00:00 - 2025-11-21 17:00:00", formation: "Éthique et Fin de Vie", apprenant: "NOWAK Julie", motif: "", dateRetour: "", type: "Absence Justifiée" },
  { creneau: "2026-02-26 09:00:00 - 2026-02-26 12:00:00", formation: "L\u2019ACCOMPAGNEMENT SPECIFIQUE DES PERSONNES VIEILLISSANTES A PATHOLOGIES PSYCHIATRIQUES ET CONDUITES ADDICTIVES", apprenant: "FAUCONNIER Emilie", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2026-02-26 13:00:00 - 2026-02-26 17:00:00", formation: "L\u2019ACCOMPAGNEMENT SPECIFIQUE DES PERSONNES VIEILLISSANTES A PATHOLOGIES PSYCHIATRIQUES ET CONDUITES ADDICTIVES", apprenant: "FAUCONNIER Emilie", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2026-02-27 09:00:00 - 2026-02-27 12:00:00", formation: "L\u2019ACCOMPAGNEMENT SPECIFIQUE DES PERSONNES VIEILLISSANTES A PATHOLOGIES PSYCHIATRIQUES ET CONDUITES ADDICTIVES", apprenant: "FAUCONNIER Emilie", motif: "", dateRetour: "", type: "Absence Injustifiée" },
  { creneau: "2026-02-27 13:00:00 - 2026-02-27 17:00:00", formation: "L\u2019ACCOMPAGNEMENT SPECIFIQUE DES PERSONNES VIEILLISSANTES A PATHOLOGIES PSYCHIATRIQUES ET CONDUITES ADDICTIVES", apprenant: "FAUCONNIER Emilie", motif: "", dateRetour: "", type: "Absence Injustifiée" },
];

/** Total créneaux × apprenants inscrits par année (données de référence VisioFormation) */
const TOTAL_SLOTS_BY_YEAR: Record<number, number> = {
  2025: 261,
  2026: 93,
};

function getYear(creneau: string): number {
  return parseInt(creneau.substring(0, 4), 10);
}

export default function AbsencesPage() {
  const [year, setYear] = useState<number>(2026);

  const absences = useMemo(
    () => ALL_ABSENCES.filter((a) => getYear(a.creneau) === year),
    [year]
  );

  const absenceCount = absences.length;
  const returnCount = absences.filter((a) => a.dateRetour).length;
  const noReturnCount = absences.filter((a) => !a.dateRetour).length;
  const totalSlots = TOTAL_SLOTS_BY_YEAR[year] ?? 0;
  const absencePct = totalSlots > 0 ? ((absenceCount / totalSlots) * 100).toFixed(2) : "0.00";
  const returnPct = totalSlots > 0 ? ((returnCount / totalSlots) * 100).toFixed(2) : "0.00";
  const noReturnPct = totalSlots > 0 ? ((noReturnCount / totalSlots) * 100).toFixed(2) : "0.00";
  const abandonPct = "0.00";

  const handleDownload = () => {
    const headers = ["Créneau de l'absence", "Formation", "Apprenant", "Motif", "Date de retour", "Type"];
    const rows = absences.map((a) => [a.creneau, a.formation, a.apprenant, a.motif, a.dateRetour, a.type]);
    downloadXlsx(headers, rows, `suivi_absences_${year}.xlsx`);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Suivi des Absences</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setYear((y) => y - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[56px] text-center text-sm font-semibold text-gray-800">
              {year}
            </span>
            <button
              onClick={() => setYear((y) => y + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={handleDownload}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
            style={{ background: "#3DB5C5" }}
          >
            <Download className="h-4 w-4" />
            Télécharger en Excel
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 space-y-1 text-sm text-gray-700">
        <p>Pourcentage d&apos;absence: <strong>{absencePct}%</strong></p>
        <p>Pourcentage de retour en formation: <strong>{returnPct}%</strong></p>
        <p>Pourcentage d&apos;absence sans date de retours: <strong>{noReturnPct}%</strong></p>
        <p>Pourcentage d&apos;abandon: <strong>{abandonPct}%</strong></p>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Créneau de l&apos;absence</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Formation</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Apprenant</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Motif</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Date de retour</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
            </tr>
          </thead>
          <tbody>
            {absences.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-gray-400">
                  Aucune absence enregistrée sur cette période
                </td>
              </tr>
            ) : (
              absences.map((row, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700 text-xs">{row.creneau}</td>
                  <td className="px-4 py-3 text-[#3DB5C5] text-xs">{row.formation}</td>
                  <td className="px-4 py-3 text-gray-700">{row.apprenant}</td>
                  <td className="px-4 py-3 text-gray-600">{row.motif}</td>
                  <td className="px-4 py-3 text-gray-600">{row.dateRetour || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{row.type}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
