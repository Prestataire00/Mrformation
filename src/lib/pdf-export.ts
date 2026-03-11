import { jsPDF } from "jspdf";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface BPFData {
  entity_name: string;
  year: number;
  total_sessions: number;
  total_hours: number;
  total_learners: number;
  total_revenue: number;
  sessions_by_category: { category: string; count: number; hours: number }[];
  trainers_count: number;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const BRAND_BLUE = "#2563EB";
const DARK_TEXT = "#1e293b";
const MUTED_TEXT = "#64748b";
const BORDER_COLOR = "#e2e8f0";
const LIGHT_BG = "#f8fafc";

function formatCurrencyPdf(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateFr(date: Date = new Date()): string {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}

/** Draw a filled rectangle helper */
function fillRect(doc: jsPDF, x: number, y: number, w: number, h: number, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
  doc.rect(x, y, w, h, "F");
}

/** Draw a horizontal line */
function hLine(doc: jsPDF, y: number, hex: string = BORDER_COLOR, x1 = 14, x2 = 196) {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.3);
  doc.line(x1, y, x2, y);
}

/** Set text color from hex */
function setColor(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

/** Add page header with branding */
function addPageHeader(doc: jsPDF, entityName: string) {
  // Top blue bar
  fillRect(doc, 0, 0, 210, 18, BRAND_BLUE);

  // Entity name in white
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(entityName, 14, 11.5);

  // Right: date
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(formatDateFr(), 196, 11.5, { align: "right" });

  doc.setTextColor(0, 0, 0);
}

/** Add page footer */
function addPageFooter(doc: jsPDF, pageNumber: number, totalPages: number) {
  const pageHeight = doc.internal.pageSize.height;
  fillRect(doc, 0, pageHeight - 10, 210, 10, "#f1f5f9");
  hLine(doc, pageHeight - 10, BORDER_COLOR);

  doc.setFontSize(7);
  setColor(doc, MUTED_TEXT);
  doc.setFont("helvetica", "normal");
  doc.text("Document généré automatiquement — MR FORMATION", 14, pageHeight - 3.5);
  doc.text(`Page ${pageNumber} / ${totalPages}`, 196, pageHeight - 3.5, { align: "right" });
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Export a simple text document as PDF.
 */
export function exportToPDF(
  title: string,
  content: string,
  filename: string,
  entityName = "MR FORMATION"
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.width;
  const usableWidth = pageWidth - 28; // 14mm margin each side
  let y = 28;

  addPageHeader(doc, entityName);

  // Document title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  setColor(doc, DARK_TEXT);
  doc.text(title, 14, y);
  y += 8;

  // Divider
  hLine(doc, y, BRAND_BLUE);
  y += 6;

  // Date
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  setColor(doc, MUTED_TEXT);
  doc.text(`Document établi le ${formatDateFr()}`, 14, y);
  y += 10;

  // Content
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  setColor(doc, DARK_TEXT);

  const lines = doc.splitTextToSize(content, usableWidth);
  const lineHeight = 5;
  const pageHeight = doc.internal.pageSize.height;
  const bottomMargin = 18;

  for (const line of lines) {
    if (y + lineHeight > pageHeight - bottomMargin) {
      doc.addPage();
      addPageHeader(doc, entityName);
      y = 28;
    }
    doc.text(line, 14, y);
    y += lineHeight;
  }

  // Add footers — we need total pages
  const totalPages = (doc as jsPDF & { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addPageFooter(doc, p, totalPages);
  }

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

/**
 * Export tabular data as PDF with a styled table.
 */
export function exportTableToPDF(
  title: string,
  headers: string[],
  rows: string[][],
  filename: string,
  entityName = "MR FORMATION"
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.width;
  const usableWidth = pageWidth - 28;
  let y = 28;

  addPageHeader(doc, entityName);

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  setColor(doc, DARK_TEXT);
  doc.text(title, 14, y);
  y += 7;

  hLine(doc, y, BRAND_BLUE);
  y += 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  setColor(doc, MUTED_TEXT);
  doc.text(`Généré le ${formatDateFr()}`, 14, y);
  y += 8;

  // Table dimensions
  const colWidth = usableWidth / headers.length;
  const rowHeight = 7;
  const pageHeight = doc.internal.pageSize.height;
  const bottomMargin = 18;

  const drawTableHeader = () => {
    fillRect(doc, 14, y, usableWidth, rowHeight, BRAND_BLUE);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    headers.forEach((h, i) => {
      doc.text(h, 14 + i * colWidth + 2, y + 4.5, { maxWidth: colWidth - 4 });
    });
    y += rowHeight;
  };

  drawTableHeader();

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  rows.forEach((row, rowIdx) => {
    if (y + rowHeight > pageHeight - bottomMargin) {
      doc.addPage();
      addPageHeader(doc, entityName);
      y = 28;
      drawTableHeader();
    }

    // Alternating row background
    if (rowIdx % 2 === 0) {
      fillRect(doc, 14, y, usableWidth, rowHeight, LIGHT_BG);
    }

    setColor(doc, DARK_TEXT);
    row.forEach((cell, i) => {
      doc.text(String(cell ?? ""), 14 + i * colWidth + 2, y + 4.5, {
        maxWidth: colWidth - 4,
      });
    });

    // Row bottom border
    hLine(doc, y + rowHeight, BORDER_COLOR);
    y += rowHeight;
  });

  // Outer border
  const [br, bg, bb] = hexToRgb(BORDER_COLOR);
  doc.setDrawColor(br, bg, bb);
  doc.setLineWidth(0.3);
  doc.rect(14, y - rows.length * rowHeight - rowHeight, usableWidth, rows.length * rowHeight + rowHeight);

  const totalPages = (doc as jsPDF & { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addPageFooter(doc, p, totalPages);
  }

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

/**
 * Export the BPF (Bilan Pédagogique et Financier) as a professional PDF report.
 */
export function exportBPFToPDF(data: BPFData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.width;
  const usableWidth = pageWidth - 28;
  let y = 28;

  // ── Page 1: Cover & summary ──

  addPageHeader(doc, data.entity_name);

  // Report badge
  fillRect(doc, 14, y, usableWidth, 10, "#eff6ff");
  const [br2, bg2, bb2] = hexToRgb(BRAND_BLUE);
  doc.setDrawColor(br2, bg2, bb2);
  doc.setLineWidth(0.5);
  doc.rect(14, y, usableWidth, 10);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setColor(doc, BRAND_BLUE);
  doc.text("DÉCLARATION RÉGLEMENTAIRE — CERFA N°10443*", pageWidth / 2, y + 6, { align: "center" });
  y += 16;

  // Main title
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  setColor(doc, DARK_TEXT);
  doc.text("Bilan Pédagogique et Financier", 14, y);
  y += 10;

  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  setColor(doc, MUTED_TEXT);
  doc.text(`Exercice ${data.year} — ${data.entity_name}`, 14, y);
  y += 6;

  hLine(doc, y, BRAND_BLUE);
  y += 6;

  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  setColor(doc, MUTED_TEXT);
  doc.text(`Rapport généré le ${formatDateFr()} | Données extraites automatiquement depuis la plateforme LMS`, 14, y);
  y += 12;

  // ── KPI boxes ──
  const kpiBoxW = (usableWidth - 6) / 4;
  const kpis = [
    { label: "Stagiaires formés", value: data.total_learners.toString(), color: "#eff6ff", accent: "#3b82f6" },
    { label: "Heures de formation", value: `${data.total_hours}h`, color: "#f5f3ff", accent: "#7c3aed" },
    { label: "Chiffre d'affaires", value: formatCurrencyPdf(data.total_revenue), color: "#f0fdf4", accent: "#16a34a" },
    { label: "Sessions réalisées", value: data.total_sessions.toString(), color: "#fff7ed", accent: "#ea580c" },
  ];

  kpis.forEach((kpi, i) => {
    const x = 14 + i * (kpiBoxW + 2);
    fillRect(doc, x, y, kpiBoxW, 22, kpi.color);
    const [acR, acG, acB] = hexToRgb(kpi.accent);
    doc.setDrawColor(acR, acG, acB);
    doc.setLineWidth(0.4);
    doc.rect(x, y, kpiBoxW, 22);

    // Left accent bar
    fillRect(doc, x, y, 2, 22, kpi.accent);

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    setColor(doc, DARK_TEXT);
    doc.text(kpi.value, x + 5, y + 10);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    setColor(doc, MUTED_TEXT);
    const labelLines = doc.splitTextToSize(kpi.label, kpiBoxW - 8);
    doc.text(labelLines, x + 5, y + 16);
  });

  y += 28;

  // ── Section: breakdown by category ──
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  setColor(doc, DARK_TEXT);
  doc.text("Répartition par domaine de formation", 14, y);
  y += 6;

  hLine(doc, y, BORDER_COLOR);
  y += 5;

  if (data.sessions_by_category.length === 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    setColor(doc, MUTED_TEXT);
    doc.text("Aucune donnée de catégorie disponible pour cet exercice.", 14, y);
    y += 10;
  } else {
    // Table header
    const colWidths = [usableWidth * 0.45, usableWidth * 0.18, usableWidth * 0.18, usableWidth * 0.19];
    const colHeaders = ["Domaine de formation", "Sessions", "Heures", "% Heures"];
    const rowH = 7;

    fillRect(doc, 14, y, usableWidth, rowH, BRAND_BLUE);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    let xCursor = 14;
    colHeaders.forEach((h, i) => {
      const align = i === 0 ? "left" : "right";
      const xPos = align === "right" ? xCursor + colWidths[i] - 3 : xCursor + 3;
      doc.text(h, xPos, y + 4.5, { align });
      xCursor += colWidths[i];
    });
    y += rowH;

    const totalHours = data.sessions_by_category.reduce((s, c) => s + c.hours, 0) || 1;

    data.sessions_by_category.forEach((cat, idx) => {
      if (y + rowH > doc.internal.pageSize.height - 18) {
        doc.addPage();
        addPageHeader(doc, data.entity_name);
        y = 28;
      }

      if (idx % 2 === 0) fillRect(doc, 14, y, usableWidth, rowH, LIGHT_BG);
      hLine(doc, y + rowH, BORDER_COLOR);

      const pct = totalHours > 0 ? Math.round((cat.hours / totalHours) * 100) : 0;
      const cellValues = [cat.category, cat.count.toString(), `${cat.hours}h`, `${pct}%`];

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      setColor(doc, DARK_TEXT);
      xCursor = 14;
      cellValues.forEach((val, i) => {
        const align = i === 0 ? "left" : "right";
        const xPos = align === "right" ? xCursor + colWidths[i] - 3 : xCursor + 3;
        doc.text(val, xPos, y + 4.5, { align });
        xCursor += colWidths[i];
      });
      y += rowH;
    });

    // Total row
    fillRect(doc, 14, y, usableWidth, rowH, "#e2e8f0");
    const totalValues = [
      "TOTAL",
      data.total_sessions.toString(),
      `${data.total_hours}h`,
      "100%",
    ];
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    setColor(doc, DARK_TEXT);
    xCursor = 14;
    totalValues.forEach((val, i) => {
      const align = i === 0 ? "left" : "right";
      const xPos = align === "right" ? xCursor + colWidths[i] - 3 : xCursor + 3;
      doc.text(val, xPos, y + 4.5, { align });
      xCursor += colWidths[i];
    });
    y += rowH + 8;
  }

  // ── Trainers count ──
  if (data.trainers_count > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    setColor(doc, DARK_TEXT);
    doc.text("Intervenants", 14, y);
    y += 5;

    fillRect(doc, 14, y, usableWidth, 10, LIGHT_BG);
    hLine(doc, y, BORDER_COLOR);
    hLine(doc, y + 10, BORDER_COLOR);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    setColor(doc, DARK_TEXT);
    doc.text(`Nombre total de formateurs intervenu(s) sur l'exercice :`, 18, y + 6);
    doc.setFont("helvetica", "bold");
    doc.text(data.trainers_count.toString(), 196, y + 6, { align: "right" });
    y += 16;
  }

  // ── Regulatory note ──
  if (y + 20 > doc.internal.pageSize.height - 18) {
    doc.addPage();
    addPageHeader(doc, data.entity_name);
    y = 28;
  }

  fillRect(doc, 14, y, usableWidth, 18, "#fefce8");
  const [noteR, noteG, noteB] = hexToRgb("#ca8a04");
  doc.setDrawColor(noteR, noteG, noteB);
  doc.setLineWidth(0.4);
  doc.rect(14, y, usableWidth, 18);
  fillRect(doc, 14, y, 2, 18, "#ca8a04");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setColor(doc, "#92400e");
  doc.text("Note réglementaire", 20, y + 6);

  doc.setFont("helvetica", "normal");
  setColor(doc, "#78350f");
  doc.text(
    "Ce rapport BPF est à déclarer annuellement via la plateforme Mon Compte Formation avant le 30 avril\nde l'année suivante. Vérifiez les données avant soumission auprès de votre DREETS.",
    20,
    y + 12,
    { maxWidth: usableWidth - 10 }
  );
  y += 24;

  // ── Footer on all pages ──
  const totalPages = (doc as jsPDF & { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addPageFooter(doc, p, totalPages);
  }

  doc.save(`BPF_${data.entity_name.replace(/\s+/g, "_")}_${data.year}.pdf`);
}

/**
 * Export an HTML document as PDF using html2canvas for faithful rendering.
 */
export async function exportHtmlToPDF(
  title: string,
  htmlContent: string,
  filename: string,
  entityName = "MR FORMATION"
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");

  // Create a hidden container to render the HTML
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-9999px;top:0;width:794px;padding:40px 50px;background:#fff;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;";

  // Add a title header
  container.innerHTML = `
    <div style="border-bottom:2px solid ${BRAND_BLUE};padding-bottom:12px;margin-bottom:24px;">
      <h1 style="font-size:22px;font-weight:700;color:${DARK_TEXT};margin:0 0 4px 0;">${title}</h1>
      <p style="font-size:11px;color:${MUTED_TEXT};margin:0;">Document etabli le ${formatDateFr()} | ${entityName}</p>
    </div>
    <div class="document-html-content">${htmlContent}</div>
  `;

  // Add styles for rendered HTML content
  const style = document.createElement("style");
  style.textContent = `
    .document-html-content h1 { font-size:20px;font-weight:700;margin:16px 0 8px; }
    .document-html-content h2 { font-size:17px;font-weight:600;margin:14px 0 6px; }
    .document-html-content h3 { font-size:15px;font-weight:600;margin:12px 0 6px; }
    .document-html-content p { margin:0 0 8px; }
    .document-html-content ul { list-style:disc;padding-left:24px;margin:0 0 8px; }
    .document-html-content ol { list-style:decimal;padding-left:24px;margin:0 0 8px; }
    .document-html-content li { margin:0 0 4px; }
    .document-html-content table { border-collapse:collapse;width:100%;margin:12px 0; }
    .document-html-content td, .document-html-content th {
      border:1px solid #e2e8f0;padding:6px 10px;text-align:left;font-size:13px;
    }
    .document-html-content th { background:#f1f5f9;font-weight:600; }
    .document-html-content blockquote { border-left:3px solid #e2e8f0;padding-left:12px;color:#64748b;margin:8px 0; }
    .document-html-content pre { background:#f1f5f9;padding:10px;border-radius:4px;font-size:12px;overflow-x:auto; }
    .document-html-content .variable-chip {
      display:inline;background:none;border:none;padding:0;font-family:inherit;font-size:inherit;color:inherit;
    }
  `;
  container.prepend(style);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageWidth = 210;
    const pageHeight = 297;
    const marginX = 10;
    const headerH = 18;
    const footerH = 10;
    const usableWidth = pageWidth - marginX * 2;
    const usableTop = headerH + 4;
    const usableHeight = pageHeight - usableTop - footerH - 4;

    // Calculate image dimensions to fit page width
    const imgWidth = usableWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Split across pages if needed
    let remainingHeight = imgHeight;
    let sourceY = 0;
    let pageNum = 0;

    while (remainingHeight > 0) {
      if (pageNum > 0) doc.addPage();
      pageNum++;

      addPageHeader(doc, entityName);

      const sliceHeight = Math.min(remainingHeight, usableHeight);
      const sourceSliceHeight = (sliceHeight / imgHeight) * canvas.height;

      // Create a canvas slice for this page
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sourceSliceHeight;
      const ctx = sliceCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          sourceSliceHeight,
          0,
          0,
          canvas.width,
          sourceSliceHeight
        );
      }

      doc.addImage(
        sliceCanvas.toDataURL("image/png"),
        "PNG",
        marginX,
        usableTop,
        imgWidth,
        sliceHeight
      );

      sourceY += sourceSliceHeight;
      remainingHeight -= sliceHeight;
    }

    // Add footers
    const totalPages = pageNum;
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      addPageFooter(doc, p, totalPages);
    }

    doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

// ──────────────────────────────────────────────
// BPF Full CERFA Export
// ──────────────────────────────────────────────

interface BPFFullExportData {
  entityName: string;
  fiscalYear: number;
  dateFrom: string;
  dateTo: string;
  bpf: {
    personnesInternes: { nombre: number; heures: number };
    personnesExternes: { nombre: number; heures: number };
    f1: { label: string; stagiaires: number; heures: number; indent?: boolean }[];
    f1DistanceCount: number;
    f2: { stagiaires: number; heures: number };
    f3: { label: string; stagiaires: number; heures: number; indent?: boolean }[];
    f4: { code: string; label: string; stagiaires: number; heures: number }[];
    g: { stagiaires: number; heures: number };
  };
  sectionC: Record<string, number>;
  sectionD: Record<string, number>;
  sectionGManual: { stagiaires: number; heures: number };
  financialLines: { key: string; label: string; indent?: number; bold?: boolean; isTotal?: boolean; sumKeys?: string[] }[];
  chargeLines: { key: string; label: string; indent?: boolean }[];
  getLineValue: (key: string) => number;
  totalProduits: number;
}

export function exportBPFFullToPDF(data: BPFFullExportData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.width;
  const usableWidth = pageWidth - 28;
  const pageHeight = doc.internal.pageSize.height;
  const bottomMargin = 20;
  let y = 28;

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageHeight - bottomMargin) {
      doc.addPage();
      addPageHeader(doc, data.entityName);
      y = 28;
    }
  };

  const fmtEurPdf = (val: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(val || 0);

  // ── Page 1: Cover ──
  addPageHeader(doc, data.entityName);

  // Badge
  fillRect(doc, 14, y, usableWidth, 10, "#eff6ff");
  const [br2, bg2, bb2] = hexToRgb(BRAND_BLUE);
  doc.setDrawColor(br2, bg2, bb2);
  doc.setLineWidth(0.5);
  doc.rect(14, y, usableWidth, 10);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setColor(doc, BRAND_BLUE);
  doc.text("DÉCLARATION RÉGLEMENTAIRE — CERFA N°10443*", pageWidth / 2, y + 6, { align: "center" });
  y += 16;

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  setColor(doc, DARK_TEXT);
  doc.text("Bilan Pédagogique et Financier", 14, y);
  y += 9;

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  setColor(doc, MUTED_TEXT);
  doc.text(`Exercice ${data.fiscalYear} — ${data.entityName}`, 14, y);
  y += 5;
  hLine(doc, y, BRAND_BLUE);
  y += 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  setColor(doc, MUTED_TEXT);
  doc.text(`Période : ${data.dateFrom || "N/A"} au ${data.dateTo || "N/A"} | Généré le ${formatDateFr()}`, 14, y);
  y += 10;

  // ── Section A ──
  const sectionTitle = (title: string) => {
    checkPageBreak(14);
    fillRect(doc, 14, y, usableWidth, 8, BRAND_BLUE);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(title, 18, y + 5.5);
    y += 12;
    setColor(doc, DARK_TEXT);
  };

  sectionTitle("A. IDENTIFICATION DE L'ORGANISME DE FORMATION");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const infoLines = [
    `N° de déclaration : 93132013113`,
    `SIRET : 91311329600036 | NAF : 8559A`,
    `Organisme : ${data.entityName}`,
    `Adresse : 24/26 Boulevard Gay Lussac 13014 Marseille`,
    `Tél : 0750461245 | Email : contact@mrformation.fr`,
  ];
  for (const line of infoLines) {
    doc.text(line, 18, y);
    y += 4.5;
  }
  y += 4;

  // ── Section C ──
  sectionTitle("C. BILAN FINANCIER HT : ORIGINE DES PRODUITS");
  doc.setFontSize(7.5);
  for (const line of data.financialLines) {
    checkPageBreak(5);
    const x = 18 + (line.indent || 0) * 16;
    doc.setFont("helvetica", line.bold ? "bold" : "normal");
    setColor(doc, DARK_TEXT);
    const labelLines = doc.splitTextToSize(line.label, usableWidth - (x - 14) - 35);
    doc.text(labelLines, x, y);
    doc.text(fmtEurPdf(data.getLineValue(line.key)), 14 + usableWidth - 4, y, { align: "right" });
    y += labelLines.length * 3.8 + 1;
  }
  checkPageBreak(8);
  hLine(doc, y, DARK_TEXT);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("TOTAL DES PRODUITS", 18, y);
  doc.text(fmtEurPdf(data.totalProduits), 14 + usableWidth - 4, y, { align: "right" });
  y += 8;

  // ── Section D ──
  sectionTitle("D. BILAN FINANCIER HT : CHARGES DE L'ORGANISME");
  doc.setFontSize(8);
  for (const line of data.chargeLines) {
    checkPageBreak(5);
    doc.setFont("helvetica", "normal");
    setColor(doc, DARK_TEXT);
    doc.text(line.label, line.indent ? 30 : 18, y);
    doc.text(fmtEurPdf(data.sectionD[line.key] || 0), 14 + usableWidth - 4, y, { align: "right" });
    y += 5;
  }
  y += 4;

  // ── Section E ──
  sectionTitle("E. PERSONNES DISPENSANT DES HEURES DE FORMATION");
  doc.setFontSize(8);

  const tableRow = (label: string, col2: string | number, col3: string | number, bold = false) => {
    checkPageBreak(6);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const labelLines = doc.splitTextToSize(String(label), usableWidth * 0.55);
    doc.text(labelLines, 18, y);
    doc.text(String(col2), 14 + usableWidth * 0.7, y, { align: "right" });
    doc.text(String(col3), 14 + usableWidth - 4, y, { align: "right" });
    y += Math.max(labelLines.length * 3.8, 5) + 1;
  };

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("", 18, y);
  doc.text("Nombre", 14 + usableWidth * 0.7, y, { align: "right" });
  doc.text("Heures", 14 + usableWidth - 4, y, { align: "right" });
  y += 4;
  hLine(doc, y - 1, BORDER_COLOR);

  doc.setFontSize(8);
  tableRow("Personnes internes", data.bpf.personnesInternes.nombre, data.bpf.personnesInternes.heures);
  tableRow("Personnes externes (sous-traitance)", data.bpf.personnesExternes.nombre, data.bpf.personnesExternes.heures);
  y += 4;

  // ── Section F-1 ──
  sectionTitle("F-1. TYPE DE STAGIAIRES");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("", 18, y);
  doc.text("Stagiaires", 14 + usableWidth * 0.7, y, { align: "right" });
  doc.text("Heures", 14 + usableWidth - 4, y, { align: "right" });
  y += 4;
  hLine(doc, y - 1, BORDER_COLOR);

  doc.setFontSize(8);
  for (const row of data.bpf.f1) {
    tableRow(row.label, row.stagiaires, row.heures, row.label === "Total");
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.text(`dont à distance : ${data.bpf.f1DistanceCount}`, 18, y);
  y += 6;

  // ── Section F-3 ──
  sectionTitle("F-3. OBJECTIF GÉNÉRAL DES PRESTATIONS DISPENSÉES");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("", 18, y);
  doc.text("Stagiaires", 14 + usableWidth * 0.7, y, { align: "right" });
  doc.text("Heures", 14 + usableWidth - 4, y, { align: "right" });
  y += 4;
  hLine(doc, y - 1, BORDER_COLOR);

  doc.setFontSize(7.5);
  for (const row of data.bpf.f3) {
    checkPageBreak(6);
    doc.setFont("helvetica", row.label === "Total" ? "bold" : "normal");
    const x = row.indent ? 30 : 18;
    const labelLines = doc.splitTextToSize(row.label, usableWidth * 0.55 - (row.indent ? 12 : 0));
    doc.text(labelLines, x, y);
    doc.text(String(row.stagiaires), 14 + usableWidth * 0.7, y, { align: "right" });
    doc.text(String(row.heures), 14 + usableWidth - 4, y, { align: "right" });
    y += Math.max(labelLines.length * 3.5, 4.5) + 1;
  }
  y += 4;

  // ── Section F-4 ──
  if (data.bpf.f4.length > 0) {
    sectionTitle("F-4. SPÉCIALITÉS DE FORMATION DISPENSÉES");
    doc.setFontSize(8);
    for (const row of data.bpf.f4) {
      tableRow(row.code, row.stagiaires, row.heures);
    }
    y += 4;
  }

  // ── Section G ──
  sectionTitle("G. FORMATIONS CONFIÉES À L'ORGANISME PAR UN AUTRE ORGANISME");
  doc.setFontSize(8);
  tableRow("Formations sous-traitées", data.sectionGManual.stagiaires, data.sectionGManual.heures);
  y += 6;

  // ── Regulatory note ──
  checkPageBreak(20);
  fillRect(doc, 14, y, usableWidth, 16, "#fefce8");
  const [noteR, noteG, noteB] = hexToRgb("#ca8a04");
  doc.setDrawColor(noteR, noteG, noteB);
  doc.setLineWidth(0.4);
  doc.rect(14, y, usableWidth, 16);
  fillRect(doc, 14, y, 2, 16, "#ca8a04");

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  setColor(doc, "#92400e");
  doc.text("Note réglementaire", 20, y + 5);
  doc.setFont("helvetica", "normal");
  setColor(doc, "#78350f");
  doc.text(
    "Ce BPF est à déclarer annuellement via Mon Compte Formation avant le 30 avril. Vérifiez les données avant soumission auprès de votre DREETS.",
    20,
    y + 10,
    { maxWidth: usableWidth - 10 }
  );

  // ── Footers ──
  const totalPages = (doc as jsPDF & { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addPageFooter(doc, p, totalPages);
  }

  doc.save(`BPF_CERFA_${data.entityName.replace(/\s+/g, "_")}_${data.fiscalYear}.pdf`);
}
