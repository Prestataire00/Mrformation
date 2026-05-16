/**
 * Template HTML système — Réponses aux évaluations (vue admin session).
 *
 * Document **optionnel** per session — variante simplifiée du doc
 * "Réponses satisfaction apprenants" (#68) : uniquement les 2 tableaux
 * (questionnaires de satisfaction + évaluations agrégées), sans suivi
 * qualité ni infos session.
 *
 * Header organisme + cachet conservés (pattern multi-tenant).
 */

export const REPONSES_EVALUATIONS_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Réponses aux évaluations</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.5;
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
    font-size: 18pt;
    font-weight: 700;
    text-align: center;
    margin: 22px 0 24px;
    color: #111827;
    letter-spacing: 0.4px;
  }

  h2.section {
    font-size: 13pt;
    font-weight: 700;
    color: #111827;
    margin: 22px 0 10px;
    padding-bottom: 4px;
    border-bottom: 1.5px solid #e5e7eb;
  }

  .signature-block {
    margin-top: 28px;
  }
  .signature-block .fait-line { margin: 0 0 8px; }
  .signature-cachet { margin-top: 4px; min-height: 100px; }
  .signature-cachet img { max-width: 220px; max-height: 110px; }
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

  <h1 class="title">Réponses aux évaluations</h1>

  <h2 class="section">Réponses des questionnaires de satisfaction (suivi qualité)</h2>
  [%Tableau des réponses des questionnaires de satisfaction (suivi qualité)%]

  <h2 class="section">Réponses des évaluations</h2>
  [%Tableau des réponses des évaluations%]

  <div class="signature-block">
    <p class="fait-line">Fait à <strong>[%Ville de l'organisme%]</strong>, le <strong>[%Date d'aujourd'hui%]</strong></p>
    <div class="signature-cachet">[%Cachet de l'organisme%]</div>
  </div>

</body>
</html>`;

export const REPONSES_EVALUATIONS_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
