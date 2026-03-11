import { jsPDF } from "jspdf";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DevisLine {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface DevisData {
  reference: string;
  date_creation: string; // YYYY-MM-DD
  date_echeance: string;
  training_start?: string;
  training_end?: string;
  tva: number; // e.g. 20
  effectifs?: number;
  duration?: string;
  notes?: string;
  mention?: string;
  lines: DevisLine[];
  // Prospect info
  prospect_name: string;
  prospect_address?: string;
  prospect_email?: string;
  prospect_phone?: string;
  prospect_siret?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const COMPANY = {
  name: "MR FORMATION",
  address: "24/26 Boulevard Gay Lussac 13014 Marseille",
  email: "contact@mrformation.fr",
  tel: "0750461245",
  website: "http://www.mrformation.fr",
  siret: "91311329600036",
  nda: "93132013113",
  region: "PACA",
};

const BRAND_RED = "#8B1A1A";
const BRAND_TEAL = "#3DB5C5";
const DARK = "#1a1a1a";
const GRAY = "#666666";
const LIGHT_GRAY = "#f5f5f5";
const TABLE_BORDER = "#cccccc";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateFR(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatEUR(amount: number): string {
  return amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";
}

// ── CGV Text ─────────────────────────────────────────────────────────────────

const CGV_SECTIONS = [
  {
    title: "Conditions Générales de Vente",
    content: "",
  },
  {
    title: "Définitions",
    content: `Client : co-contractant de MR FORMATION.
Contrat : convention de formation professionnelle conclue entre MR FORMATION et le Client.
Formation interentreprises : Formation réalisée dans les locaux de MR FORMATION ou à distance.
Formation intra-entreprise : Formation réalisée sur mesure pour le compte du Client.`,
  },
  {
    title: "1. Objet et champ d'application",
    content:
      "Tout Contrat implique l'acceptation sans réserve par le Client et son adhésion pleine et entière aux présentes Conditions Générales de Vente qui prévalent sur tout autre document du Client.",
  },
  {
    title: "2. Documents contractuels",
    content:
      "Le Contrat précisera l'intitulé de la formation, sa nature, sa durée, ses effectifs, les modalités de son déroulement et la sanction de la formation ainsi que son prix et les contributions financières éventuelles de personnes publiques.",
  },
  {
    title: "3. Report / annulation d'une formation par MR FORMATION",
    content:
      "MR FORMATION se réserve la possibilité d'annuler ou de reporter des formations planifiées, sans indemnités, sous réserve d'en informer le Client avec un préavis raisonnable.",
  },
  {
    title: "4. Annulation d'une formation par le Client",
    content: `Toute formation ou cycle commencé est dû en totalité, sauf accord contraire exprès de MR FORMATION.
- Formations Inter et intra entreprises : La demande devra être communiquée au moins 10 jours calendaires avant le début. A défaut, 100% du montant restera immédiatement exigible.
- Cycles et Parcours : La demande devra être communiquée au moins 15 jours calendaires avant le début. A défaut, 50% du montant restera immédiatement exigible.`,
  },
  {
    title: "5. Replacement d'un participant",
    content:
      "Sur demande écrite avant le début de la formation, le Client a la possibilité de remplacer un participant sans facturation supplémentaire.",
  },
  {
    title: "6. Prix et règlements",
    content:
      "Les prix couvrent les frais pédagogiques. Les frais de repas, hébergement, transport ne sont pas compris. Pour les formations interentreprises les factures sont émises et payables à l'inscription. Pour les formations intra-entreprises, un acompte minimum de 50% devra être versé à la conclusion du Contrat.",
  },
  {
    title: "7. Règlement par un Opérateur de Compétences",
    content:
      "Si le Client souhaite que le règlement soit effectué par l'Opérateur de Compétences dont il dépend, il lui appartient de faire une demande de prise en charge avant le début de la formation. En cas de non-paiement par l'OPCO, le Client sera redevable de l'intégralité du coût.",
  },
  {
    title: "8. Obligations de MR FORMATION",
    content:
      "MR FORMATION s'engage à fournir la formation avec diligence et soin raisonnables. S'agissant d'une prestation intellectuelle, MR FORMATION n'est tenu qu'à une obligation de moyens.",
  },
  {
    title: "9. Protection des données personnelles",
    content:
      "MR FORMATION s'engage à prendre toutes mesures techniques et organisationnelles utiles afin de préserver la sécurité et la confidentialité des données à caractère personnel. Les données personnelles sont conservées pendant trois (3) ans.",
  },
  {
    title: "10. Loi applicable et juridiction",
    content:
      "Les Contrats relèvent de la Loi française. Tous litiges seront de la compétence exclusive du tribunal de commerce de Marseille.",
  },
];

// ── Main export ──────────────────────────────────────────────────────────────

export async function generateDevisPDF(data: DevisData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Try to load logo
  let logoImg: string | null = null;
  try {
    const response = await fetch("/logo-mr-formation.png");
    const blob = await response.blob();
    logoImg = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    // Logo not available, skip
  }

  let y = margin;

  // ── Page 1: Devis ──────────────────────────────────────────────────────────

  // Logo
  if (logoImg) {
    doc.addImage(logoImg, "PNG", margin, y, 35, 30);
  }

  // Company info (right side of logo)
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(BRAND_RED);
  doc.text(COMPANY.name, margin + 40, y + 5);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY);
  doc.text(COMPANY.address, margin + 40, y + 10);
  doc.text(`Email: ${COMPANY.email}`, margin + 40, y + 14);
  doc.text(`Tel: ${COMPANY.tel}`, margin + 40, y + 18);
  doc.text(COMPANY.website, margin + 40, y + 22);

  y += 35;

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(BRAND_TEAL);
  doc.text("Devis de formation professionnelle", margin, y);
  y += 8;

  // Separator
  doc.setDrawColor(BRAND_TEAL);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Devis info
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  doc.text(`DEVIS No. ${data.reference}`, margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Date du devis: ${formatDateFR(data.date_creation)}`, pageWidth - margin - 60, y);
  y += 6;

  // Destinataire
  doc.setFont("helvetica", "bold");
  doc.text("Destinataire:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.prospect_name, margin + 25, y);
  y += 5;

  if (data.prospect_address) {
    doc.text(`Situé: ${data.prospect_address}`, margin, y);
    y += 5;
  }

  // Organisateur
  doc.setFont("helvetica", "bold");
  doc.text("Organisateur de la formation:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(COMPANY.name, margin + 55, y);
  y += 7;

  // Training details
  if (data.duration) {
    doc.setFont("helvetica", "bold");
    doc.text("Durée de la formation:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(data.duration, margin + 42, y);
    y += 5;
  }

  if (data.effectifs) {
    doc.setFont("helvetica", "bold");
    doc.text("Effectifs formés:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(data.effectifs), margin + 32, y);
    y += 5;
  }

  if (data.training_start) {
    doc.setFont("helvetica", "bold");
    doc.text("Date de début:", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(formatDateFR(data.training_start), margin + 28, y);
    if (data.training_end) {
      doc.text(` — Fin: ${formatDateFR(data.training_end)}`, margin + 50, y);
    }
    y += 5;
  }

  y += 5;

  // ── Line items table ───────────────────────────────────────────────────────

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(BRAND_TEAL);
  doc.text("Prix de la formation", margin, y);
  y += 6;

  // Table header
  const colX = {
    desc: margin,
    qty: margin + contentWidth * 0.55,
    price: margin + contentWidth * 0.7,
    total: margin + contentWidth * 0.85,
  };

  doc.setFillColor(BRAND_TEAL);
  doc.rect(margin, y, contentWidth, 7, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor("#ffffff");
  doc.text("Désignation", colX.desc + 2, y + 5);
  doc.text("Quantité", colX.qty + 2, y + 5);
  doc.text("Prix unitaire HT", colX.price + 2, y + 5);
  doc.text("Total HT", colX.total + 2, y + 5);
  y += 7;

  // Table rows
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "normal");

  let subtotal = 0;
  data.lines.forEach((line, idx) => {
    const lineTotal = line.quantity * line.unit_price;
    subtotal += lineTotal;

    const bgColor = idx % 2 === 0 ? "#ffffff" : LIGHT_GRAY;
    doc.setFillColor(bgColor);
    doc.rect(margin, y, contentWidth, 7, "F");

    doc.setDrawColor(TABLE_BORDER);
    doc.line(margin, y + 7, pageWidth - margin, y + 7);

    doc.setFontSize(8);
    // Truncate long descriptions
    const descText = line.description.length > 45 ? line.description.slice(0, 45) + "…" : line.description;
    doc.text(descText, colX.desc + 2, y + 5);
    doc.text(line.quantity.toFixed(2), colX.qty + 2, y + 5);
    doc.text(formatEUR(line.unit_price), colX.price + 2, y + 5);
    doc.text(formatEUR(lineTotal), colX.total + 2, y + 5);
    y += 7;
  });

  // Totals
  y += 3;
  const totalsX = margin + contentWidth * 0.6;
  const totalsValX = margin + contentWidth * 0.85;
  const tvaAmount = subtotal * (data.tva / 100);
  const totalTTC = subtotal + tvaAmount;

  doc.setFontSize(9);

  // Total HT
  doc.setFont("helvetica", "normal");
  doc.text("Total HT", totalsX, y);
  doc.setFont("helvetica", "bold");
  doc.text(formatEUR(subtotal), totalsValX, y);
  y += 5;

  // TVA
  doc.setFont("helvetica", "normal");
  doc.text(`TVA (${data.tva.toFixed(2)} %)`, totalsX, y);
  doc.text(formatEUR(tvaAmount), totalsValX, y);
  y += 5;

  // Total TTC
  doc.setDrawColor(BRAND_TEAL);
  doc.line(totalsX, y - 1, pageWidth - margin, y - 1);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(BRAND_TEAL);
  doc.text("TOTAL TTC", totalsX, y + 4);
  doc.text(formatEUR(totalTTC), totalsValX, y + 4);
  y += 12;

  // Notes
  doc.setTextColor(DARK);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  if (data.notes) {
    doc.text(data.notes, margin, y, { maxWidth: contentWidth });
    y += Math.ceil(data.notes.length / 90) * 4 + 4;
  }

  // Validity
  if (data.date_echeance) {
    doc.setFont("helvetica", "italic");
    doc.text(
      `Ce devis sera valable jusqu'au ${formatDateFR(data.date_echeance)}.`,
      margin,
      y
    );
    y += 8;
  }

  // Signatures
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`${COMPANY.name},`, margin, y);
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Tampon et signature : ${data.prospect_name}`, margin + contentWidth * 0.5, y);
  y += 20;

  // Footer
  const footerY = 285;
  doc.setFontSize(6);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${COMPANY.name}, ${COMPANY.address}, Numéro SIRET: ${COMPANY.siret}, Numéro de déclaration d'activité: ${COMPANY.nda} (auprès du préfet de région de: ${COMPANY.region})`,
    pageWidth / 2,
    footerY,
    { align: "center", maxWidth: contentWidth }
  );

  // ── Pages 2+: CGV ─────────────────────────────────────────────────────────

  doc.addPage();
  y = margin;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(BRAND_TEAL);
  doc.text("Conditions Générales de Vente", margin, y);
  y += 10;

  for (let i = 1; i < CGV_SECTIONS.length; i++) {
    const section = CGV_SECTIONS[i];

    // Check if we need a new page
    if (y > 265) {
      addFooter(doc, pageWidth, contentWidth);
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(DARK);
    doc.text(section.title, margin, y);
    y += 4;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(GRAY);
    doc.setFontSize(7);
    const lines = doc.splitTextToSize(section.content, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 3.2 + 3;
  }

  // Add mention/penalties if provided
  if (data.mention) {
    if (y > 250) {
      addFooter(doc, pageWidth, contentWidth);
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(GRAY);
    const mentionLines = doc.splitTextToSize(data.mention, contentWidth);
    doc.text(mentionLines, margin, y);
    y += mentionLines.length * 3.2 + 3;
  }

  // Footer on last page
  addFooter(doc, pageWidth, contentWidth);

  return doc;
}

function addFooter(doc: jsPDF, pageWidth: number, contentWidth: number) {
  doc.setFontSize(6);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${COMPANY.name}, ${COMPANY.address}, Numéro SIRET: ${COMPANY.siret}, Numéro de déclaration d'activité: ${COMPANY.nda} (auprès du préfet de région de: ${COMPANY.region})`,
    pageWidth / 2,
    285,
    { align: "center", maxWidth: contentWidth }
  );
}

// ── Convenience: download directly ──────────────────────────────────────────

export async function downloadDevisPDF(data: DevisData): Promise<void> {
  const doc = await generateDevisPDF(data);
  doc.save(`Devis_${data.reference}.pdf`);
}
