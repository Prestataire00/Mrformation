/**
 * Template HTML système — Programme de formation v2 (format exemples client).
 *
 * Lot A2 — Reproduit les 2 PDF exemples MR Formation (sortis de Gamma) pour
 * remplacer définitivement Gamma :
 *  - PAGE 1 : bandeau titre + logo, « Objectifs généraux » (puces), 2 encadrés
 *    côte à côte (Informations pratiques | Délais et modalités d'accès +
 *    formateur), Méthodes pédagogiques, Modalités d'évaluation, encart
 *    Accessibilité standard.
 *  - PAGE 2 : « Résumé des séquences » → grille de cartes (titre + durée +
 *    objectif de synthèse).
 *  - PAGES 3-4 : « Déroulé pédagogique détaillé » → blocs texte par séquence
 *    (objectifs opérationnels / contenus détaillés / méthodes / évaluation).
 *
 * Ce template n'est servi que pour les programmes ENRICHIS (cf
 * `isEnrichedProgramContent`). Les programmes legacy continuent d'utiliser
 * `programme-formation.ts` (aucune régression).
 *
 * Source données : `session.program` (table `programs`, content JSONB enrichi
 * livré par A1) + entity settings (logo / nom / coordonnées organisme).
 *
 * Format placeholders : `[%xxx%]` (cf ALIAS_TO_VARIABLE_KEY). Les libellés
 * réutilisés sont EXACTEMENT ceux du template legacy / de la table d'alias.
 */

import { PROGRAMME_FORMATION_FOOTER_TEMPLATE } from "./programme-formation";

export { PROGRAMME_FORMATION_FOOTER_TEMPLATE };

export const PROGRAMME_FORMATION_V2_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Programme de formation</title>
<style>
  @page { size: A4; margin: 14mm 16mm 20mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.4;
    color: #1f2937;
    margin: 0;
  }

  /* Header organisme */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
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

  /* Bandeau titre */
  h1.title {
    font-size: 16pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    margin: 8px 0 10px;
    line-height: 1.25;
  }

  /* Sections (titres) */
  h2.section {
    font-size: 13pt;
    font-weight: 700;
    color: #111827;
    margin: 12px 0 5px;
    letter-spacing: 0.3px;
  }

  p { margin: 0 0 5px; text-align: justify; }

  /* Listes à puces */
  ul.bullets {
    list-style: none;
    padding: 0;
    margin: 3px 0 6px 4px;
  }
  ul.bullets > li {
    padding: 1px 0 1px 16px;
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

  /* Deux encadrés côte à côte (page 1) */
  .boxes {
    display: flex;
    gap: 12px;
    margin: 6px 0;
  }
  .box {
    flex: 1;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 12px 14px;
    background: #f9fafb;
  }
  .box h3 {
    font-size: 11pt;
    font-weight: 700;
    color: #111827;
    margin: 0 0 8px;
  }
  .box .row {
    font-size: 9pt;
    color: #374151;
    margin: 0 0 4px;
  }
  .box .row .lbl { font-weight: 700; color: #111827; }

  /* Encart Accessibilité */
  .accessibility {
    border-left: 3px solid #4b5563;
    background: #f3f4f6;
    padding: 8px 12px;
    margin: 10px 0 0;
    font-size: 9pt;
    page-break-inside: avoid;
  }
  .accessibility .acc-title {
    font-weight: 700;
    color: #111827;
    margin: 0 0 4px;
  }

  /* Grille de cartes — résumé des séquences (page 2) */
  .seq-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 8px;
  }
  .seq-card {
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 12px 14px;
    background: #f9fafb;
  }
  .seq-card h3 {
    font-size: 11pt;
    font-weight: 700;
    color: #111827;
    margin: 0 0 4px;
  }
  .seq-card .seq-duration {
    font-size: 8.5pt;
    font-weight: 700;
    color: #4b5563;
    margin: 0 0 6px;
  }
  .seq-card p {
    font-size: 9pt;
    color: #374151;
    margin: 0;
    text-align: left;
  }

  /* Déroulé détaillé — blocs texte par séquence (pages 3-4) */
  .sequence {
    margin: 0 0 11px;
    page-break-inside: avoid;
  }
  .sequence h3 {
    font-size: 11.5pt;
    font-weight: 700;
    color: #ffffff;
    background: #4b5563;
    padding: 5px 10px;
    margin: 0 0 6px;
    border-radius: 4px;
  }
  .sequence .seq-lbl {
    font-size: 10pt;
    font-weight: 700;
    color: #111827;
    margin: 6px 0 2px;
  }

  /* Sauts de page entre les grandes sections */
  .page-break { page-break-before: always; }

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

  [%Objectifs généraux%]

  <div class="boxes">
    <div class="box">
      <h3>Informations pratiques</h3>
      <div class="row"><span class="lbl">Durée :</span> [%Durée du programme%]</div>
      <div class="row"><span class="lbl">Participants :</span> maximum 12</div>
      <div class="row"><span class="lbl">Prérequis :</span> [%Prérequis%]</div>
      <div class="row"><span class="lbl">Public cible :</span> [%Profil du stagiaire%]</div>
      <div class="row"><span class="lbl">Lieu :</span> [%Lieu de la formation%]</div>
    </div>
    <div class="box">
      <h3>Délais et modalités d'accès</h3>
      <div class="row">[%Délais et modalités d'accès%]</div>
      <div class="row"><span class="lbl">Formateur :</span> [%Équipe pédagogique%]</div>
    </div>
  </div>

  <h2 class="section">Méthodes pédagogiques</h2>
  [%Moyens pédagogiques%]

  <h2 class="section">Modalités d'évaluation</h2>
  [%Dispositif d'évaluation%]

  <div class="accessibility">
    <div class="acc-title">Accessibilité</div>
    <p>Pour le bon déroulement de la formation, nous vous remercions de bien vouloir nous signaler si un besoin d'adaptation lié à une situation de handicap (ou toute autre situation spécifique) est nécessaire. Nous ferons tout notre possible pour que chacun puisse suivre notre formation dans les meilleures conditions possibles.</p>
  </div>

  <div class="page-break"></div>
  [%Résumé des séquences%]

  <div class="page-break"></div>
  [%Détail des séquences%]

</body>
</html>`;
