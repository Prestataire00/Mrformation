/**
 * Pédagogie V2 Epic 2.5 — TASK 11 — Helper PDF credentials apprenants
 *
 * Génère un PDF récapitulant les identifiants de connexion (username +
 * mot de passe temporaire) d'un batch d'apprenants nouvellement créés
 * via le bulk import (cf. TASK 15).
 *
 * Structure :
 *  - Page 1 : page de garde — logo entité (MR ou C3V), instructions de
 *    distribution aux RH (CONFIDENTIEL, ne pas diffuser par email non
 *    chiffré, etc.), URL de login encadrée, date de génération.
 *  - Pages 2+ : tableau 3 colonnes (Nom, Identifiant, Mot de passe en
 *    Courier monospace pour lisibilité). Si `rows` est vide, le PDF
 *    contient juste la page de garde.
 *
 * Couleurs entité :
 *  - mr-formation → charcoal (#374151)
 *  - c3v-formation → bleu (#2563EB)
 *
 * Note : on utilise `jspdf-autotable` pour le tableau (pattern déjà
 * établi dans invoice-pdf-export.ts) et le footer "URL · page · CONFIDENTIEL"
 * est rendu sur chaque page une fois le contenu généré.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type LearnerCredentialsEntitySlug = "mr-formation" | "c3v-formation";

export interface LearnerCredentialsRow {
  fullName: string;
  identifier: string;
  password: string;
  /** true = email synthétique (pas d'email réel fourni). Affiche un badge. */
  isSynthetic: boolean;
}

export interface GenerateLearnerCredentialsPDFParams {
  entityName: string;
  entitySlug: LearnerCredentialsEntitySlug;
  sessionTitle: string;
  loginUrl: string;
  generatedAt: Date;
  rows: LearnerCredentialsRow[];
}

// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

const PAGE_W = 210; // A4 portrait mm
const PAGE_H = 297;
const MARGIN_X = 18;
const USABLE_W = PAGE_W - MARGIN_X * 2;

// Couleurs entité (cf CLAUDE.md tableau Entités)
const ENTITY_COLORS: Record<LearnerCredentialsEntitySlug, string> = {
  "mr-formation": "#374151", // charcoal
  "c3v-formation": "#2563EB", // bleu
};

const TEXT_DARK = "#1e293b";
const TEXT_MUTED = "#64748b";
const BG_HIGHLIGHT = "#fef3c7"; // jaune pâle (URL login encadrée)
const BG_ZEBRA = "#f8fafc";
const CONFIDENTIEL_RED = "#dc2626";

// ──────────────────────────────────────────────────────────────────────
// Color helpers
// ──────────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function setFillHex(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setDrawHex(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

function setTextHex(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ──────────────────────────────────────────────────────────────────────
// Page 1 — Page de garde
// ──────────────────────────────────────────────────────────────────────

function renderCoverPage(
  doc: jsPDF,
  params: GenerateLearnerCredentialsPDFParams,
): void {
  const accent = ENTITY_COLORS[params.entitySlug];

  // Bandeau couleur entité en haut (logo placeholder texte — l'image
  // logo nécessiterait un fetch async ; on garde le texte pour rester
  // sync et déterministe côté test).
  setFillHex(doc, accent);
  doc.rect(0, 0, PAGE_W, 28, "F");

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(params.entityName, MARGIN_X, 18);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Généré le ${formatDateFr(params.generatedAt)}`,
    PAGE_W - MARGIN_X,
    18,
    { align: "right" },
  );

  // Titre principal
  let y = 50;
  setTextHex(doc, TEXT_DARK);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Identifiants de connexion apprenants", MARGIN_X, y);
  y += 9;

  setTextHex(doc, TEXT_MUTED);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(params.sessionTitle, MARGIN_X, y, { maxWidth: USABLE_W });
  y += 14;

  // Mention CONFIDENTIEL (encadré rouge)
  setDrawHex(doc, CONFIDENTIEL_RED);
  doc.setLineWidth(0.6);
  doc.rect(MARGIN_X, y, USABLE_W, 14);
  setTextHex(doc, CONFIDENTIEL_RED);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("CONFIDENTIEL — À distribuer uniquement aux destinataires", PAGE_W / 2, y + 9, {
    align: "center",
  });
  y += 22;

  // Instructions de distribution RH
  setTextHex(doc, TEXT_DARK);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Instructions de distribution :", MARGIN_X, y);
  y += 7;

  setTextHex(doc, TEXT_DARK);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const instructions = [
    "1. Remettez à chaque apprenant ses identifiants en main propre ou via un canal chiffré.",
    "2. N'envoyez jamais ces identifiants par email non chiffré ni par messagerie publique.",
    "3. Chaque apprenant devra modifier son mot de passe lors de sa première connexion.",
    "4. Ce document ne doit pas être conservé au-delà de la distribution (RGPD).",
    "5. En cas de perte, contactez l'administrateur pour régénérer les identifiants.",
  ];
  for (const line of instructions) {
    const wrapped = doc.splitTextToSize(line, USABLE_W);
    doc.text(wrapped, MARGIN_X, y);
    y += wrapped.length * 5 + 2;
  }
  y += 6;

  // URL login encadrée (jaune pâle)
  setFillHex(doc, BG_HIGHLIGHT);
  doc.rect(MARGIN_X, y, USABLE_W, 22, "F");
  setDrawHex(doc, accent);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN_X, y, USABLE_W, 22);

  setTextHex(doc, TEXT_MUTED);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("URL de connexion :", MARGIN_X + 4, y + 7);

  setTextHex(doc, accent);
  doc.setFontSize(13);
  doc.setFont("courier", "bold");
  doc.text(params.loginUrl, PAGE_W / 2, y + 16, { align: "center" });
  y += 30;

  // Récap nombre apprenants
  setTextHex(doc, TEXT_MUTED);
  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  const count = params.rows.length;
  const recap =
    count === 0
      ? "Aucun apprenant à distribuer (la page suivante est vide)."
      : `${count} apprenant${count > 1 ? "s" : ""} concerné${count > 1 ? "s" : ""} — voir page suivante.`;
  doc.text(recap, MARGIN_X, y);
}

// ──────────────────────────────────────────────────────────────────────
// Page 2+ — Tableau credentials
// ──────────────────────────────────────────────────────────────────────

function renderCredentialsTable(
  doc: jsPDF,
  params: GenerateLearnerCredentialsPDFParams,
): void {
  if (params.rows.length === 0) return;

  doc.addPage();
  const accent = ENTITY_COLORS[params.entitySlug];

  // Titre page tableau
  setTextHex(doc, TEXT_DARK);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Liste des identifiants", MARGIN_X, 22);

  const [hr, hg, hb] = hexToRgb(accent);
  const [zr, zg, zb] = hexToRgb(BG_ZEBRA);

  // Body : marque les emails synthétiques d'un astérisque visuel — l'admin
  // sait qu'il n'y a pas de vrai email à communiquer dans les comms futures.
  const body = params.rows.map((row) => [
    row.fullName,
    row.isSynthetic ? `${row.identifier}*` : row.identifier,
    row.password,
  ]);

  autoTable(doc, {
    startY: 28,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [["Nom", "Identifiant", "Mot de passe"]],
    body,
    theme: "grid",
    styles: {
      fontSize: 10,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      textColor: [30, 30, 30],
    },
    headStyles: {
      fillColor: [hr, hg, hb],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 10,
    },
    alternateRowStyles: {
      fillColor: [zr, zg, zb],
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 50, font: "courier" },
      2: { cellWidth: 54, font: "courier", fontStyle: "bold" },
    },
  });

  // Note bas de tableau : explication de l'astérisque
  const hasSynthetic = params.rows.some((r) => r.isSynthetic);
  if (hasSynthetic) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastAuto = (doc as any).lastAutoTable as { finalY?: number } | undefined;
    const noteY = (lastAuto?.finalY ?? 28) + 6;
    setTextHex(doc, TEXT_MUTED);
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text(
      "* identifiant interne — l'apprenant n'a pas d'adresse email réelle (utiliser l'identifiant exact ci-dessus pour se connecter).",
      MARGIN_X,
      noteY,
      { maxWidth: USABLE_W },
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// Footer (toutes les pages) — URL · page X/Y · CONFIDENTIEL
// ──────────────────────────────────────────────────────────────────────

function renderFooterAllPages(
  doc: jsPDF,
  params: GenerateLearnerCredentialsPDFParams,
): void {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    setDrawHex(doc, "#e2e8f0");
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, PAGE_H - 12, PAGE_W - MARGIN_X, PAGE_H - 12);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    setTextHex(doc, TEXT_MUTED);
    doc.text(params.loginUrl, MARGIN_X, PAGE_H - 7);
    doc.text(`Page ${i} / ${totalPages}`, PAGE_W / 2, PAGE_H - 7, { align: "center" });

    setTextHex(doc, CONFIDENTIEL_RED);
    doc.setFont("helvetica", "bold");
    doc.text("CONFIDENTIEL", PAGE_W - MARGIN_X, PAGE_H - 7, { align: "right" });
  }
}

// ──────────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────────

export async function generateLearnerCredentialsPDF(
  params: GenerateLearnerCredentialsPDFParams,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Métadonnées (langue fr pour accessibilité lecteurs d'écran).
  doc.setLanguage("fr");
  doc.setProperties({
    title: `Identifiants apprenants — ${params.sessionTitle}`,
    author: params.entityName,
    subject: "Identifiants de connexion apprenants (CONFIDENTIEL)",
    creator: params.entityName,
  });

  renderCoverPage(doc, params);
  renderCredentialsTable(doc, params);
  renderFooterAllPages(doc, params);

  return doc.output("blob");
}
