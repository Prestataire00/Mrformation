/**
 * Template HTML système — Réponses satisfaction apprenants (vue admin session).
 *
 * Document **optionnel** per session — rapport interne admin/Qualiopi
 * agrégeant les satisfaction + indicateurs qualité + résultats évaluations
 * de toute la session.
 *
 * Mise en page : style identique aux autres docs (header organisme + logo
 * + cachet + footer SIRET).
 */

export const REPONSES_SATISFACTION_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Réponses satisfaction apprenants</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.55;
    color: #1f2937;
    margin: 0;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
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

  h1.title {
    font-size: 16pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    margin: 22px 0 16px;
  }

  .session-info {
    margin: 0 0 24px;
    padding: 10px 14px;
    background: #f9fafb;
    border-left: 3px solid #4b5563;
    font-size: 10pt;
  }
  .session-info p { margin: 0 0 3px; }
  .session-info strong { font-weight: 700; }

  h2.section {
    font-size: 12pt;
    font-weight: 700;
    color: #111827;
    margin: 22px 0 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid #d1d5db;
  }

  p { margin: 0 0 8px; }

  .signature-block {
    margin-top: 24px;
  }
  .signature-block .fait-line { margin: 0 0 8px; }
  .signature-cachet { margin-top: 4px; min-height: 100px; }
  .signature-cachet img { max-width: 220px; max-height: 110px; }

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

  <h1 class="title">Réponses satisfaction apprenants</h1>

  <div class="session-info">
    <p><strong>Formation :</strong> [%Nom de la formation%]</p>
    <p><strong>Dates :</strong> du [%Date de début de la formation%] au [%Date de fin de la formation%]</p>
    <p><strong>Lieu :</strong> [%Lieu de la formation%]</p>
    <p><strong>Durée :</strong> [%Durée de la formation%] heure(s)</p>
  </div>

  <h2 class="section">Suivi qualité</h2>
  [%Tableau du suivi qualité%]

  <h2 class="section">Réponses des questionnaires de satisfaction</h2>
  [%Tableau des réponses des questionnaires de satisfaction (suivi qualité)%]

  <h2 class="section">Résultats des évaluations (agrégés)</h2>
  [%Tableau des réponses des évaluations%]

  <div class="signature-block">
    <p class="fait-line">Fait à [%Ville de l'organisme%], le [%Date d'aujourd'hui%]</p>
    <div class="signature-cachet">[%Cachet de l'organisme%]</div>
  </div>

</body>
</html>`;

export const REPONSES_SATISFACTION_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
