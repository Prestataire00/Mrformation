/**
 * Template HTML système — Planning hebdomadaire signé (paysage).
 *
 * Layout : N semaines successives, chacune en tableau (Nom + jours×moments
 * matin/après-midi), max 10 colonnes par semaine, format A4 paysage. Si la
 * formation tient sur 1 seule semaine, 1 seul tableau (rétrocompat). Pour
 * chaque cellule (column, person), affiche la signature image si signée,
 * vide sinon. Multi-semaines : titre "Semaine du DD/MM/YYYY au DD/MM/YYYY"
 * + page-break-inside:avoid par bloc.
 *
 * Utilisé par : TabEmargements Action 3 ("Planning hebdo signé").
 *
 * Variables [%xxx%] utilisées : header/footer/info-box partagés avec
 * `emargement-collectif`. Le tableau lui-même est composé via
 * `{{tableau_planning_hebdo}}` (cf resolve-variables.ts).
 */

export const PLANNING_HEBDO_SIGNE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Planning hebdomadaire signé</title>
<style>
  @page { size: A4 landscape; margin: 12mm 10mm 14mm 10mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.4;
    color: #1f2937;
    margin: 0;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
  }
  .header .org-info { flex: 1; padding-right: 12px; }
  .header .org-name { font-size: 14pt; font-weight: 700; color: #111827; margin: 0 0 4px; }
  .header .org-address { font-size: 8pt; line-height: 1.4; color: #374151; }
  .header .logo-cell { width: 110px; text-align: right; }
  .header .logo-cell img { max-width: 110px; max-height: 90px; }

  h1.title {
    font-size: 16pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    margin: 8px 0 6px;
    font-family: 'Times New Roman', Times, serif;
  }

  .context-bar {
    text-align: center;
    font-size: 9pt;
    color: #374151;
    margin: 0 0 12px;
  }

  table.planning-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
    table-layout: fixed;
  }
  table.planning-table th, table.planning-table td {
    border: 1px solid #d1d5db;
    padding: 4px 6px;
    text-align: center;
    vertical-align: middle;
    min-height: 28px;
  }
  table.planning-table th {
    background: #f3f4f6;
    font-weight: 700;
    color: #111827;
  }
  table.planning-table .col-name {
    text-align: left;
    font-weight: 700;
    background: #fafafa;
    width: 22%;
  }
  table.planning-table .trainer-row .col-name {
    background: #fef3c7;
  }
  table.planning-table .role {
    font-weight: 400;
    font-style: italic;
    color: #6b7280;
    font-size: 7.5pt;
  }
  table.planning-table img {
    display: block;
    margin: auto;
  }

  /* Lot E : multi-semaines — chaque bloc semaine reste groupé visuellement
     (header + tableau) et essaie de tenir sur la même page. Si une semaine
     dépasse 1 page (beaucoup d'apprenants), Chrome ignore avoid et coupe
     dans le tableau — acceptable, mieux que d'orpheliner le titre. */
  .week-block {
    page-break-inside: avoid;
    margin-bottom: 14px;
  }
  .week-block:last-child {
    margin-bottom: 0;
  }
  .week-block + .week-block {
    margin-top: 10px;
  }
  .week-title {
    font-size: 11pt;
    font-weight: 700;
    color: #1f2937;
    margin: 10px 0 4px;
    padding-bottom: 3px;
    border-bottom: 1.5px solid #d1d5db;
  }
  table.planning-table thead {
    display: table-header-group;
  }
</style>
</head>
<body>

  <div class="header">
    <div class="org-info">
      <div class="org-name">[%Nom de l'organisme%]</div>
      <div class="org-address">
        [%Adresse de l'organisme%]<br>
        Email: [%Email de l'organisme%] - Tel: [%Téléphone de l'organisme%]
      </div>
    </div>
    <div class="logo-cell">[%Logo de l'organisme%]</div>
  </div>

  <h1 class="title">Planning hebdomadaire — Feuille d'émargement</h1>

  <div class="context-bar">
    Formation : <strong>[%Nom de la formation%]</strong> — du <strong>[%Date de début de la formation%]</strong> au <strong>[%Date de fin de la formation%]</strong> — Durée : <strong>[%Durée de la formation%]h</strong> — Lieu : [%Lieu de la formation%]
  </div>

  [%Tableau planning hebdo signé%]

</body>
</html>`;

export const PLANNING_HEBDO_SIGNE_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 10mm; text-align: center; line-height: 1.3;">
  <div>(F) = Formateur. [%Nom de l'organisme%], [%Adresse de l'organisme%], SIRET: [%SIRET de l'organisme%], NDA: [%NDA de l'organisme%]</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
