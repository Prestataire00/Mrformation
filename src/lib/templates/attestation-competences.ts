/**
 * Template HTML système — Attestation de compétences.
 *
 * Document **optionnel** per (session, apprenant). Délivré par le formateur
 * à la fin de la formation pour attester du niveau d'acquisition (Acquis /
 * En cours / Non acquis).
 *
 * Layout : style identique aux autres docs (header organisme + logo +
 * footer SIRET) + zone signature intervenant (image trainer.signature_url
 * si présente, sinon ligne vide pour signature manuelle).
 *
 * Les 3 mentions ACQUIS / EN COURS / NON ACQUIS sont affichées flat ;
 * l'admin coche/entoure manuellement à l'impression.
 */

export const ATTESTATION_COMPETENCES_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Attestation de compétences</title>
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
    font-size: 15pt;
    font-weight: 700;
    color: #7f1d1d;
    text-align: center;
    margin: 22px 0 22px;
    letter-spacing: 0.5px;
  }

  p { margin: 0 0 8px; }
  p.spaced { margin: 14px 0 8px; }
  strong { font-weight: 700; }

  .formation-title {
    font-size: 13pt;
    font-weight: 700;
    text-align: center;
    margin: 14px 0;
    color: #111827;
    line-height: 1.3;
  }

  h2.section {
    font-size: 11pt;
    font-weight: 700;
    margin: 18px 0 6px;
    color: #111827;
  }

  .objectifs-block {
    margin: 6px 0 16px;
  }

  /* Validation : 3 mentions inline avec séparateurs */
  .validation-line {
    text-align: center;
    font-size: 12pt;
    font-weight: 700;
    margin: 18px 0;
    color: #111827;
    letter-spacing: 1px;
  }
  .validation-line .sep {
    color: #9ca3af;
    margin: 0 16px;
    font-weight: 400;
  }

  .footer-block {
    margin-top: 22px;
  }
  .footer-block p { margin: 0 0 6px; }

  .signature-block {
    margin-top: 18px;
  }
  .signature-block .sig-label {
    margin: 0 0 4px;
    font-weight: 600;
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

  <h1 class="title">ATTESTATION DE COMPÉTENCES</h1>

  <p>Je soussigné(e) : <strong>[%Nom du/des formateur(s)%]</strong></p>
  <p>Intervenant en tant que formateur pour : <strong>[%Nom de l'organisme%]</strong></p>

  <p class="spaced">Atteste que : <strong>[%Nom de l'apprenant%]</strong></p>
  <p>A suivi l'action de Formation :</p>

  <div class="formation-title">[%Nom de la formation%]</div>

  <p>qui s'est déroulée du <strong>[%Date de début de la formation%]</strong> au <strong>[%Date de fin de la formation%]</strong></p>
  <p>pour une durée de <strong>[%Durée de la formation%] heure(s)</strong></p>

  <h2 class="section">Objectifs des évaluations des acquis :</h2>
  <div class="objectifs-block">
    [%Objectifs pédagogiques du programme%]
  </div>

  <h2 class="section">Validation des connaissances et compétences :</h2>
  <div class="validation-line">
    ACQUIS <span class="sep">/</span> EN COURS D'ACQUISITION <span class="sep">/</span> NON ACQUIS
  </div>

  <div class="footer-block">
    <p>Fait à : <strong>[%Ville de l'organisme%]</strong></p>
    <p>Le : <strong>[%Date de fin de la formation%]</strong></p>
  </div>

  <div class="signature-block">
    <p class="sig-label">Signature de l'intervenant de la formation :</p>
    [%Signature de l'intervenant%]
  </div>

</body>
</html>`;

export const ATTESTATION_COMPETENCES_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
