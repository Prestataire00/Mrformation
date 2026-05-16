/**
 * Template HTML système — Autorisation de droit à l'image.
 *
 * Document **optionnel** per (session, apprenant). Autorisation signée par
 * l'apprenant pour exploitation des photos/vidéos prises pendant la formation
 * (presse, livre, site, réseaux sociaux, etc.).
 *
 * Mise en page : style identique aux autres docs (header organisme + logo +
 * footer SIRET) + zone signature apprenant (ligne vide MVP, sera remplacée
 * par image quand Lot C "Signatures unifiées" sera implémenté).
 */

export const AUTORISATION_IMAGE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Autorisation de droit à l'image</title>
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
    font-size: 14pt;
    font-weight: 700;
    color: #7f1d1d;
    text-align: center;
    margin: 22px 0 22px;
    letter-spacing: 0.3px;
  }

  p { margin: 0 0 10px; text-align: justify; }
  strong { font-weight: 700; }

  .identity-block {
    margin: 0 0 18px;
  }
  .identity-block p { margin: 0 0 4px; }

  .signature-block {
    margin-top: 28px;
  }
  .signature-block .fait-line {
    margin: 0 0 14px;
  }
  .signature-block .sig-label {
    margin: 18px 0 4px;
    font-size: 9.5pt;
    color: #4b5563;
    font-style: italic;
  }
  .signature-block .learner-name-after-sig {
    margin: 6px 0 0;
    font-weight: 700;
    text-align: center;
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

  <h1 class="title">Autorisation de droit à l'image</h1>

  <div class="identity-block">
    <p>Je soussigné(e)</p>
    <p>Nom et prénom : <strong>[%Nom de l'apprenant%]</strong></p>
  </div>

  <p>Conformément aux dispositions relatives au droit à l'image, j'autorise <strong>[%Nom de l'organisme%]</strong> dont le siège est situé au <strong>[%Adresse de l'organisme%]</strong> à réaliser des prises de vue photographiques, des vidéos ou des captations numériques lors de la formation <strong>[%Nom de la formation%]</strong> qui aura lieu le <strong>[%Date de début de la formation%]</strong> à <strong>[%Adresse de la formation%]</strong>.</p>

  <p>Les images pourront être exploitées et utilisées directement par la structure sous toute forme et tous supports, pour un territoire illimité, sans limitation de durée, intégralement ou par extraits et notamment : presse, livre, supports numérique, exposition, publicité, projection publique, concours, site internet, réseaux sociaux.</p>

  <p>Le bénéficiaire de l'autorisation s'interdit expressément de procéder à une exploitation des photographies susceptible de porter atteinte à la vie privée ou à la réputation, et d'utiliser les photographies, vidéos ou captations numériques de la présente, dans tout support ou toute exploitation préjudiciable.</p>

  <p>Je reconnais être entièrement rempli de mes droits et je ne pourrai prétendre à aucune rémunération pour l'exploitation des droits visés aux présentes.</p>

  <p>Je garantis que ni moi, ni le cas échéant la personne que je représente, n'est lié par un contrat exclusif relatif à l'utilisation de mon image ou de mon nom.</p>

  <p>Pour tout litige né de l'interprétation ou de l'exécution des présentes, il est fait attribution expresse de juridiction aux tribunaux français.</p>

  <div class="signature-block">
    <p class="fait-line">Fait à <strong>[%Ville de l'organisme%]</strong>, le <strong>[%Date d'aujourd'hui%]</strong></p>

    <p class="sig-label">Signature de l'apprenant :</p>
    [%E-signature de l'apprenant%]
    <p class="learner-name-after-sig">[%Nom de l'apprenant%]</p>
  </div>

</body>
</html>`;

export const AUTORISATION_IMAGE_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
