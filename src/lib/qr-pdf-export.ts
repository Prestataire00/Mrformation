import { jsPDF } from "jspdf";
import QRCode from "qrcode";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface QRSlotData {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  learners: QRPersonData[];
  trainers: QRPersonData[];
}

export interface QRPersonData {
  id: string;
  first_name: string;
  last_name: string;
  token: string;
}

export interface QRPdfParams {
  sessionTitle: string;
  trainingTitle: string | null;
  entityName: string;
  location: string | null;
  baseUrl: string;
  slots: QRSlotData[];
  onProgress?: (current: number, total: number) => void;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const BRAND_BLUE = "#2563EB";
const DARK_TEXT = "#1e293b";
const MUTED_TEXT = "#64748b";
const BORDER_COLOR = "#e2e8f0";
const TRAINER_ACCENT = "#7C3AED";

const PAGE_W = 210;
const MARGIN_X = 14;
const USABLE_W = PAGE_W - MARGIN_X * 2; // 182mm

const COLS = 5;
const CELL_W = USABLE_W / COLS; // ~36.4mm
const QR_SIZE = 28; // mm
const CELL_H = 40; // QR + name + spacing

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}

function fillRect(doc: jsPDF, x: number, y: number, w: number, h: number, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
  doc.rect(x, y, w, h, "F");
}

function hLine(doc: jsPDF, y: number, hex: string = BORDER_COLOR, x1 = MARGIN_X, x2 = PAGE_W - MARGIN_X) {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.3);
  doc.line(x1, y, x2, y);
}

function setColor(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function formatDateFr(date: Date = new Date()): string {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTimeFr(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}

function formatSlotDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function addPageHeader(doc: jsPDF, entityName: string) {
  fillRect(doc, 0, 0, PAGE_W, 18, BRAND_BLUE);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(entityName, MARGIN_X, 11.5);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(formatDateFr(), PAGE_W - MARGIN_X, 11.5, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

function addPageFooter(doc: jsPDF, pageNumber: number, totalPages: number, entityName: string) {
  const pageHeight = doc.internal.pageSize.height;
  fillRect(doc, 0, pageHeight - 10, PAGE_W, 10, "#f1f5f9");
  hLine(doc, pageHeight - 10, BORDER_COLOR, 0, PAGE_W);
  doc.setFontSize(7);
  setColor(doc, MUTED_TEXT);
  doc.setFont("helvetica", "normal");
  doc.text(`Document généré automatiquement — ${entityName}`, MARGIN_X, pageHeight - 3.5);
  doc.text(`Page ${pageNumber} / ${totalPages}`, PAGE_W - MARGIN_X, pageHeight - 3.5, { align: "right" });
}

async function generateQRDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 200,
    margin: 1,
    color: { dark: "#1e293b", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
}

// ──────────────────────────────────────────────
// Main Export Function
// ──────────────────────────────────────────────

export async function exportQRCodesPDF(params: QRPdfParams): Promise<Blob> {
  const { sessionTitle, trainingTitle, entityName, location, baseUrl, slots, onProgress } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageHeight = doc.internal.pageSize.height;
  const maxY = pageHeight - 20; // Leave space for footer

  // Pre-generate all QR codes
  const totalQR = slots.reduce((sum, s) => sum + s.learners.length + s.trainers.length, 0);
  let qrGenerated = 0;
  const qrCache: Record<string, string> = {};

  for (const slot of slots) {
    for (const person of [...slot.trainers, ...slot.learners]) {
      const url = `${baseUrl}/emargement/${person.token}`;
      qrCache[person.token] = await generateQRDataUrl(url);
      qrGenerated++;
      onProgress?.(qrGenerated, totalQR);
    }
  }

  let isFirstPage = true;

  for (const slot of slots) {
    if (!isFirstPage) {
      doc.addPage();
    }
    isFirstPage = false;

    let y = 0;

    // Page header
    addPageHeader(doc, entityName);
    y = 26;

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    setColor(doc, DARK_TEXT);
    const title = trainingTitle
      ? `QR Codes des Émargements — ${trainingTitle}`
      : `QR Codes des Émargements — ${sessionTitle}`;
    doc.text(title, MARGIN_X, y, { maxWidth: USABLE_W });
    y += doc.getTextDimensions(title, { maxWidth: USABLE_W }).h + 3;

    // Blue divider
    hLine(doc, y, BRAND_BLUE);
    y += 4;

    // Info block (light gray background)
    const slotDate = formatSlotDate(slot.start_time);
    const slotTime = `${formatTimeFr(slot.start_time)} → ${formatTimeFr(slot.end_time)}`;
    const infoText = `Créneau: ${slotTime} (${slotDate})`;
    const statsText = [
      location ? `Lieu: ${location}` : null,
      `Apprenants: ${slot.learners.length}`,
      `Formateurs: ${slot.trainers.length}`,
    ]
      .filter(Boolean)
      .join("  |  ");

    fillRect(doc, MARGIN_X, y, USABLE_W, 14, "#f8fafc");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    setColor(doc, DARK_TEXT);
    doc.text(infoText, MARGIN_X + 4, y + 5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    setColor(doc, MUTED_TEXT);
    doc.text(statsText, MARGIN_X + 4, y + 10.5);
    y += 18;

    // Render a section (trainers or learners)
    const renderSection = (
      sectionTitle: string,
      people: QRPersonData[],
      accentColor: string
    ) => {
      if (people.length === 0) return;

      // Check if we need a new page for the section header
      if (y + 10 > maxY) {
        doc.addPage();
        addPageHeader(doc, entityName);
        y = 26;
      }

      // Section header
      fillRect(doc, MARGIN_X, y, 3, 8, accentColor);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      setColor(doc, DARK_TEXT);
      doc.text(sectionTitle, MARGIN_X + 6, y + 6);
      y += 12;

      // Grid of QR codes
      for (let i = 0; i < people.length; i++) {
        const col = i % COLS;
        const isNewRow = col === 0 && i > 0;

        if (isNewRow) {
          y += CELL_H;
        }

        // Check page break
        if (y + CELL_H > maxY) {
          doc.addPage();
          addPageHeader(doc, entityName);
          y = 26;
        }

        const cellX = MARGIN_X + col * CELL_W;
        const qrX = cellX + (CELL_W - QR_SIZE) / 2;

        // QR code image
        const qrDataUrl = qrCache[people[i].token];
        if (qrDataUrl) {
          doc.addImage(qrDataUrl, "PNG", qrX, y, QR_SIZE, QR_SIZE);
        }

        // Name below QR
        const name = `${people[i].last_name.toUpperCase()} ${people[i].first_name}`;
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        setColor(doc, DARK_TEXT);
        const nameWidth = doc.getTextWidth(name);
        const nameX = cellX + CELL_W / 2;
        // Truncate name if too wide
        if (nameWidth > CELL_W - 2) {
          doc.text(name, nameX, y + QR_SIZE + 4, {
            align: "center",
            maxWidth: CELL_W - 2,
          });
        } else {
          doc.text(name, nameX, y + QR_SIZE + 4, { align: "center" });
        }
      }

      // Move Y past the last row
      y += CELL_H + 4;
    };

    // Render trainers first, then learners
    renderSection("Formateurs", slot.trainers, TRAINER_ACCENT);
    renderSection("Apprenants", slot.learners, BRAND_BLUE);
  }

  // Add footers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addPageFooter(doc, i, totalPages, entityName);
  }

  return doc.output("blob");
}

/** Download the QR PDF directly in the browser */
export async function downloadQRCodesPDF(params: QRPdfParams, filename?: string): Promise<void> {
  const blob = await exportQRCodesPDF(params);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `qr-emargements-${Date.now()}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
