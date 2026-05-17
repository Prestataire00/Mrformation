/**
 * Template HTML système — Feuille d'émargement VIERGE (pour impression).
 *
 * Identique structurellement à `emargement-collectif.ts` (mêmes header organisme,
 * info-box, tableau colonnes) mais destiné à l'impression : les cellules de
 * signature seront automatiquement vides car la route generate-from-template
 * n'ajoute PAS `feuille_emargement_vierge` à la liste des doc_types qui chargent
 * `signaturesById` / `signedLearnerIds`. Le resolver `{{tableau_signature_compact}}`
 * rend des cases vides quand ces données ne sont pas présentes.
 *
 * Cas d'usage : impression papier puis signature manuscrite sur place.
 *
 * Variables [%xxx%] utilisées : cf ALIAS_TO_VARIABLE_KEY dans
 * `src/lib/utils/resolve-variables.ts`.
 */

export const FEUILLE_EMARGEMENT_VIERGE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Feuille d'émargement (vierge - à signer)</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.45;
    color: #1f2937;
    margin: 0;
  }

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

  .context-bar {
    text-align: center;
    font-size: 9.5pt;
    color: #374151;
    margin: 8px 0 16px;
    padding: 0 20px;
    line-height: 1.4;
  }

  h1.title {
    font-size: 22pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    margin: 18px 0 14px;
    font-family: 'Times New Roman', Times, serif;
  }

  .info-box {
    border: 1.5px double #6b7280;
    padding: 8px 14px;
    margin: 0 0 22px;
    font-size: 9pt;
    line-height: 1.55;
  }
  .info-box .info-line { margin: 0; }
  .info-box .info-line strong { font-weight: 700; }

  h2.section-title {
    text-align: center;
    font-size: 13pt;
    font-weight: 700;
    color: #111827;
    margin: 28px 0 14px;
  }

  .week-header {
    background: #0ea5e9;
    color: #fff;
    font-weight: 700;
    font-size: 10pt;
    padding: 6px 12px;
    margin: 12px 0 0;
  }

  table.signature-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 16px;
    font-size: 9pt;
    page-break-inside: auto;
  }
  table.signature-table thead {
    display: table-header-group;
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
    min-height: 40px;
  }
  table.signature-table tr {
    page-break-inside: avoid;
  }
  table.signature-table .col-date { width: 14%; font-weight: 700; }
  table.signature-table .col-creneau { width: 12%; }
  table.signature-table .col-formateur { width: 30%; }
  table.signature-table .col-apprenants { width: 44%; }
  table.signature-table .person-name { font-weight: 700; display: block; }

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

export const FEUILLE_EMARGEMENT_VIERGE_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
