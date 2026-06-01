/**
 * Template HTML système — Avis après formation Habilitation Électrique.
 *
 * Document **optionnel** per (session, apprenant). 2 pages :
 *   - Page 1 : Avis après formation (texte + checkboxes Initiale/Recyclage
 *     + Favorable/Défavorable)
 *   - Page 2 : Titre d'habilitation électrique (tableau vide à remplir par
 *     l'employeur après la formation)
 *
 * Norme NF C 18-510 A1. Durée de validité : 3 ans.
 *
 * Checkboxes affichées flat (à entourer manuellement à l'impression).
 * "Monsieur" hardcodé (pas encore de mapping civilité dynamique).
 * "C3V FORMATION" remplacé par [%Nom de l'organisme%] (multi-tenant).
 */

export const AVIS_HABILITATION_ELECTRIQUE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Avis Habilitation Électrique</title>
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
    font-size: 13pt;
    font-weight: 700;
    color: #7f1d1d;
    text-align: center;
    margin: 18px 0 18px;
    letter-spacing: 0.3px;
  }

  p { margin: 0 0 10px; text-align: justify; }
  strong { font-weight: 700; }

  .checkbox-line {
    margin: 10px 0;
    font-weight: 600;
  }
  .checkbox-line .opt {
    display: inline-block;
    margin: 0 18px 0 4px;
  }

  .avis-line {
    margin: 16px 0;
    font-weight: 700;
    font-size: 10pt;
    text-align: center;
  }

  .salutations {
    margin: 18px 0 10px;
    font-style: italic;
  }

  .signature-block {
    margin-top: 12px;
  }
  .signature-cachet { min-height: 100px; }
  .signature-cachet img { max-width: 220px; max-height: 110px; }

  /* Page 2 : Titre habilitation */
  .page-break {
    page-break-before: always;
  }

  h2.titre-habilitation {
    font-size: 12pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    margin: 0 0 14px;
    letter-spacing: 0.5px;
  }

  table.titre-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 12px;
    font-size: 9pt;
  }
  table.titre-table td, table.titre-table th {
    border: 1px solid #6b7280;
    padding: 8px 10px;
    vertical-align: middle;
    text-align: left;
  }
  table.titre-table th {
    background: #f3f4f6;
    font-weight: 700;
    text-align: center;
  }
  table.titre-table .label-col {
    width: 24%;
    font-weight: 600;
  }
  table.titre-table .symbole-col {
    width: 18%;
    font-weight: 700;
  }
  table.titre-table .empty-cell {
    min-height: 28px;
    background: #ffffff;
  }
  table.titre-table .section-header {
    background: #f9fafb;
    text-align: center;
    font-weight: 700;
    font-style: italic;
  }

  .footer-titre {
    display: flex;
    justify-content: space-between;
    margin: 12px 0;
    font-size: 9pt;
  }
  .footer-titre .footer-titre-right {
    font-style: italic;
    text-align: right;
  }

  .sig-line-block {
    display: flex;
    justify-content: space-between;
    margin: 24px 0 8px;
    font-size: 9pt;
  }
  .sig-line-block > div { flex: 1; padding: 0 10px; }
  .sig-line-block .sig-label {
    border-bottom: 1px solid #6b7280;
    min-height: 50px;
    margin-bottom: 4px;
  }

  .duree-validite {
    text-align: center;
    margin: 16px 0;
    font-weight: 700;
    font-size: 11pt;
    color: #7f1d1d;
    padding: 8px 0;
    border: 2px solid #7f1d1d;
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

  <h1 class="title">AVIS APRÈS FORMATION : HABILITATION ÉLECTRIQUE</h1>

  <p>Monsieur <strong>[%Nom de l'apprenant%]</strong></p>

  <p class="checkbox-line">Type d'habilitation : <span class="opt"><s style="color:#9ca3af;">Initiale</s></span><span class="opt"><strong>Recyclage</strong></span></p>

  <p>Monsieur <strong>[%Nom de l'apprenant%]</strong> a suivi du <strong>[%Date de début de la formation%]</strong> au <strong>[%Date de fin de la formation%]</strong>, pour une durée de <strong>[%Durée de la formation%] heure(s)</strong>, le stage de formation à la prévention du risque électrique organisé par <strong>[%Nom de l'organisme%]</strong> (lieu <strong>[%Lieu de la formation%]</strong>), et animé par <strong>[%Nom du/des formateur(s)%]</strong> et intitulé : <strong>[%Nom de la formation%]</strong>. Au cours de ce stage, Monsieur <strong>[%Nom de l'apprenant%]</strong> a acquis les connaissances et les savoir-faire nécessaires pour prendre en compte le risque électrique dans le cadre d'opérations d'ordre électrique ou non électrique et se prémunir de tout accident susceptible d'être encouru lors de ces opérations. Au vu de cet avis et compte-tenu des prescriptions contenues dans la <strong>norme NF C 18-510 A1</strong>, l'employeur peut délivrer à Monsieur <strong>[%Nom de l'apprenant%]</strong>, l'habilitation mentionnée dans l'exemple du Titre d'Habilitation ci-dessous.</p>

  <p class="avis-line">Nous émettons donc un avis : <span class="opt">☐ FAVORABLE</span><span class="opt">☐ DÉFAVORABLE</span></p>

  <p class="salutations">Veuillez agréer, Madame, l'expression de nos salutations les meilleures.</p>

  <div class="signature-block">
    <div class="signature-cachet">[%Cachet de l'organisme%]</div>
  </div>

  <!-- ════════ PAGE 2 : TITRE D'HABILITATION ÉLECTRIQUE ════════ -->

  <div class="page-break"></div>

  <h2 class="titre-habilitation">TITRE D'HABILITATION ÉLECTRIQUE</h2>

  <table class="titre-table">
    <tr>
      <td colspan="2"><strong>Titulaire :</strong> Monsieur [%Nom de l'apprenant%]<br><br><strong>Fonction :</strong></td>
      <td colspan="3"><strong>L'employeur :</strong><br><br><strong>Service / Affectation :</strong></td>
    </tr>
    <tr>
      <th class="label-col">Personnel</th>
      <th class="symbole-col">Symbole habilitation</th>
      <th colspan="3">Champ d'application</th>
    </tr>
    <tr>
      <td class="empty-cell"></td>
      <td class="empty-cell"></td>
      <td class="empty-cell" style="text-align:center;font-size:8.5pt;font-style:italic;">Domaine de tension</td>
      <td class="empty-cell" style="text-align:center;font-size:8.5pt;font-style:italic;">Ouvrages ou inst. concernés</td>
      <td class="empty-cell" style="text-align:center;font-size:8.5pt;font-style:italic;">Indications complémentaires</td>
    </tr>
    <tr><td colspan="5" class="section-header">Travaux d'ordre NON électrique</td></tr>
    <tr><td class="label-col">Exécutant</td><td class="symbole-col">BO-H0V</td><td class="empty-cell"></td><td class="empty-cell"></td><td class="empty-cell"></td></tr>
    <tr><td class="label-col">Chargé de chantier</td><td class="symbole-col">BO-H0V</td><td class="empty-cell"></td><td class="empty-cell"></td><td class="empty-cell"></td></tr>
    <tr><td colspan="5" class="section-header">Opérations d'ordre électrique</td></tr>
    <tr><td class="label-col">Exécutant</td><td class="symbole-col">B1 B1V</td><td class="empty-cell"></td><td class="empty-cell"></td><td class="empty-cell"></td></tr>
    <tr><td class="label-col">Chargé de travaux</td><td class="symbole-col">B2 B2V</td><td class="empty-cell"></td><td class="empty-cell"></td><td class="empty-cell"></td></tr>
    <tr><td class="label-col">Chargé d'intervention BT</td><td class="symbole-col">BR</td><td class="empty-cell"></td><td class="empty-cell"></td><td class="empty-cell"></td></tr>
    <tr><td class="label-col">Chargé de consignation</td><td class="symbole-col">BC</td><td class="empty-cell"></td><td class="empty-cell"></td><td class="empty-cell"></td></tr>
    <tr><td class="label-col">Chargé d'opérations spécifiques</td><td class="symbole-col">BE ESSAI</td><td class="empty-cell"></td><td class="empty-cell"></td><td class="empty-cell"></td></tr>
    <tr><td class="label-col">Chargé d'opérations spécifiques HT</td><td class="symbole-col empty-cell"></td><td class="empty-cell"></td><td class="empty-cell"></td><td class="empty-cell"></td></tr>
    <tr><td class="label-col">Habilité spécial</td><td class="symbole-col empty-cell"></td><td class="empty-cell"></td><td class="empty-cell"></td><td class="empty-cell"></td></tr>
  </table>

  <div class="footer-titre">
    <div><strong>Document Supplémentaire :</strong> NON</div>
    <div class="footer-titre-right">L'absence d'une indication a valeur d'interdiction</div>
  </div>

  <div class="sig-line-block">
    <div>
      <div class="sig-label"></div>
      <div><strong>Le Titulaire :</strong> [%Nom de l'apprenant%] <em>(Date et signature)</em></div>
    </div>
    <div>
      <div class="sig-label"></div>
      <div><strong>L'employeur</strong> <em>(Date et signature)</em></div>
    </div>
  </div>

  <p class="duree-validite">DURÉE DE VALIDITÉ : 3 ANS</p>

</body>
</html>`;

export const AVIS_HABILITATION_ELECTRIQUE_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
