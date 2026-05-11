import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
  try {
    const response = await fetch(path);
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
    doc.addImage(logoImg, "PNG", PAGE_W - MARGIN - 30, y, 30, 25);
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
      0: { cellWidth: 95 },
      1: { cellWidth: 25, halign: "center" },
      2: { cellWidth: 30, halign: "right" },
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

function renderPenaltyAndDueDate(doc: jsPDF, data: InvoicePdfData, y: number): number {
  const penaltyText = data.entityPenaltyText?.trim() || DEFAULT_PENALTY_TEXT;
  const labelPrefix = "Mention libre & Pénalités: ";
  const full = labelPrefix + penaltyText;

  // Mention pénalités à gauche (largeur ~110mm)
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY);
  const lines = doc.splitTextToSize(full, 110);
  doc.text(lines, MARGIN, y + 4);

  // Date d'échéance à droite (gros bold)
  if (data.dueDate) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(DARK);
    doc.text(`Date d'échéance: ${formatDateFr(data.dueDate)}`, PAGE_W - MARGIN, y + 6, { align: "right" });
  }

  // Hauteur du bloc = max(hauteur du texte mention, hauteur date échéance)
  const blockHeight = Math.max(lines.length * 3.5, 12);
  return y + blockHeight + 6;
}

function renderRib(doc: jsPDF, data: InvoicePdfData, y: number): number {
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(DARK);

  doc.setFont("helvetica", "bold");
  doc.text("RIB:", MARGIN, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  if (data.entityBankName) {
    doc.text(`Nom de la banque: ${data.entityBankName}`, MARGIN, y);
    y += 4.5;
  }
  if (data.entityBankBeneficiary) {
    doc.text(`Nom du bénéficiaire: ${data.entityBankBeneficiary}`, MARGIN, y);
    y += 4.5;
  }
  doc.text(`IBAN: ${data.entityBankIban}`, MARGIN, y);
  y += 4.5;
  if (data.entityBankBic) {
    doc.text(`BIC/SWIFT: ${data.entityBankBic}`, MARGIN, y);
    y += 4.5;
  }

  return y + 2;
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
      doc.addImage(stampImg, "PNG", MARGIN, y, 35, 25);
      y += 28;
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
  y = renderPenaltyAndDueDate(doc, data, y);
  y = renderRib(doc, data, y);
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
