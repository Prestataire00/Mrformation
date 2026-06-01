/**
 * Template HTML système — Feuille d'émargement individuelle (par apprenant).
 *
 * Document per (session, apprenant) — variante du collective `emargement-
 * collectif.ts` mais centré sur UN seul apprenant (en bold, dans des cards
 * par créneau au lieu d'un tableau).
 *
 * Reproduit le PDF Loris `Feuille-Emargement-apprenant-mrformation.pdf` :
 * - Header organisme + logo
 * - Titre "Feuille d'émargement" gros bold centré
 * - Bloc info bordé double (stagiaire, formation, dates, lieu, prestataire, formateur)
 * - "Tableau de signature" h2 centré
 * - Pour chaque créneau : card bleu pâle avec créneau + formateur + l'apprenant en bold
 *
 * NB : utilise `{{tableau_signature_individuel}}` (nouveau builder).
 */

export const EMARGEMENT_INDIVIDUEL_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Feuille d'émargement individuelle</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.5;
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

  h1.title {
    font-size: 22pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    margin: 18px 0 18px;
  }

  .info-box {
    border: 1.5px double #6b7280;
    padding: 8px 14px;
    margin: 0 0 22px;
    font-size: 9.5pt;
    line-height: 1.55;
  }
  .info-box .info-line { margin: 0; }
  .info-box strong { font-weight: 700; }

  h2.section-title {
    text-align: center;
    font-size: 16pt;
    font-weight: 700;
    color: #111827;
    margin: 24px 0 16px;
  }

  /* Card par créneau (bleu pâle) */
  .creneau-card {
    background: #e0f2fe;
    border: 1px solid #bae6fd;
    border-radius: 4px;
    padding: 12px 16px;
    margin: 0 0 14px;
    page-break-inside: avoid;
  }
  .creneau-card .creneau-header {
    text-decoration: underline;
    margin: 0 0 8px;
    font-size: 9.5pt;
    color: #1f2937;
  }
  .creneau-card .person-name {
    margin: 6px 0 0;
    font-size: 9.5pt;
  }
  .creneau-card .person-name.learner {
    font-weight: 700;
  }
  .creneau-card .person-status {
    margin: 0 0 4px;
    font-size: 9pt;
    color: #4b5563;
    font-style: italic;
  }
  .creneau-card .status-absent {
    color: #b91c1c;
  }
  .creneau-card .status-unsigned {
    color: #ef4444;
    font-style: italic;
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

  <h1 class="title">Feuille d'émargement</h1>

  <div class="info-box">
    <p class="info-line">Nom du stagiaire : <strong>[%Nom de l'apprenant%]</strong></p>
    <p class="info-line">Nom de la formation : <strong>[%Nom de la formation%]</strong></p>
    <p class="info-line">Date de la formation : du <strong>[%Date de début de la formation%]</strong> au <strong>[%Date de fin de la formation%]</strong></p>
    <p class="info-line">Lieu de la formation : <strong>[%Lieu de la formation%]</strong></p>
    <p class="info-line">Durée : <strong>[%Durée de la formation%] heure(s)</strong></p>
    <p class="info-line">Prestataire de la formation : <strong>[%Nom de l'organisme%] N° de déclaration d'activité : [%NDA de l'organisme%]</strong></p>
    <p class="info-line">Formateur(s) : [%Formateurs de la formation%]</p>
  </div>

  <h2 class="section-title">Tableau de signature</h2>

  [%Tableau de signature de l'apprenant%]

</body>
</html>`;

export const EMARGEMENT_INDIVIDUEL_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
