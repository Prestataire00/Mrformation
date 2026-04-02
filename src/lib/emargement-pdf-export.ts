import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmargementPdfParams {
  formationTitle: string;
  startDate: string;
  endDate: string;
  location: string | null;
  duration: string;
  entityName: string;
  trainers: { first_name: string; last_name: string }[];
  learners: { first_name: string; last_name: string }[];
  timeSlots: {
    id: string;
    title: string | null;
    start_time: string;
    end_time: string;
  }[];
}

// ── Company info ─────────────────────────────────────────────────────────────

function getCompanyInfo(entityName: string) {
  if (entityName.toLowerCase().includes("c3v")) {
    return {
      name: "C3V FORMATION",
      address: "24/26 Boulevard Gay Lussac 13014 Marseille",
      email: "contact@c3vformation.fr",
      tel: "0750461245",
      website: "http://www.c3vformation.fr",
      siret: "à compléter",
      nda: "à compléter",
      region: "PACA",
      logo: "/logo-c3v-formation.png",
    };
  }
  return {
    name: "MR FORMATION",
    address: "24/26 Boulevard Gay Lussac 13014 Marseille",
    email: "contact@mrformation.fr",
    tel: "0750461245",
    website: "http://www.mrformation.fr",
    siret: "91311329600036",
    nda: "93132013113",
    region: "PACA",
    logo: "/logo-mr-formation.png",
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateFR(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTimeFR(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function loadLogo(logoPath: string): Promise<string | null> {
  try {
    const response = await fetch(logoPath);
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── Colors ───────────────────────────────────────────────────────────────────

const HEADER_BG: [number, number, number] = [0, 172, 178]; // Teal like the screenshot
const DARK = "#1a1a1a";
const GRAY = "#666666";

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Max slots per page as columns (keep readable)
const MAX_SLOTS_PER_TABLE = 4;

// ── Main export ──────────────────────────────────────────────────────────────

export async function generateEmargementPDF(params: EmargementPdfParams): Promise<jsPDF> {
  const {
    formationTitle,
    startDate,
    endDate,
    location,
    duration,
    entityName,
    trainers,
    learners,
    timeSlots,
  } = params;

  const COMPANY = getCompanyInfo(entityName);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logoImg = await loadLogo(COMPANY.logo);

  // Split timeSlots into chunks for multiple pages
  const slotChunks: typeof timeSlots[] = [];
  for (let i = 0; i < timeSlots.length; i += MAX_SLOTS_PER_TABLE) {
    slotChunks.push(timeSlots.slice(i, i + MAX_SLOTS_PER_TABLE));
  }

  // If no slots, still generate 1 page
  if (slotChunks.length === 0) slotChunks.push([]);

  const totalPages = slotChunks.length;

  slotChunks.forEach((chunk, pageIndex) => {
    if (pageIndex > 0) doc.addPage();

    let y = MARGIN;

    // ── Header: Company info (left) + Logo (right) ──

    if (logoImg) {
      doc.addImage(logoImg, "PNG", PAGE_W - MARGIN - 35, y, 35, 30);
    }

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(DARK);
    doc.text(COMPANY.name, MARGIN, y + 6);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(GRAY);
    doc.text(COMPANY.address, MARGIN, y + 12);
    doc.text(`Email: ${COMPANY.email}`, MARGIN, y + 16);
    doc.text(`Tel: ${COMPANY.tel}`, MARGIN, y + 20);
    doc.text(COMPANY.website, MARGIN, y + 24);

    y += 38;

    // ── Title: "Feuille d'émargement" ──

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(DARK);
    doc.text("Feuille d'émargement", PAGE_W / 2, y, { align: "center" });
    y += 10;

    // ── Formation info (centered) ──

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(DARK);

    const infoLines = [
      `Nom de la formation : ${formationTitle}`,
      `Date de la formation : du ${formatDateFR(startDate)} au ${formatDateFR(endDate)}`,
    ];
    if (location) {
      infoLines.push(`Lieu de la formation : ${location}`);
    }
    infoLines.push(`Durée de la formation : ${duration}`);
    if (trainers.length > 0) {
      const trainerNames = trainers.map((t) => `${t.last_name.toUpperCase()} ${t.first_name}`).join(", ");
      infoLines.push(`Formateur(s) : ${trainerNames}`);
    }

    infoLines.forEach((line) => {
      doc.text(line, PAGE_W / 2, y, { align: "center" });
      y += 5;
    });

    y += 4;

    // ── Attendance table ──

    // Build column headers
    const slotHeaders = chunk.map((slot) => {
      const start = formatDateTimeFR(slot.start_time);
      const end = new Date(slot.end_time).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const title = (slot.title || formationTitle).toUpperCase();
      return `LE ${start} À ${end}\n(${title})`;
    });

    const columns = [
      { header: "APPRENANTS", dataKey: "name" },
      ...slotHeaders.map((h, i) => ({ header: h, dataKey: `slot_${i}` })),
    ];

    // Build rows — learners
    const rows = learners.map((learner) => {
      const row: Record<string, string> = {
        name: `${learner.last_name.toUpperCase()} ${learner.first_name}`,
      };
      slotHeaders.forEach((_, i) => {
        row[`slot_${i}`] = ""; // Empty cell for signature
      });
      return row;
    });

    // Column widths
    const nameColWidth = 45;
    const slotColWidth = chunk.length > 0
      ? (CONTENT_W - nameColWidth) / chunk.length
      : CONTENT_W - nameColWidth;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      columns,
      body: rows,
      theme: "grid",
      styles: {
        fontSize: 8,
        cellPadding: { top: 5, bottom: 5, left: 3, right: 3 },
        lineColor: [180, 180, 180],
        lineWidth: 0.3,
        textColor: [30, 30, 30],
        minCellHeight: 14,
      },
      headStyles: {
        fillColor: HEADER_BG,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7,
        halign: "center",
        valign: "middle",
        cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
      },
      columnStyles: {
        name: { cellWidth: nameColWidth, fontStyle: "normal", halign: "left" },
        ...Object.fromEntries(
          slotHeaders.map((_, i) => [
            `slot_${i}`,
            { cellWidth: slotColWidth, halign: "center" },
          ])
        ),
      },
      didDrawPage: () => {
        // Footer on each page
        const footerY = PAGE_H - 12;
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(GRAY);
        doc.text(
          `${COMPANY.name}, ${COMPANY.address} , Numéro SIRET: ${COMPANY.siret}, Numéro de déclaration d'activité: ${COMPANY.nda}`,
          PAGE_W / 2,
          footerY,
          { align: "center" }
        );
        doc.text(
          `(auprès du préfet de région de: ${COMPANY.region})`,
          PAGE_W / 2,
          footerY + 3.5,
          { align: "center" }
        );

        // Page number
        doc.text(
          `${pageIndex + 1}`,
          PAGE_W / 2,
          footerY + 8,
          { align: "center" }
        );
      },
    });

    // ── Trainer signature section (after the table) ──

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable?.finalY || y + 50;

    if (trainers.length > 0 && finalY + 30 < PAGE_H - 20) {
      let sigY = finalY + 10;
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(DARK);
      doc.text("Signature du/des formateur(s) :", MARGIN, sigY);
      sigY += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      trainers.forEach((trainer) => {
        doc.text(
          `${trainer.last_name.toUpperCase()} ${trainer.first_name} :`,
          MARGIN + 5,
          sigY
        );
        // Signature line
        doc.setDrawColor(180, 180, 180);
        doc.line(MARGIN + 55, sigY, MARGIN + 120, sigY);
        sigY += 10;
      });
    }
  });

  return doc;
}

// ── Download helper ──────────────────────────────────────────────────────────

export async function downloadEmargementPDF(
  params: EmargementPdfParams,
  filename?: string
): Promise<void> {
  const doc = await generateEmargementPDF(params);
  const name = filename || `emargement-${params.formationTitle.replace(/\s+/g, "-")}.pdf`;
  doc.save(name);
}
