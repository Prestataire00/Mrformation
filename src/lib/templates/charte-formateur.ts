/**
 * Template HTML système — Charte du formateur.
 *
 * Document **optionnel** per formateur (PAS per session) — code de conduite
 * éthique signé par le formateur lors de son onboarding. 19 engagements
 * déontologiques.
 *
 * Tous les "C3V FORMATION" hardcodés dans le mapping user sont remplacés
 * par [%Nom de l'organisme%] (multi-tenant — fonctionne aussi avec MR).
 *
 * Mise en page : style identique aux autres docs (header organisme + logo
 * + footer SIRET) + zone signature formateur.
 */

export const CHARTE_FORMATEUR_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Charte du formateur</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.45;
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
    font-size: 14pt;
    font-weight: 700;
    color: #7f1d1d;
    text-align: center;
    margin: 18px 0 18px;
    letter-spacing: 0.5px;
  }

  p.intro {
    margin: 0 0 14px;
    text-align: justify;
  }

  /* Liste d'engagements numérotés */
  ol.engagements {
    list-style: none;
    counter-reset: engagement;
    padding: 0;
    margin: 0 0 16px;
  }
  ol.engagements > li {
    counter-increment: engagement;
    padding: 4px 0 4px 32px;
    position: relative;
    text-align: justify;
    margin-bottom: 4px;
  }
  ol.engagements > li::before {
    content: counter(engagement);
    position: absolute;
    left: 0;
    top: 4px;
    width: 24px;
    text-align: center;
    font-weight: 700;
    color: #7f1d1d;
  }

  /* Sous-liste dans article 10 */
  ul.sub {
    list-style: none;
    padding: 0;
    margin: 4px 0 4px 4px;
  }
  ul.sub > li {
    padding: 2px 0 2px 14px;
    position: relative;
  }
  ul.sub > li::before {
    content: "-";
    position: absolute;
    left: 2px;
  }

  .signature-block {
    margin-top: 22px;
  }
  .signature-block .sig-label {
    margin: 0 0 4px;
    font-weight: 600;
    font-size: 10pt;
  }
  .signature-block .trainer-name-after-sig {
    margin: 6px 0 0;
    font-weight: 700;
    text-align: center;
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

  <h1 class="title">CHARTE DU FORMATEUR</h1>

  <p class="intro">Dans un souci de respect de notre démarche qualité et des principes déontologiques, les formateurs intervenant pour <strong>[%Nom de l'organisme%]</strong> s'engagent à suivre l'ensemble des engagements suivants :</p>

  <ol class="engagements">
    <li>Bâtir une proposition de formation qui prenne en compte les réalités des besoins des bénéficiaires, du commanditaire et des pratiques professionnelles ainsi que les objectifs spécifiques à chaque action de développement des compétences.</li>
    <li>Proposer un accompagnement et un suivi permettant à chacun d'être acteur de son parcours de formation en toute autonomie, en veillant à la personnalisation et l'individualisation des actions.</li>
    <li>Animer les actions de développement des compétences de façon vivante et interactive en impliquant les bénéficiaires comme acteur de leur apprentissage en les mettant en situation, le plus souvent possible.</li>
    <li>Veiller au confort matériel et psychologique des bénéficiaires durant l'action de développement des compétences pour favoriser leur apprentissage et l'acquisition des compétences.</li>
    <li>Remettre et proposer à chaque bénéficiaire des ressources et des supports pédagogiques adaptés, pertinents et actualisés.</li>
    <li>Participer et veiller à la mise en œuvre des mesures destinées à favoriser l'engagement et la participation des bénéficiaires de l'action.</li>
    <li>Entretenir avec les bénéficiaires des actions des relations empreintes de correction, droiture et neutralité.</li>
    <li>Ne pas communiquer à des tiers des informations relatives à des situations individuelles ou des données confidentielles.</li>
    <li>Mener une veille régulière et approfondie afin d'adapter régulièrement le contenu de ses interventions mais également des méthodes, moyens et outils pédagogiques utilisés.</li>
    <li>Actualiser et perfectionner ses connaissances et ses compétences à deux niveaux :
      <ul class="sub">
        <li>Le maintien et l'actualisation de son expertise professionnelle dans le domaine sur lequel il intervient</li>
        <li>L'innovation pédagogique, ingénierie de formation, animation de groupe, pédagogie relative aux adultes, utilisation des outils pédagogiques.</li>
      </ul>
    </li>
    <li>Procéder à l'actualisation régulière des contenus des actions pour toujours transmettre des connaissances actualisées.</li>
    <li>Citer ses sources et respecter les règles de la propriété intellectuelle.</li>
    <li>Concevoir et mettre en œuvre un dispositif d'évaluation permettant de valider l'acquisition des compétences en lien avec les objectifs de l'action.</li>
    <li>Participer à la mise en œuvre des évaluations « à chaud » et « à froid » ainsi qu'au suivi des parcours professionnels des bénéficiaires des actions de développement des compétences.</li>
    <li>Effectuer un bilan de chacune des actions de développement des compétences par une évaluation individuelle écrite et un bilan de groupe et en fournir la synthèse qui sera transmise aux différentes parties prenantes de l'action.</li>
    <li>Intégrer les observations et les résultats des évaluations dans une logique d'amélioration continue des supports, des techniques et de l'animation pédagogiques.</li>
    <li>Adapter ses pratiques, supports, évaluations et méthodes pédagogiques aux bénéficiaires porteurs d'un handicap.</li>
    <li>Informer immédiatement la direction de <strong>[%Nom de l'organisme%]</strong> dès qu'il constate un dysfonctionnement ou qu'il recueille des remarques ou réclamations émanant des bénéficiaires.</li>
    <li>Être dans une démarche de réflexion permanente sur ses pratiques et s'inscrire dans une démarche d'amélioration systématique de la qualité des actions de développement des compétences en apportant notamment toutes les mesures correctives nécessaires.</li>
  </ol>

  <div class="signature-block">
    <p class="sig-label">Signature du formateur :</p>
    [%E-signature du Formateur%]
    <p class="trainer-name-after-sig">[%Nom du formateur%]</p>
  </div>

</body>
</html>`;

export const CHARTE_FORMATEUR_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
