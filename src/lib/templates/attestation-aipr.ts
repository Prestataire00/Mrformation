/**
 * Template HTML système — Attestation de compétences AIPR (Autorisation
 * d'Intervention à Proximité des Réseaux).
 *
 * Document **optionnel** per (session, apprenant). Conforme article
 * R. 554-31 du code de l'environnement et articles 21/22 de son arrêté
 * d'application du 15 février 2012 modifié. Validité 5 ans.
 *
 * Spécificités :
 * - "Centre : 1908" hardcodé (numéro centre d'examen INRS — à externaliser
 *   dans un futur champ entity si C3V a un autre numéro)
 * - 3 checkboxes pour les domaines (Concepteur / Encadrant / Opérateur)
 *   affichées flat, à cocher manuellement à l'impression
 * - Champ "n° de ticket d'examen" mappé sur learner.birth_city (cf
 *   mapping user — workaround MVP)
 * - "directeur général" remplacé par [%Titre du représentant de l'organisme%]
 *   pour fonctionner avec MR (Président) et C3V (Directeur Général)
 * - "Fait à Marseille" remplacé par [%Ville de l'organisme%]
 */

export const ATTESTATION_AIPR_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Attestation de compétences AIPR</title>
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
    margin-bottom: 14px;
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
    font-size: 13pt;
    font-weight: 700;
    color: #7f1d1d;
    text-align: center;
    margin: 18px 0 6px;
    letter-spacing: 0.3px;
    line-height: 1.3;
  }
  .legal-ref {
    font-size: 8.5pt;
    font-style: italic;
    text-align: center;
    margin: 0 0 18px;
    color: #4b5563;
  }

  p { margin: 0 0 8px; }
  strong { font-weight: 700; }

  .centre-line {
    margin: 0 0 10px;
    font-weight: 700;
  }
  .surveillant-line {
    margin: 0 0 14px;
  }

  h2.section {
    font-size: 10.5pt;
    font-weight: 700;
    color: #111827;
    margin: 14px 0 6px;
  }

  .cas-block {
    margin: 6px 0 6px;
  }
  .cas-block .cas-label {
    font-style: italic;
    font-size: 9pt;
    color: #4b5563;
    margin: 8px 0 2px;
  }
  .checkbox-line {
    margin: 2px 0 2px 16px;
  }
  .nota-block {
    font-size: 8.5pt;
    font-style: italic;
    color: #4b5563;
    margin: 8px 0 14px;
    padding: 6px 10px;
    background: #f9fafb;
    border-left: 3px solid #9ca3af;
  }

  .atteste-block {
    margin: 14px 0;
  }
  .atteste-block p { margin: 0 0 4px; }

  .validity-block {
    margin: 14px 0;
    padding: 10px 14px;
    background: #fef3c7;
    border-left: 3px solid #d97706;
    font-size: 9.5pt;
  }
  .validity-block p { margin: 0 0 6px; }

  .signature-block {
    margin-top: 18px;
  }
  .signature-block .fait-line { margin: 0 0 4px; }
  .signature-block .le-line { margin: 0 0 8px; }
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

  <h1 class="title">Attestation de compétences relative à l'intervention à proximité des réseaux</h1>
  <p class="legal-ref">(application de l'article R. 554-31 du code de l'environnement et des articles 21 et 22 de son arrêté d'application du 15 février 2012 modifié)</p>

  <p class="centre-line">Centre : 1908</p>
  <p class="surveillant-line">Surveillant : <strong>[%Nom du/des formateur(s)%]</strong></p>

  <h2 class="section">Domaine de compétence couvert par l'attestation :</h2>

  <div class="cas-block">
    <p class="cas-label">(Cas où l'employeur est un responsable de projet ou son représentant)</p>
    <p class="checkbox-line">☐ Préparation et conduite de projet (Concepteur)</p>
  </div>

  <div class="cas-block">
    <p class="cas-label">(Cas où l'employeur est un exécutant de travaux)</p>
    <p class="checkbox-line">☐ Encadrement de chantiers de travaux (Encadrant)</p>
    <p class="checkbox-line">☐ Conduite d'engins ou Réalisation de travaux urgents (Opérateur)</p>
  </div>

  <div class="nota-block">
    <strong>Nota :</strong> l'attestation comme Concepteur vaut attestation comme Encadrant ou Opérateur, et l'attestation comme Encadrant vaut attestation comme Opérateur. Ne cocher toutefois qu'une seule des 3 cases ci-dessus.
  </div>

  <div class="atteste-block">
    <p>Je, soussigné <strong>[%Nom du représentant de l'organisme%]</strong>, <strong>[%Titre du représentant de l'organisme%]</strong>,</p>
    <p>Atteste que</p>
    <p>M. / Mme : <strong>[%Nom de l'apprenant%]</strong></p>
    <p>Présenté par : <strong>[%Nom de l'entreprise%]</strong> - <strong>[%Adresse de l'entreprise%]</strong></p>
    <p>à l'examen tenu le <strong>[%Date de début de la formation%]</strong> relatif au domaine de compétences susmentionné,</p>
    <p>sous le n° de ticket d'examen <strong>[%Ville de naissance de l'apprenant%]</strong></p>
    <p><strong>[%Résultat examen AIPR%]</strong></p>
  </div>

  <div class="validity-block">
    <p>La présente attestation est valable pour une durée de <strong>5 ans</strong> à compter de la date de réussite à l'examen mentionnée ci-dessus, ou du <strong>1er janvier 2017</strong> si la date de réussite à l'examen est antérieure au 1er janvier 2017.</p>
    <p>Elle permet la délivrance par l'employeur d'une <strong>autorisation d'intervention à proximité des réseaux (AIPR)</strong>, dont le délai de validité ne peut dépasser celui de la présente attestation.</p>
  </div>

  <div class="signature-block">
    <p class="fait-line">Fait à : <strong>[%Ville de l'organisme%]</strong></p>
    <p class="le-line">le : <strong>[%Date d'aujourd'hui%]</strong></p>
    <div class="signature-cachet">[%Cachet de l'organisme%]</div>
  </div>

</body>
</html>`;

export const ATTESTATION_AIPR_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
