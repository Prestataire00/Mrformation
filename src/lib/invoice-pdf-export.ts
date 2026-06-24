import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { loadImageDataUrl } from "@/lib/devis/logo-loader";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

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
  entityWebsite?: string | null;
  entityTvaExempt: boolean;
  entityTvaRate: number;
  entityFooterText: string;
  entityLogo: string; // path or URL
  entityStampUrl?: string | null;

  // Coordonnées bancaires (RIB) — bank_iban requis pour la génération
  entityBankName?: string | null;
  entityBankIban: string;
  entityBankBic?: string | null;
  entityBankBeneficiary?: string | null;

  // Mention pénalités L.441-6 (paramétrable par entité)
  entityPenaltyText?: string | null;

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

  // Session (bloc formation détaillé)
  sessionTitle: string;
  sessionStartDate: string;
  sessionEndDate: string;
  sessionDuration: number | null;
  sessionMode?: string | null;       // "En présentiel" / "À distance" / "Hybride"
  sessionLocation?: string | null;   // adresse lieu (présentiel)
  sessionTrainers?: string[];        // ["NOM Prénom", ...]
  sessionLearners?: string[];        // ["NOM Prénom", ...]

  // Lines
  amount: number;
  learnerCount?: number;
  lines?: Array<{ description: string; quantity: number; unit_price: number }>;
  externalReference?: string;
}

// Fallback texte L.441-6 si entityPenaltyText absent (rétrocompat).
const DEFAULT_PENALTY_TEXT =
  "Conformément à l'article L. 441-6 du Code de Commerce, les pénalités de retard seront calculées à partir de 3 fois le taux d'intérêt légal en vigueur ainsi qu'une indemnité de 40€ seront dues à défaut de règlement le jour suivant la date de paiement figurant sur la facture.";

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const DARK = "#1a1a1a";
const GRAY = "#666666";
const HEADER_GRAY: [number, number, number] = [55, 65, 81];
const HEADER_GRAY_HEX = "#374151";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers — formatting
// ──────────────────────────────────────────────────────────────────────────────

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
    .replace(/ /g, " ")
    .replace(/ /g, " ");
}

function getLogoPath(entityName: string): string {
  if (entityName.toLowerCase().includes("c3v")) return "/logo-c3v-formation.png";
  return "/logo-mr-formation.png";
}

async function loadImage(path: string): Promise<string | null> {
  // Résilient : null si absent/invalide (cf bug logo C3V manquant) — ne plante jamais.
  return loadImageDataUrl(path);
}

// ──────────────────────────────────────────────────────────────────────────────
// Validation amont
// ──────────────────────────────────────────────────────────────────────────────

export function assertInvoicePdfDataValid(data: InvoicePdfData): void {
  if (!data.entityBankIban || !data.entityBankIban.trim()) {
    throw new Error(
      "Le RIB de l'entité n'est pas configuré (IBAN manquant). Configurez-le dans /admin/settings/organization."
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Render helpers — chacun retourne le nouveau `y` après son bloc
// ──────────────────────────────────────────────────────────────────────────────

function renderHeader(
  doc: jsPDF,
  data: InvoicePdfData,
  logoImg: string | null,
  y: number
): number {
  // Logo (droite, sous lequel on placera la date facture)
  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", PAGE_W - MARGIN - 30, y, 30, 25);
    } catch {
      /* logo invalide — facture générée sans */
    }
  }

  // Coordonnées entité (gauche)
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  doc.text(data.entityName, MARGIN, y + 6);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY);
  doc.text(`${data.entityAddress} ${data.entityPostalCode} ${data.entityCity}`, MARGIN, y + 13);
  doc.text(`Email: ${data.entityEmail}`, MARGIN, y + 17);
  doc.text(`Tel: ${data.entityPhone}`, MARGIN, y + 21);
  if (data.entityWebsite) {
    doc.text(data.entityWebsite, MARGIN, y + 25);
  }

  // Date facture (droite, sous le logo)
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  doc.text(`Date de facture: ${formatDateFr(data.createdAt)}`, PAGE_W - MARGIN, y + 30, { align: "right" });

  return y + 36;
}

function renderTitle(doc: jsPDF, data: InvoicePdfData, y: number): number {
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(data.isAvoir ? "#7C3AED" : DARK);
  const label = data.isAvoir ? "AVOIR" : "FACTURE";
  doc.text(`${label} ${data.reference}`, MARGIN, y + 6);
  return y + 14;
}

function renderRecipient(doc: jsPDF, data: InvoicePdfData, y: number): number {
  // Pas d'encadré — texte simple comme dans l'exemple client.
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  doc.text(`Destinataire: ${data.recipientName}`, MARGIN, y);
  y += 5;

  if (data.recipientAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(data.recipientAddress, MARGIN, y);
    y += 5;
  }

  // "Client:" (égal au destinataire pour facture entreprise — preserved pour cohérence avec l'exemple)
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Client: ${data.recipientName}`, MARGIN, y);
  return y + 4;
}

function renderFormationDetails(doc: jsPDF, data: InvoicePdfData, y: number): number {
  doc.setFontSize(9);
  doc.setTextColor(DARK);

  const printLine = (label: string, value: string) => {
    doc.setFont("helvetica", "normal");
    doc.text(`${label}: `, MARGIN, y);
    const labelWidth = doc.getTextWidth(`${label}: `);
    doc.setFont("helvetica", "bold");
    doc.text(value, MARGIN + labelWidth, y);
    y += 4.5;
  };

  printLine("Intitulé de la formation", data.sessionTitle);

  if (data.sessionLocation || data.sessionMode) {
    const locPart = [data.sessionMode, data.sessionLocation].filter(Boolean).join(" - ");
    printLine("Lieu de la formation", locPart);
  }

  printLine("Dates de la formation", `Du ${formatDateFr(data.sessionStartDate)} au ${formatDateFr(data.sessionEndDate)}`);

  if (data.sessionDuration != null) {
    printLine("Durée de la formation", `${data.sessionDuration.toFixed(2)} heure(s)`);
  }

  if (data.sessionTrainers && data.sessionTrainers.length > 0) {
    printLine("Formateur(s)", data.sessionTrainers.join(", "));
  }

  if (data.sessionLearners && data.sessionLearners.length > 0) {
    printLine("Apprenant(s)", data.sessionLearners.join(", "));
  }

  return y + 2;
}

function renderLinesTable(doc: jsPDF, data: InvoicePdfData, y: number): number {
  // Build line items
  const tableBody: string[][] = [];
  let amountHT = 0;

  if (data.lines && data.lines.length > 0) {
    for (const line of data.lines) {
      const lineTotal = line.quantity * line.unit_price;
      amountHT += lineTotal;
      tableBody.push([
        line.description,
        String(line.quantity),
        formatCurrency(line.unit_price),
        formatCurrency(lineTotal),
      ]);
    }
  } else {
    const description = data.isAvoir
      ? `Avoir sur formation "${data.sessionTitle}"`
      : `${data.sessionTitle}`;
    amountHT = Math.abs(data.amount);
    tableBody.push([description, "1", formatCurrency(amountHT), formatCurrency(amountHT)]);
  }

  const tvaRate = data.entityTvaExempt ? 0 : data.entityTvaRate;
  const tvaAmount = Math.round(amountHT * (tvaRate / 100) * 100) / 100;
  const totalTTC = amountHT + tvaAmount;

  // Lignes détaillées + récap pleine largeur (header gris)
  // Le récap est intégré au même tableau comme rows spéciales pour matcher
  // visuellement l'exemple client.
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Désignation", "Quantité", "Prix unitaire HT", "Total HT"]],
    body: tableBody,
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      textColor: [30, 30, 30],
    },
    headStyles: {
      fillColor: HEADER_GRAY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 86 },
      1: { cellWidth: 24, halign: "center" },
      2: { cellWidth: 40, halign: "right" },
      3: { cellWidth: 30, halign: "right" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY || y + 30;

  // Récap totaux pleine largeur — 3 rows : Total HT / TVA / TOTAL TTC
  // Chaque row a un fond gris foncé (HEADER_GRAY) plein largeur sauf la
  // dernière colonne qui contient le montant en blanc sur fond clair.
  const recapRows: Array<[string, string]> = [];
  recapRows.push(["Total HT", formatCurrency(data.isAvoir ? -amountHT : amountHT)]);
  if (!data.entityTvaExempt) {
    recapRows.push([`TVA (${data.entityTvaRate.toFixed(2)} %)`, formatCurrency(tvaAmount)]);
  }
  recapRows.push([
    "TOTAL TTC",
    formatCurrency(data.entityTvaExempt ? (data.isAvoir ? -amountHT : amountHT) : (data.isAvoir ? -totalTTC : totalTTC)),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    body: recapRows.map((r, idx) => [
      { content: r[0], styles: { fillColor: HEADER_GRAY, textColor: [255, 255, 255], halign: "center" as const, fontStyle: idx === recapRows.length - 1 ? "bold" as const : "normal" as const } },
      { content: r[1], styles: { halign: "right" as const, fontStyle: idx === recapRows.length - 1 ? "bold" as const : "normal" as const } },
    ]),
    theme: "grid",
    styles: {
      fontSize: 10,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
    },
    columnStyles: {
      0: { cellWidth: 150 },
      1: { cellWidth: 30 },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((doc as any).lastAutoTable?.finalY || y) + 6;
}

/**
 * Bloc RIB (colonne gauche) + encadré « Date d'échéance » (colonne droite)
 * sur la même bande horizontale. Les deux moitiés de page sont utilisées —
 * l'échéance n'est plus un gros texte flottant et isolé.
 */
function renderRibAndDueDate(doc: jsPDF, data: InvoicePdfData, y: number): number {
  // ── Colonne gauche : RIB ──
  let yLeft = y;
  doc.setFontSize(9);
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "bold");
  doc.text("RIB:", MARGIN, yLeft);
  yLeft += 5;

  doc.setFont("helvetica", "normal");
  if (data.entityBankName) {
    doc.text(`Nom de la banque: ${data.entityBankName}`, MARGIN, yLeft);
    yLeft += 4.5;
  }
  if (data.entityBankBeneficiary) {
    doc.text(`Nom du bénéficiaire: ${data.entityBankBeneficiary}`, MARGIN, yLeft);
    yLeft += 4.5;
  }
  doc.text(`IBAN: ${data.entityBankIban}`, MARGIN, yLeft);
  yLeft += 4.5;
  if (data.entityBankBic) {
    doc.text(`BIC/SWIFT: ${data.entityBankBic}`, MARGIN, yLeft);
    yLeft += 4.5;
  }

  // ── Colonne droite : encadré « Date d'échéance » ──
  let yRight = y;
  if (data.dueDate) {
    const boxW = 62;
    const boxH = 17;
    const bandH = 6;
    const boxX = PAGE_W - MARGIN - boxW;

    // Bandeau label — même gris que l'en-tête du tableau des lignes.
    doc.setFillColor(HEADER_GRAY[0], HEADER_GRAY[1], HEADER_GRAY[2]);
    doc.rect(boxX, y, boxW, bandH, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("DATE D'ÉCHÉANCE", boxX + boxW / 2, y + 4, { align: "center" });

    // Bordure du bloc.
    doc.setDrawColor(HEADER_GRAY[0], HEADER_GRAY[1], HEADER_GRAY[2]);
    doc.setLineWidth(0.4);
    doc.rect(boxX, y, boxW, boxH);

    // Date.
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(DARK);
    doc.text(formatDateFr(data.dueDate), boxX + boxW / 2, y + 13, { align: "center" });

    yRight = y + boxH;
  }

  return Math.max(yLeft, yRight) + 6;
}

/**
 * Bloc « Note » — rend le champ libre `notes` de la facture (ex. la note
 * des participants saisie dans le formulaire). Rien n'est dessiné si le
 * champ est vide.
 */
function renderNotes(doc: jsPDF, data: InvoicePdfData, y: number): number {
  const note = data.notes?.trim();
  if (!note) return y;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  const label = "Note: ";
  doc.text(label, MARGIN, y);
  const labelWidth = doc.getTextWidth(label);

  doc.setFont("helvetica", "normal");
  const noteLines = doc.splitTextToSize(note, PAGE_W - MARGIN * 2 - labelWidth);
  doc.text(noteLines, MARGIN + labelWidth, y);

  return y + Math.max(noteLines.length * 4, 4) + 4;
}

/**
 * Mention légale L.441-6 — encadré gris clair pleine largeur, lu comme une
 * note de bas de facture délimitée plutôt qu'un paragraphe tassé à gauche.
 */
function renderPenalty(doc: jsPDF, data: InvoicePdfData, y: number): number {
  const penaltyText = data.entityPenaltyText?.trim() || DEFAULT_PENALTY_TEXT;
  const full = `Mention libre & Pénalités: ${penaltyText}`;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const boxW = PAGE_W - MARGIN * 2;
  const pad = 3;
  const lines = doc.splitTextToSize(full, boxW - pad * 2);
  const boxH = lines.length * 3.6 + pad * 2;

  // Encadré gris clair pleine largeur.
  doc.setFillColor(245, 245, 245);
  doc.setDrawColor(218, 218, 218);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, boxW, boxH, "FD");

  doc.setTextColor(GRAY);
  doc.text(lines, MARGIN + pad, y + pad + 2.6);

  return y + boxH + 6;
}

async function renderStampAndFooter(doc: jsPDF, data: InvoicePdfData, y: number): Promise<void> {
  // Nom de l'entité au-dessus du tampon
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(DARK);
  doc.text(data.entityName, MARGIN, y);
  y += 4;

  // Tampon (silent skip si stamp_url absent)
  if (data.entityStampUrl) {
    const stampImg = await loadImage(data.entityStampUrl);
    if (stampImg) {
      try {
        doc.addImage(stampImg, "PNG", MARGIN, y, 35, 25);
        y += 28;
      } catch {
        /* tampon invalide — facture générée sans */
      }
    }
  }

  // Footer mention légale (centré, italique, gris)
  const footerY = PAGE_H - 12;
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(GRAY);
  doc.text(
    `${data.entityName}, ${data.entityAddress} ${data.entityPostalCode} ${data.entityCity}, Numéro SIRET: ${data.entitySiret}, Numéro de déclaration d'activité: ${data.entityNda}`,
    PAGE_W / 2,
    footerY - 4,
    { align: "center", maxWidth: PAGE_W - MARGIN * 2 }
  );
  doc.text(`(auprès du préfet de région de: PACA)`, PAGE_W / 2, footerY, { align: "center" });

  // Page number
  doc.setFont("helvetica", "normal");
  doc.text("1", PAGE_W - MARGIN, footerY, { align: "right" });
}

// ──────────────────────────────────────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────────────────────────────────────

export async function generateInvoicePDF(data: InvoicePdfData): Promise<jsPDF> {
  assertInvoicePdfDataValid(data);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logoImg = await loadImage(data.entityLogo || getLogoPath(data.entityName));

  let y = MARGIN;
  y = renderHeader(doc, data, logoImg, y);
  y = renderTitle(doc, data, y);
  y = renderRecipient(doc, data, y);
  y = renderFormationDetails(doc, data, y);
  y = renderLinesTable(doc, data, y);
  y = renderRibAndDueDate(doc, data, y);
  y = renderNotes(doc, data, y);
  y = renderPenalty(doc, data, y);
  await renderStampAndFooter(doc, data, y);

  return doc;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public helpers (download + base64)
// ──────────────────────────────────────────────────────────────────────────────

export async function downloadInvoicePDF(data: InvoicePdfData): Promise<void> {
  const doc = await generateInvoicePDF(data);
  doc.save(`${data.reference}.pdf`);
}

export async function invoicePDFBase64(data: InvoicePdfData): Promise<string> {
  const doc = await generateInvoicePDF(data);
  return doc.output("datauristring").split(",")[1];
}
