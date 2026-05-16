/**
 * Template HTML système — Attestation d'abandon de formation.
 *
 * Document **optionnel** per (session, apprenant). 1 page.
 *
 * Sert à constater officiellement qu'un stagiaire a interrompu la formation
 * avant son terme. Utilisée pour la facturation prorata et le dossier OPCO.
 *
 * Date d'abandon + motifs (checkboxes ☐ + champ "Autre") : remplis à la
 * main après impression (pas de stockage en base à ce stade). À dynamiser
 * plus tard si système de tracking des abandons.
 *
 * Réutilise `[%Heures de formation réalisées par l'apprenant%]` (basé sur
 * signedLearnerIds) pour le décompte des heures suivies avant abandon.
 */

export const ATTESTATION_ABANDON_FORMATION_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Attestation d'abandon de formation</title>
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
    text-align: center;
    margin: 24px 0 24px;
    color: #111827;
    letter-spacing: 0.5px;
  }

  p { margin: 0 0 10px; }
  strong { font-weight: 700; }

  .formation-details {
    margin: 14px 0;
  }
  .formation-details p {
    margin: 0 0 6px;
  }

  .abandon-line {
    margin: 14px 0;
    font-size: 10.5pt;
  }
  .abandon-line .fill-line {
    display: inline-block;
    border-bottom: 1px dotted #6b7280;
    min-width: 110px;
    text-align: center;
    color: #6b7280;
    padding: 0 6px;
  }

  .motif-block {
    margin: 16px 0;
  }
  .motif-block .intro {
    margin-bottom: 8px;
  }
  .motif-block .checkbox-list {
    margin-left: 4px;
  }
  .motif-block .checkbox-list p {
    margin: 5px 0;
    font-size: 10pt;
  }
  .motif-block .fill-line {
    display: inline-block;
    border-bottom: 1px dotted #6b7280;
    min-width: 280px;
    color: #6b7280;
    padding: 0 6px;
  }

  .heures-line {
    margin: 16px 0;
    padding: 8px 12px;
    background: #f9fafb;
    border-left: 3px solid #6b7280;
  }

  .valoir {
    margin: 18px 0 22px;
    font-style: italic;
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

  <h1 class="title">ATTESTATION D'ABANDON DE FORMATION</h1>

  <p>Je soussigné(e), <strong>[%Nom du représentant de l'organisme%]</strong>, agissant en qualité de Directeur général, de l'organisme de formation <strong>[%Nom de l'organisme%]</strong>, atteste que :</p>

  <div class="formation-details">
    <p>Madame / Monsieur : <strong>[%Nom de l'apprenant%]</strong></p>
    <p>Stagiaire inscrit(e) à la formation :</p>
    <p>Intitulé de la formation : <strong>[%Nom du programme associé%]</strong></p>
    <p>Dates prévues de la formation : du <strong>[%Date de début de la formation%]</strong> au <strong>[%Date de fin de la formation%]</strong></p>
  </div>

  <p class="abandon-line">a abandonné la formation à compter du <span class="fill-line">…………………</span>.</p>

  <div class="motif-block">
    <p class="intro">L'abandon de la formation est intervenu pour le motif suivant (si connu) :</p>
    <div class="checkbox-list">
      <p>☐ Abandon volontaire</p>
      <p>☐ Raisons personnelles</p>
      <p>☐ Raisons professionnelles</p>
      <p>☐ Raisons médicales</p>
      <p>☐ Autre (à préciser) : <span class="fill-line">……………………………………………</span></p>
      <p>☐ Motif non communiqué par le stagiaire</p>
    </div>
  </div>

  <p class="heures-line">À la date de l'abandon, le stagiaire avait réalisé <strong>[%Heures de formation réalisées par l'apprenant%] heures</strong> de formation sur un volume total prévu de <strong>[%Total des heures des créneaux de la formation%] heures</strong>.</p>

  <p class="valoir">La présente attestation est établie pour servir et valoir ce que de droit.</p>

  <div class="signature-block">
    <p class="fait-line">Fait le : <strong>[%Date d'aujourd'hui%]</strong></p>
    <div class="signature-cachet">[%Cachet de l'organisme%]</div>
  </div>

</body>
</html>`;

export const ATTESTATION_ABANDON_FORMATION_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
