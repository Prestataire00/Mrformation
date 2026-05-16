/**
 * Template HTML système — Résultats des évaluations (par apprenant).
 *
 * Document **optionnel** per (session, apprenant) — à générer à la demande
 * via TabConventionDocs. Liste les évaluations complétées par l'apprenant
 * avec leur score et statut Acquis/Non acquis.
 *
 * Source données : `questionnaire_responses` où `questionnaires.type =
 * 'evaluation'` pour la session, joined à `questions.options.correct_answer`
 * pour calculer le score.
 *
 * Mise en page : identique aux autres docs (header organisme + logo +
 * cachet + footer SIRET).
 */

export const RESULTATS_EVALUATIONS_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Résultats des évaluations</title>
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
    font-size: 18pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    margin: 22px 0 24px;
  }

  .info-block {
    margin: 0 0 22px;
    font-size: 10.5pt;
  }
  .info-block p { margin: 0 0 6px; }
  .info-block strong { font-weight: 700; }

  .signature-block {
    margin-top: 28px;
  }
  .signature-cachet { margin-top: 6px; min-height: 100px; }
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

  <h1 class="title">Résultats des évaluations</h1>

  <div class="info-block">
    <p><strong>Apprenant :</strong> [%Nom de l'apprenant%]</p>
    <p><strong>Formation :</strong> [%Nom de la formation%]</p>
  </div>

  [%Tableau des résultats des évaluations%]

  <div class="signature-block">
    <div class="signature-cachet">[%Cachet de l'organisme%]</div>
  </div>

</body>
</html>`;

export const RESULTATS_EVALUATIONS_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
