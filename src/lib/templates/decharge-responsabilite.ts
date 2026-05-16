/**
 * Template HTML système — Lettre de décharge de responsabilité.
 *
 * Document **optionnel** per (session, apprenant). Signé par l'apprenant
 * qui quitte la formation de manière anticipée pour décharger l'organisme
 * de toute responsabilité.
 *
 * Mise en page : style identique aux autres docs (header organisme + logo
 * + footer SIRET + zone signature apprenant ligne vide).
 */

export const DECHARGE_RESPONSABILITE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Lettre de décharge de responsabilité</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.6;
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
    font-size: 14pt;
    font-weight: 700;
    color: #7f1d1d;
    text-align: center;
    margin: 22px 0 24px;
    letter-spacing: 0.3px;
  }

  p { margin: 0 0 12px; text-align: justify; }
  strong { font-weight: 700; }

  ul.consequences {
    list-style: none;
    padding: 0;
    margin: 4px 0 14px 4px;
  }
  ul.consequences > li {
    padding: 4px 0 4px 18px;
    position: relative;
  }
  ul.consequences > li::before {
    content: "\\2022";
    color: #b91c1c;
    font-weight: 700;
    position: absolute;
    left: 4px;
    top: 4px;
  }

  .signature-block {
    margin-top: 28px;
  }
  .signature-block .fait-line {
    margin: 0 0 18px;
  }
  .signature-block .learner-name-line {
    margin: 14px 0 4px;
    font-weight: 700;
  }
  .signature-block .sig-label {
    margin: 4px 0 0;
    font-size: 9.5pt;
    color: #4b5563;
    font-style: italic;
  }
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

  <h1 class="title">Lettre de décharge de responsabilité</h1>

  <p>Je soussigné(e), <strong>[%Nom de l'apprenant%]</strong>, participant(e) à la formation intitulée :</p>
  <p><strong>[%Nom de la formation%]</strong>, suivi du <strong>[%Date de début de la formation%]</strong> au <strong>[%Date de fin de la formation%]</strong>, déclare avoir quitté la session de formation de manière anticipée, de ma propre initiative.</p>

  <p>Je reconnais avoir été informé(e) que ce départ anticipé peut :</p>

  <ul class="consequences">
    <li>affecter la complétude de mon parcours de formation,</li>
    <li>impacter la délivrance d'une attestation de fin de formation,</li>
    <li>avoir des incidences sur la prise en charge éventuelle par mon employeur, un financeur ou un organisme collecteur.</li>
  </ul>

  <p>J'atteste également avoir informé mon employeur de ce départ.</p>

  <p>En conséquence, je décharge expressément l'organisme de formation <strong>[%Nom de l'organisme%]</strong> et son formateur de toute responsabilité liée à ce départ anticipé.</p>

  <div class="signature-block">
    <p class="fait-line">Fait à : <strong>[%Ville de l'organisme%]</strong> le : <strong>[%Date d'aujourd'hui%]</strong></p>

    <p class="learner-name-line">[%Nom de l'apprenant%]</p>
    <p class="sig-label">Signature</p>
    [%E-signature de l'apprenant%]
  </div>

</body>
</html>`;

export const DECHARGE_RESPONSABILITE_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
