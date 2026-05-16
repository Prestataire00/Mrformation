/**
 * Template HTML système — Programme de formation.
 *
 * Reproduit le PDF Loris `Programme-Formation-mrformation.pdf` (4 pages,
 * structure riche : titre + chapeau + métadonnées + profil + prérequis +
 * objectifs + progression pédagogique par jour/créneau + organisation +
 * qualité + accessibilité).
 *
 * Source données : `session.program` (table `programs` via `session.program_id`)
 * + fallback sur `session.training` si pas de programme. La progression
 * pédagogique vient de `program.content.modules[]` avec les nouveaux champs
 * `day_number`, `slot`, `animation_items[]` (ajoutés dans cette story).
 *
 * Format placeholders : `[%xxx%]` (cf ALIAS_TO_VARIABLE_KEY).
 */

export const PROGRAMME_FORMATION_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Programme de formation</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.5;
    color: #1f2937;
    margin: 0;
  }

  /* Header organisme (page 1) */
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

  /* Titre principal */
  h1.title {
    font-size: 18pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    margin: 24px 0 12px;
    line-height: 1.3;
  }

  /* Chapeau description */
  .description {
    font-size: 9.5pt;
    color: #374151;
    margin: 0 0 6px;
    line-height: 1.5;
  }

  /* Bandeau métadonnées */
  .meta-line {
    font-size: 9pt;
    color: #4b5563;
    margin: 0 0 4px;
  }

  /* Sections (h2 noir gros) */
  h2.section {
    font-size: 16pt;
    font-weight: 700;
    color: #111827;
    margin: 22px 0 10px;
    letter-spacing: 0.3px;
  }

  /* Sous-titres au sein d'une section */
  h3.sub {
    font-size: 10pt;
    font-weight: 700;
    color: #111827;
    margin: 12px 0 4px;
  }

  p { margin: 0 0 6px; text-align: justify; }

  /* Listes à puces classiques */
  ul.bullets {
    list-style: none;
    padding: 0;
    margin: 4px 0 8px 4px;
  }
  ul.bullets > li {
    padding: 2px 0 2px 16px;
    position: relative;
  }
  ul.bullets > li::before {
    content: "\\2022";
    color: #111827;
    font-weight: 700;
    position: absolute;
    left: 2px;
    top: 2px;
  }

  /* Progression pédagogique : header jour + table Contenu/Animation */
  .day-header {
    font-size: 11pt;
    font-weight: 700;
    color: #ffffff;
    background: #4b5563;
    padding: 6px 12px;
    margin: 18px 0 0;
  }
  .slot-label {
    font-size: 10pt;
    font-weight: 700;
    color: #111827;
    padding: 8px 12px 4px;
    background: #f3f4f6;
  }
  table.progression {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 4px;
    font-size: 9pt;
  }
  table.progression th {
    background: #e5e7eb;
    border: 1px solid #d1d5db;
    padding: 6px 10px;
    text-align: left;
    font-weight: 700;
    color: #111827;
    width: 50%;
  }
  table.progression td {
    border: 1px solid #d1d5db;
    padding: 8px 10px;
    vertical-align: top;
  }
  table.progression .module-title {
    font-weight: 700;
    color: #111827;
    margin: 0 0 4px;
  }
  table.progression .module-title + ul {
    margin: 2px 0 8px 4px;
  }
  table.progression ul {
    list-style: none;
    padding: 0;
    margin: 4px 0 0 4px;
  }
  table.progression ul li {
    padding: 1px 0 1px 14px;
    position: relative;
  }
  table.progression ul li::before {
    content: "\\2022";
    color: #111827;
    font-weight: 700;
    position: absolute;
    left: 2px;
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

  <h1 class="title">Programme de formation : [%Nom de la formation%]</h1>

  <p class="description">[%Description de la formation%]</p>
  <p class="meta-line">Date de creation: [%Date de création du programme%] | Durée: [%Durée de la formation%] heure(s) | [%Durée en jours%] jour(s) (du [%Date de début de la formation%] au [%Date de fin de la formation%])</p>
  <p class="meta-line">Version : [%Version du programme%] | Délais d'accès : [%Délais d'accès%] jour(s) | Modalité d'accès : [%Modalité d'accès%]</p>

  <h2 class="section">A QUI S'ADRESSE CETTE FORMATION ?</h2>
  <h3 class="sub">Profil du stagiaire</h3>
  <p>[%Profil du stagiaire%]</p>
  <h3 class="sub">Prérequis</h3>
  <p>[%Prérequis%]</p>

  <h2 class="section">OBJECTIFS PEDAGOGIQUES</h2>
  [%Liste objectifs pédagogiques%]

  <h2 class="section">CONTENU (PROGRESSION PEDAGOGIQUE)</h2>
  [%Contenu pédagogique%]

  <h2 class="section">ORGANISATION</h2>
  <h3 class="sub">Formateur &amp; Équipe Pédagogique</h3>
  <p>[%Équipe pédagogique%]</p>

  <h3 class="sub">Moyens pédagogiques et techniques</h3>
  [%Moyens pédagogiques%]

  <h3 class="sub">Dispositif de suivi de l'exécution de d'évaluation des résultats de la formation</h3>
  [%Dispositif d'évaluation%]

  <h2 class="section">Qualité</h2>
  <h3 class="sub">Indicateurs de Résultats</h3>
  <p><strong>Taux de satisfaction :</strong> [%Taux de satisfaction%] %</p>
  <p><strong>Nombre de stagiaires :</strong> groupe : [%Effectif max%]</p>

  <h2 class="section">Accessibilité</h2>
  <p>Pour le bon déroulement de la formation, nous vous remercions de bien vouloir nous signaler si un besoin d'adaptation lié à une situation de handicap (ou toute autre situation spécifique) est nécessaire. Nous ferons tout notre possible pour que chacun puisse suivre notre formation dans les meilleures conditions possibles.</p>

</body>
</html>`;

/**
 * Footer Puppeteer — identique aux autres docs.
 */
export const PROGRAMME_FORMATION_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
