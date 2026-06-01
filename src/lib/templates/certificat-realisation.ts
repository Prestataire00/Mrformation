/**
 * Template HTML système — Certificat de réalisation de formation.
 *
 * Document **par (session, apprenant)** : 1 certificat par apprenant ayant
 * complété la session. Reproduit le PDF Loris
 * `certificat-de-realisation-apprenant-mrformation.pdf`.
 *
 * Sections : header organisme + titre + corps légal + 4 checkboxes nature
 * action + paragraphe conservation + objectifs + résultat évaluation +
 * logo Ministère du Travail + signature/cachet.
 *
 * IMAGE Ministère du Travail : référence l'asset `/ministere-du-travail.png`
 * dans `public/`. L'image doit y être déposée manuellement (cf instructions
 * PR). Si absente, le PDF aura juste un emplacement vide à cet endroit.
 *
 * CHECKBOXES nature action : par défaut "Action de formation" est cochée
 * (cas le plus courant ; cf reference PDF). Si on veut piloter dynamiquement,
 * il faudra ajouter un champ `training.action_type` dans une story
 * ultérieure (valeurs : action_de_formation / bilan_competences / vae /
 * apprentissage). Pour l'instant : hardcoded.
 */

export const CERTIFICAT_REALISATION_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Certificat de réalisation de formation</title>
<style>
  /* Lot C : marges et tailles compressées pour tenir sur 1 page A4.
     Bottom 18mm = footer Puppeteer (~11mm) + gap suffisant. */
  @page { size: A4; margin: 12mm 14mm 18mm 14mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.4;
    color: #1f2937;
    margin: 0;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }
  .header .org-info { flex: 1; padding-right: 10px; }
  .header .org-name {
    font-size: 15pt;
    font-weight: 700;
    color: #111827;
    margin: 0 0 3px;
    letter-spacing: 0.3px;
  }
  .header .org-address {
    font-size: 8pt;
    line-height: 1.4;
    color: #374151;
  }
  .header .logo-cell { width: 110px; text-align: right; }
  .header .logo-cell img { max-width: 110px; max-height: 80px; object-fit: contain; }

  h1.title {
    font-size: 13pt;
    font-weight: 700;
    text-align: center;
    margin: 10px 0 8px;
    color: #7f1d1d;
    letter-spacing: 0.5px;
  }

  p { margin: 0 0 3px; }

  .formation-block {
    margin: 6px 0;
  }
  .formation-block p { margin: 0 0 2px; }

  .nature-block {
    margin: 6px 0;
  }
  .nature-block .nature-title {
    font-style: italic;
    margin: 0 0 4px;
  }
  .nature-block .checkbox-line {
    margin: 0;
    padding: 1px 6px;
  }
  .nature-block .checkbox-line.checked {
    background: #fef3c7;
    color: #1f2937;
    font-weight: 500;
  }

  .conservation {
    font-style: italic;
    border-top: 1px solid #d1d5db;
    border-bottom: 1px solid #d1d5db;
    padding: 6px 0;
    margin: 6px 0;
    color: #374151;
    font-size: 8.5pt;
  }

  h2.section {
    font-size: 10.5pt;
    font-weight: 700;
    margin: 6px 0 3px;
    color: #111827;
  }

  ul.objectifs {
    list-style: none;
    padding: 0;
    margin: 2px 0 4px 4px;
  }
  ul.objectifs > li {
    padding: 1px 0 1px 14px;
    position: relative;
  }
  ul.objectifs > li::before {
    content: "\\2022";
    color: #111827;
    font-weight: 700;
    position: absolute;
    left: 2px;
    top: 1px;
  }

  .evaluation-line {
    margin: 6px 0 2px;
  }
  .evaluation-line strong { font-weight: 700; }
  .emargement-line {
    margin: 0 0 6px;
  }

  /* Logo Ministère du Travail aligné à droite */
  .mintravail-block {
    text-align: right;
    margin: 4px 0 6px;
  }
  .mintravail-block img {
    max-height: 50px;
    width: auto;
  }

  .signature-block {
    margin-top: 8px;
  }
  .signature-block .fait-line { margin: 0 0 4px; }
  .signature-cachet { margin-top: 2px; min-height: 70px; }
  .signature-cachet img { max-width: 180px; max-height: 90px; object-fit: contain; }

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

  <h1 class="title">CERTIFICAT RÉALISATION DE FORMATION</h1>

  <p>Je, soussigné : <strong>[%Nom du représentant de l'organisme%]</strong>, représentant de l'organisme de formation <strong>[%Nom de l'organisme%]</strong>,</p>
  <p>atteste que : <strong>[%Nom de l'apprenant%]</strong> a suivi la formation :</p>

  <div class="formation-block">
    <p>Nom de la formation : <strong>[%Nom de la formation%]</strong></p>
    <p>Lieu de la formation : <strong>[%Adresse de la formation%]</strong></p>
    <p>Dates de la formation : du <strong>[%Date de début de la formation%]</strong> au <strong>[%Date de fin de la formation%]</strong></p>
    <p>Durée de la formation : <strong>[%Durée de la formation%] heure(s)</strong></p>
    <p>Présenté par : <strong>[%Nom de l'entreprise%]</strong></p>
  </div>

  <div class="nature-block">
    <p class="nature-title">Nature de l'action concourant au développement des compétences :</p>
    <p class="checkbox-line checked">☑ Action de formation</p>
    <p class="checkbox-line">☐ Bilan de compétences</p>
    <p class="checkbox-line">☐ Action de VAE</p>
    <p class="checkbox-line">☐ Action de formation par apprentissage</p>
  </div>

  <p class="conservation">Sans préjudice des délais imposés par les règles fiscales, comptables ou commerciales, je m'engage à conserver l'ensemble des pièces justificatives qui ont permis d'établir le présent certificat pendant une durée de 3 ans à compter de la fin de l'année du dernier paiement. En cas de cofinancement des fonds européens la durée de conservation est étendue conformément aux obligations conventionnelles spécifiques.</p>

  <h2 class="section">Objectifs de la formation :</h2>
  [%Liste objectifs pédagogiques%]

  <p class="evaluation-line">Résultat de l'évaluation des acquis jalonnant ou terminant la formation (QUIZZ, TEST, QCM etc....) : <strong>ACQUIS</strong></p>
  <p class="emargement-line">La feuille d'émargement attestant cette assiduité est fournie en annexe.</p>

  <div class="mintravail-block">
    <img src="[%URL Logo Ministère du Travail%]" alt="Ministère du Travail" />
  </div>

  <div class="signature-block">
    <p class="fait-line">Fait à [%Ville de l'organisme%], le [%Date d'aujourd'hui%]</p>
    <div class="signature-cachet">[%Cachet de l'organisme%]</div>
  </div>

</body>
</html>`;

export const CERTIFICAT_REALISATION_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 14mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
