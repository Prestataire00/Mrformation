/**
 * Template HTML système — Feuille d'émargement collectif (par entreprise).
 *
 * Reproduit la mise en page Loris MR FORMATION (cf
 * `~/Downloads/Feuille-Emargement-entreprise-mrformation.pdf`) :
 * - Header organisme + logo (page 1 uniquement, via le body)
 * - Bandeau "Formation : ... - Lieu : ... - Client : ..." (sous-titre contexte)
 * - Titre "Feuille d'émargement" (gros, gras, centré)
 * - Bloc info bordé : entreprise, formation, dates, lieu, durée, prestataire, formateur(s)
 * - Titre "Tableau de signature"
 * - Pour chaque semaine : header cyan "Semaine NN (DD/MM/YYYY au DD/MM/YYYY)"
 *   suivi d'un tableau (Date/Horaire | Créneau | Formateur(s) | Apprenant(s))
 * - Footer SIRET/NDA + page # injecté via Puppeteer footerTemplate
 *
 * Variables [%xxx%] utilisées : cf ALIAS_TO_VARIABLE_KEY dans
 * `src/lib/utils/resolve-variables.ts`. Le tableau lui-même est composé via
 * `{{tableau_signature_compact}}` qui prend session + enrollments (filtrés par
 * companyId) + signedLearnerIds (optionnel) en input.
 */

export const EMARGEMENT_COLLECTIF_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Feuille d'émargement</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.45;
    color: #1f2937;
    margin: 0;
  }

  /* Header organisme (page 1 uniquement) */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }
  .header .org-info { flex: 1; padding-right: 12px; }
  .header .org-name {
    font-size: 17pt;
    font-weight: 700;
    color: #111827;
    margin: 0 0 6px;
    letter-spacing: 0.3px;
  }
  .header .org-address {
    font-size: 8.5pt;
    line-height: 1.5;
    color: #374151;
  }
  .header .logo-cell { width: 130px; text-align: right; }
  .header .logo-cell img { max-width: 130px; max-height: 110px; }

  /* Bandeau contexte formation */
  .context-bar {
    text-align: center;
    font-size: 9.5pt;
    color: #374151;
    margin: 8px 0 16px;
    padding: 0 20px;
    line-height: 1.4;
  }

  /* Titre principal */
  h1.title {
    font-size: 22pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    margin: 18px 0 14px;
    font-family: 'Times New Roman', Times, serif;
  }

  /* Bloc info bordé double */
  .info-box {
    border: 1.5px double #6b7280;
    padding: 8px 14px;
    margin: 0 0 22px;
    font-size: 9pt;
    line-height: 1.55;
  }
  .info-box .info-line { margin: 0; }
  .info-box .info-line strong { font-weight: 700; }

  /* Titre tableau */
  h2.section-title {
    text-align: center;
    font-size: 13pt;
    font-weight: 700;
    color: #111827;
    margin: 28px 0 14px;
  }

  /* Header semaine (cyan) */
  .week-header {
    background: #0ea5e9;
    color: #fff;
    font-weight: 700;
    font-size: 10pt;
    padding: 6px 12px;
    margin: 12px 0 0;
  }

  /* Tableau de signature */
  table.signature-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 16px;
    font-size: 9pt;
    page-break-inside: auto;
  }
  table.signature-table thead {
    display: table-header-group; /* repeat header on each page */
  }
  table.signature-table th {
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    padding: 6px 10px;
    text-align: left;
    font-weight: 700;
    color: #111827;
  }
  table.signature-table td {
    border: 1px solid #d1d5db;
    padding: 8px 10px;
    vertical-align: top;
  }
  table.signature-table tr {
    page-break-inside: avoid;
  }
  table.signature-table .col-date { width: 14%; font-weight: 700; }
  table.signature-table .col-creneau { width: 12%; }
  table.signature-table .col-formateur { width: 30%; }
  table.signature-table .col-apprenants { width: 44%; }
  table.signature-table .person-name { font-weight: 700; display: block; }
  table.signature-table .person-status {
    display: block;
    font-style: italic;
    color: #4b5563;
    font-size: 8.5pt;
    margin-bottom: 6px;
  }
  table.signature-table .person-status:last-child { margin-bottom: 0; }
  table.signature-table .status-absent { color: #b91c1c; }
  table.signature-table .status-unsigned {
    color: #ef4444;
    font-style: italic;
    font-size: 8.5pt;
  }

  strong { font-weight: 700; }
</style>
</head>
<body>

  <div class="header">
    <div class="org-info">
      <div class="org-name">[%Nom de l'organisme%]</div>
      <div class="org-address">
        [%Adresse de l'organisme%]<br>
        Email: [%Email de l'organisme%]<br>
        Tel: [%Téléphone de l'organisme%]<br>
        [%Site web de l'organisme%]
      </div>
    </div>
    <div class="logo-cell">[%Logo de l'organisme%]</div>
  </div>

  <div class="context-bar">
    Formation : [%Nom de la formation%] - Lieu de formation : [%Modalité de la formation%] ([%Lieu de la formation%]) - Client : [%Nom du client%]
  </div>

  <h1 class="title">Feuille d'émargement</h1>

  <div class="info-box">
    <p class="info-line">Entreprise: <strong>[%Nom du client%]</strong></p>
    <p class="info-line">Nom de la formation: <strong>[%Nom de la formation%]</strong></p>
    <p class="info-line">Date de la formation: du <strong>[%Date de début de la formation%]</strong> au <strong>[%Date de fin de la formation%]</strong></p>
    <p class="info-line">Lieu de la formation: <strong>[%Modalité de la formation%] - [%Lieu de la formation%] - [%Nom du client%]</strong></p>
    <p class="info-line">Durée: <strong>[%Durée de la formation%] heure(s)</strong> heures</p>
    <p class="info-line">Prestataire de la formation: <strong>[%Nom de l'organisme%] N° de déclaration d'activité: [%NDA de l'organisme%]</strong></p>
    <p class="info-line">Formateur(s): [%Formateurs de la formation%]</p>
  </div>

  <h2 class="section-title">Tableau de signature</h2>

  [%Tableau de signature entreprise compact%]

</body>
</html>`;

/**
 * Footer Puppeteer — répété sur chaque page (résolu via le resolver avant
 * d'être passé à `options.footerTemplate`).
 */
export const EMARGEMENT_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
