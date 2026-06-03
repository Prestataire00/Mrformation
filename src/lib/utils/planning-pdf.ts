/**
 * PLAN-7 audit BMAD — Génère un PDF récapitulatif du planning d'une
 * session via jsPDF + autoTable (déjà installés dans le projet).
 *
 * Format : 1 tableau A4 portrait avec colonnes Date | Horaire | Titre |
 * Module pédagogique. Tri chronologique. Inclut un en-tête (titre session
 * + dates globales) et un pied de page (date d'édition).
 *
 * Différent du hack window.print() initial : pas de dépendance au DOM,
 * pas de CSS print, pas d'ouverture de popup → fonctionne en headless.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { FormationTimeSlot } from "@/lib/types";

export interface PlanningPdfInput {
  sessionTitle: string;
  sessionStart?: string | null;
  sessionEnd?: string | null;
  slots: FormationTimeSlot[];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

export function generatePlanningPdf(input: PlanningPdfInput): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // En-tête
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Planning de formation", 14, 18);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(input.sessionTitle, 14, 26);

  if (input.sessionStart && input.sessionEnd) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Du ${fmtDate(input.sessionStart)} au ${fmtDate(input.sessionEnd)}`, 14, 32);
    doc.setTextColor(0);
  }

  // Tri chronologique
  const sorted = [...input.slots].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );

  const body = sorted.map((s) => [
    fmtDate(s.start_time),
    `${fmtTime(s.start_time)} – ${fmtTime(s.end_time)}`,
    s.title || "",
    s.module_title || "",
  ]);

  autoTable(doc, {
    startY: 38,
    head: [["Date", "Horaire", "Titre du créneau", "Module pédagogique"]],
    body,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [55, 65, 81], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 28 },
      2: { cellWidth: 56 },
      3: { cellWidth: "auto" as unknown as number },
    },
  });

  // Pied de page (toutes pages)
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(
      `Édité le ${new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`,
      14,
      doc.internal.pageSize.getHeight() - 8,
    );
    doc.text(
      `Page ${i} / ${pageCount}`,
      doc.internal.pageSize.getWidth() - 14,
      doc.internal.pageSize.getHeight() - 8,
      { align: "right" },
    );
    doc.setTextColor(0);
  }

  return doc;
}
