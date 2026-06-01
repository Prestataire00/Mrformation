/**
 * Template HTML système — Bilan de fin de POE (Préparation Opérationnelle
 * à l'Emploi).
 *
 * Document **optionnel** per (session, apprenant). Similaire à l'attestation
 * d'assiduité mais avec le titre "BILAN DE FIN DE POE" et la mention
 * objectifs pédagogiques.
 *
 * Toutes les variables sont existantes ({{liste_objectifs_pedagogiques}},
 * {{heures_realisees_apprenant}}, {{taux_realisation}}, etc.).
 */

export const BILAN_POE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Bilan de fin de POE</title>
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
    font-size: 22pt;
    font-weight: 700;
    text-align: center;
    margin: 24px 0 20px;
    color: #111827;
  }

  p { margin: 0 0 8px; }
  strong { font-weight: 700; }

  h2.formation-title {
    font-size: 16pt;
    font-weight: 700;
    text-align: center;
    margin: 18px 0 14px;
    color: #111827;
    line-height: 1.25;
  }

  h2.section {
    font-size: 14pt;
    font-weight: 700;
    color: #111827;
    margin: 22px 0 8px;
  }

  .formation-details p { margin: 0 0 4px; }

  .objectifs-block {
    margin: 6px 0 16px;
  }

  .assiduite-line {
    margin: 8px 0 14px;
  }

  .emargement-line {
    margin: 14px 0 18px;
    font-style: italic;
    color: #4b5563;
  }

  .signature-block {
    margin-top: 24px;
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

  <h1 class="title">BILAN DE FIN DE POE</h1>

  <p>Je, soussigné : <strong>[%Nom du représentant de l'organisme%]</strong>, représentant de l'organisme de formation <strong>[%Nom de l'organisme%]</strong>,</p>
  <p>atteste que : <strong>[%Nom de l'apprenant%]</strong> a suivi la formation :</p>

  <h2 class="formation-title">[%Nom de la formation%]</h2>

  <div class="formation-details">
    <p>Lieu de la formation : <strong>[%Lieu de la formation%]</strong></p>
    <p>Dates de la formation : du <strong>[%Date de début de la formation%]</strong> au <strong>[%Date de fin de la formation%]</strong></p>
    <p>Durée de la formation : <strong>[%Durée de la formation%] heure(s)</strong></p>
    <p>Type d'action de formation : <strong>[%Type d'action de formation%]</strong></p>
  </div>

  <h2 class="section">Objectifs pédagogiques de la formation :</h2>
  <div class="objectifs-block">
    [%Objectifs pédagogiques du programme%]
  </div>

  <h2 class="section">Assiduité du stagiaire :</h2>
  <p class="assiduite-line">Durée effectivement suivie par le/la stagiaire : <strong>[%Heures de formation réalisées par l'apprenant%]h</strong>,<br>
  soit un taux de réalisation de <strong>[%Taux de réalisation%] %</strong>.</p>

  <p class="emargement-line">La feuille d'émargement attestant cette assiduité est fournie en annexe.</p>

  <div class="signature-block">
    <p class="fait-line">Fait à <strong>[%Ville de l'organisme%]</strong>, le <strong>[%Date d'aujourd'hui%]</strong></p>
    <div class="signature-cachet">[%Cachet de l'organisme%]</div>
  </div>

</body>
</html>`;

export const BILAN_POE_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
