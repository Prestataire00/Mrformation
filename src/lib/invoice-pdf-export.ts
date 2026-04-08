import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ── Types ────────────────────────────────────────────────────────────────────

export interface InvoicePdfData {
  // Entity (emitter)
  entityName: string;
  entityAddress: string;
  entityPostalCode: string;
  entityCity: string;
  entitySiret: string;
  entityNda: string;
  entityPhone: string;
  entityEmail: string;
  entityTvaExempt: boolean;
  entityTvaRate: number;
  entityFooterText: string;
  entityLogo: string; // path to logo

  // Invoice
  reference: string;
  createdAt: string;
  dueDate: string | null;
  status: string;
  isAvoir: boolean;
  notes: string | null;

  // Recipient
  recipientName: string;
  recipientType: string;
  recipientSiret?: string;
  recipientAddress?: string;

  // Session
  sessionTitle: string;
  sessionStartDate: string;
  sessionEndDate: string;
  sessionDuration: number | null;

  // Line items
  amount: number;
  learnerCount?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateFr(dateStr: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(amount)
    // jsPDF can't render narrow no-break space (U+202F) or no-break space (U+00A0)
    // Replace with normal space to avoid "15/000,00" rendering bug
    .replace(/\u202F/g, " ")
    .replace(/\u00A0/g, " ");
}

function getLogoPath(entityName: string): string {
  if (entityName.toLowerCase().includes("c3v")) return "/logo-c3v-formation.png";
  return "/logo-mr-formation.png";
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

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const DARK = "#1a1a1a";
const GRAY = "#666666";

// ── Main export ──────────────────────────────────────────────────────────────

export async function generateInvoicePDF(data: InvoicePdfData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logoImg = await loadLogo(data.entityLogo || getLogoPath(data.entityName));

  let y = MARGIN;

  // ── Header: Entity info (left) + Logo (right) ──

  if (logoImg) {
    doc.addImage(logoImg, "PNG", PAGE_W - MARGIN - 30, y, 30, 25);
  }

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  doc.text(data.entityName, MARGIN, y + 6);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY);
  doc.text(data.entityAddress, MARGIN, y + 12);
  doc.text(`${data.entityPostalCode} ${data.entityCity}`, MARGIN, y + 16);
  doc.text(`SIRET : ${data.entitySiret}`, MARGIN, y + 20);
  doc.text(`N° déclaration : ${data.entityNda}`, MARGIN, y + 24);
  doc.text(`Tél : ${data.entityPhone} | Email : ${data.entityEmail}`, MARGIN, y + 28);

  y += 38;

  // ── Title ──

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(data.isAvoir ? "#7C3AED" : "#374151");
  doc.text(data.isAvoir ? "AVOIR" : "FACTURE", MARGIN, y);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(DARK);
  doc.text(data.reference, MARGIN + 55, y);

  y += 10;

  // ── Dates ──

  doc.setFontSize(9);
  doc.setTextColor(GRAY);
  doc.text(`Date d'émission : ${formatDateFr(data.createdAt)}`, MARGIN, y);
  if (data.dueDate) {
    doc.text(`Date d'échéance : ${formatDateFr(data.dueDate)}`, MARGIN + 80, y);
  }

  y += 10;

  // ── Recipient block ──

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 28, 2, 2, "F");

  doc.setFontSize(8);
  doc.setTextColor(GRAY);
  doc.text("DESTINATAIRE", MARGIN + 4, y + 5);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  doc.text(data.recipientName, MARGIN + 4, y + 11);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY);
  if (data.recipientAddress) doc.text(data.recipientAddress, MARGIN + 4, y + 16);
  if (data.recipientSiret) doc.text(`SIRET : ${data.recipientSiret}`, MARGIN + 4, y + 21);

  y += 34;

  // ── Object ──

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  doc.text("Objet :", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Formation "${data.sessionTitle}" du ${formatDateFr(data.sessionStartDate)} au ${formatDateFr(data.sessionEndDate)}`,
    MARGIN + 15,
    y
  );

  y += 10;

  // ── Invoice table ──

  const description = data.isAvoir
    ? `Avoir sur formation "${data.sessionTitle}"`
    : `Formation "${data.sessionTitle}"${data.sessionDuration ? ` — ${data.sessionDuration}h` : ""}${data.learnerCount ? ` — ${data.learnerCount} stagiaire(s)` : ""}`;

  const amountHT = Math.abs(data.amount);
  const tvaRate = data.entityTvaExempt ? 0 : data.entityTvaRate;
  const tvaAmount = Math.round(amountHT * (tvaRate / 100) * 100) / 100;
  const totalTTC = amountHT + tvaAmount;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Description", "Qté", "Prix unitaire HT", "Total HT"]],
    body: [
      [description, "1", formatCurrency(amountHT), formatCurrency(amountHT)],
    ],
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      textColor: [30, 30, 30],
    },
    headStyles: {
      fillColor: [55, 65, 81],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 95 },
      1: { cellWidth: 15, halign: "center" },
      2: { cellWidth: 35, halign: "right" },
      3: { cellWidth: 35, halign: "right" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY || y + 30;
  y += 5;

  // ── Totals ──

  const totalsX = PAGE_W - MARGIN - 70;

  doc.setFontSize(9);
  doc.setTextColor(GRAY);
  doc.text("Total HT", totalsX, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  doc.text(formatCurrency(data.isAvoir ? -amountHT : amountHT), totalsX + 45, y, { align: "right" });

  y += 6;

  if (data.entityTvaExempt) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(GRAY);
    doc.text("TVA non applicable, art. 261-4-4° du CGI", totalsX, y);
    y += 6;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(GRAY);
    doc.text(`TVA ${tvaRate}%`, totalsX, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(DARK);
    doc.text(formatCurrency(tvaAmount), totalsX + 45, y, { align: "right" });
    y += 6;
  }

  // Total TTC line
  doc.setDrawColor(55, 65, 81);
  doc.line(totalsX, y, totalsX + 70, y);
  y += 5;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  doc.text("Total TTC", totalsX, y);
  const ttcValue = data.entityTvaExempt
    ? (data.isAvoir ? -amountHT : amountHT)
    : (data.isAvoir ? -totalTTC : totalTTC);
  doc.text(formatCurrency(ttcValue), totalsX + 45, y, { align: "right" });

  y += 15;

  // ── Payment conditions ──

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY);
  doc.text("Conditions de règlement : Paiement à 30 jours à réception de facture.", MARGIN, y);
  y += 4;
  doc.text("En cas de retard, des pénalités seront appliquées conformément à la réglementation en vigueur.", MARGIN, y);

  // ── Notes ──

  if (data.notes) {
    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(GRAY);
    doc.text(`Notes : ${data.notes}`, MARGIN, y);
  }

  // ── Footer ──

  const footerY = PAGE_H - 15;
  doc.setFontSize(7);
  doc.setTextColor(GRAY);
  if (data.entityFooterText) {
    const lines = doc.splitTextToSize(data.entityFooterText, PAGE_W - MARGIN * 2);
    doc.text(lines, PAGE_W / 2, footerY - 4, { align: "center" });
  }

  doc.setFontSize(7);
  doc.text(
    `${data.entityName}, ${data.entityAddress} ${data.entityPostalCode} ${data.entityCity} — SIRET: ${data.entitySiret}`,
    PAGE_W / 2,
    footerY + 2,
    { align: "center" }
  );

  // Page number
  doc.text("1", PAGE_W - MARGIN, footerY + 2, { align: "right" });

  return doc;
}

// ── Download helper ──────────────────────────────────────────────────────────

export async function downloadInvoicePDF(data: InvoicePdfData): Promise<void> {
  const doc = await generateInvoicePDF(data);
  doc.save(`${data.reference}.pdf`);
}

// ── Base64 helper (for email attachments) ────────────────────────────────────

export async function invoicePDFBase64(data: InvoicePdfData): Promise<string> {
  const doc = await generateInvoicePDF(data);
  return doc.output("datauristring").split(",")[1];
}
