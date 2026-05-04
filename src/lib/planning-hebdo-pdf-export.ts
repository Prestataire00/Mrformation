import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Génère un PDF planning hebdomadaire en paysage A4, 1 page max.
 * Affiche les signatures collectées dans une grille calendrier (matin / après-midi).
 *
 * Pourquoi en jsPDF natif (et pas CloudConvert) :
 *   - Pas de quota CloudConvert (free tier 25/jour) à gérer
 *   - Pas de dépendance externe (offline-friendly)
 *   - Génération instantanée (pas de cold start)
 *   - Limite : pas de styles HTML rich, mais le format tableau s'y prête bien
 */

export interface PlanningHebdoParams {
  formationTitle: string;
  startDate: string;
  endDate: string;
  location: string | null;
  durationHours: number;
  entityName: string;
  trainers: { id: string; first_name: string; last_name: string }[];
  learners: { id: string; first_name: string; last_name: string }[];
  timeSlots: { id: string; start_time: string; end_time: string }[];
  signatures: Array<{
    time_slot_id: string | null;
    signer_id: string;
    signer_type: string;
    signature_data: string | null;
    signed_at: string | null;
  }>;
}

function getCompanyInfo(entityName: string) {
  if (entityName.toLowerCase().includes("c3v")) {
    return { name: "C3V FORMATION", nda: "à compléter" };
  }
  return { name: "MR FORMATION", nda: "93132013113" };
}

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getSlotMoment(iso: string): "M" | "AM" {
  const hour = new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", hour12: false, timeZone: "Europe/Paris" });
  return parseInt(hour, 10) < 13 ? "M" : "AM";
}

function getDayDate(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getDayShort(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });
}

/**
 * Convertit la signature_data (souvent SVG ou base64) en image bitmap PNG.
 * jsPDF ne supporte pas SVG → on rasterise via canvas.
 */
async function svgToPng(svgData: string, width = 80, height = 30): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      // Si déjà data URL PNG → on retourne tel quel
      if (svgData.startsWith("data:image/png")) {
        resolve(svgData);
        return;
      }

      // Si SVG : rasterise via canvas
      const svgString = svgData.startsWith("<svg") ? svgData : decodeURIComponent(svgData);
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

export async function generatePlanningHebdoPDF(params: PlanningHebdoParams): Promise<jsPDF> {
  const co = getCompanyInfo(params.entityName);

  // Construire les colonnes : (date, moment) uniques depuis time_slots
  type Column = { key: string; date: string; moment: "M" | "AM"; label: string; slotIds: string[] };
  const columnsMap = new Map<string, Column>();
  for (const slot of params.timeSlots) {
    const date = getDayDate(slot.start_time);
    const moment = getSlotMoment(slot.start_time);
    const key = `${date}|${moment}`;
    const label = `${getDayShort(date)} ${moment === "M" ? "M" : "AM"}`;
    if (!columnsMap.has(key)) columnsMap.set(key, { key, date, moment, label, slotIds: [] });
    columnsMap.get(key)!.slotIds.push(slot.id);
  }
  const columns = Array.from(columnsMap.values()).sort((a, b) => a.key.localeCompare(b.key)).slice(0, 10);

  // Index : pour un (slot_id, signer_id, signer_type) → signature_data
  const sigIndex = new Map<string, string>();
  for (const s of params.signatures) {
    if (s.signature_data && s.time_slot_id) {
      sigIndex.set(`${s.time_slot_id}|${s.signer_id}|${s.signer_type}`, s.signature_data);
    }
  }

  // Pour chaque (column, person), trouver la signature
  const findSignature = (column: Column, personId: string, personType: "learner" | "trainer"): string | null => {
    for (const slotId of column.slotIds) {
      const sig = sigIndex.get(`${slotId}|${personId}|${personType}`);
      if (sig) return sig;
    }
    return null;
  };

  // Pré-rasterise toutes les signatures en PNG (jsPDF ne supporte pas SVG)
  const sigPngCache = new Map<string, string>();
  const allPersons: Array<{ id: string; type: "learner" | "trainer" }> = [
    ...params.trainers.map((t) => ({ id: t.id, type: "trainer" as const })),
    ...params.learners.map((l) => ({ id: l.id, type: "learner" as const })),
  ];
  for (const column of columns) {
    for (const person of allPersons) {
      const sig = findSignature(column, person.id, person.type);
      if (sig) {
        const cacheKey = `${column.key}|${person.id}|${person.type}`;
        if (!sigPngCache.has(cacheKey)) {
          const png = await svgToPng(sig, 60, 25);
          if (png) sigPngCache.set(cacheKey, png);
        }
      }
    }
  }

  // ── PDF generation ──
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // En-tête
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text("Planning hebdomadaire — Feuille d'émargement", 148, 12, { align: "center" });

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Formation : ${params.formationTitle}`, 14, 20);
  pdf.text(
    `Dates : du ${formatDateFr(params.startDate)} au ${formatDateFr(params.endDate)} — Durée : ${params.durationHours}h`,
    14,
    25
  );
  const formateurs = params.trainers.map((t) => `${t.last_name?.toUpperCase()} ${t.first_name}`).join(", ") || "—";
  pdf.text(`Formateur(s) : ${formateurs} — Prestataire : ${co.name} (NDA ${co.nda})`, 14, 30);

  // Construction du tableau via autoTable
  const head = [["Nom", ...columns.map((c) => c.label)]];

  const buildRow = (
    label: string,
    personId: string,
    personType: "learner" | "trainer"
  ): (string | { content: string })[] => {
    return [label, ...columns.map((c) => {
      const cacheKey = `${c.key}|${personId}|${personType}`;
      const png = sigPngCache.get(cacheKey);
      return png ? { content: "" } : { content: "" };
    })];
  };

  const trainerRows = params.trainers.map((t) =>
    buildRow(`${t.last_name?.toUpperCase()} ${t.first_name} (F)`, t.id, "trainer")
  );
  const learnerRows = params.learners.map((l) =>
    buildRow(`${l.last_name?.toUpperCase()} ${l.first_name}`, l.id, "learner")
  );

  // didDrawCell : insère l'image de signature dans la cellule appropriée
  autoTable(pdf, {
    startY: 36,
    head,
    body: [...trainerRows, ...learnerRows],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1, halign: "center", valign: "middle", minCellHeight: 12 },
    headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 7 },
    columnStyles: { 0: { halign: "left", cellWidth: 50, fillColor: [250, 250, 250] } },
    didDrawCell: (data) => {
      // Skip header
      if (data.section !== "body") return;
      // Skip name column
      if (data.column.index === 0) return;
      // Récupère le person + column correspondant
      const rowIdx = data.row.index;
      const colIdx = data.column.index - 1;
      const column = columns[colIdx];
      if (!column) return;
      const isTrainer = rowIdx < params.trainers.length;
      const personIdx = isTrainer ? rowIdx : rowIdx - params.trainers.length;
      const person = isTrainer ? params.trainers[personIdx] : params.learners[personIdx];
      if (!person) return;
      const cacheKey = `${column.key}|${person.id}|${isTrainer ? "trainer" : "learner"}`;
      const png = sigPngCache.get(cacheKey);
      if (!png) return;
      // Insère l'image dans la cellule (centrée)
      const w = Math.min(data.cell.width - 1, 18);
      const h = Math.min(data.cell.height - 1, 8);
      const x = data.cell.x + (data.cell.width - w) / 2;
      const y = data.cell.y + (data.cell.height - h) / 2;
      try {
        pdf.addImage(png, "PNG", x, y, w, h);
      } catch { /* skip */ }
    },
  });

  // Footer
  const finalY = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 50;
  pdf.setFontSize(7);
  pdf.setTextColor(100, 100, 100);
  pdf.text(
    `(F) = Formateur. Signatures électroniques apposées via la plateforme ${co.name}. Document généré le ${new Date().toLocaleDateString("fr-FR")}.`,
    14,
    Math.min(finalY + 5, 195)
  );

  return pdf;
}

export async function downloadPlanningHebdoPDF(params: PlanningHebdoParams, filename?: string): Promise<void> {
  const pdf = await generatePlanningHebdoPDF(params);
  pdf.save(filename || `planning-hebdo-${params.formationTitle?.replace(/\s+/g, "-") || "session"}.pdf`);
}
