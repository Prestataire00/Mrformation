/**
 * Template HTML système — Lettre de décharge de responsabilité.
 *
 * Document **optionnel** per (session, apprenant). 1 page courte.
 *
 * Sert à formaliser un départ anticipé du stagiaire en cours de formation,
 * déchargeant l'organisme de toute responsabilité à partir de l'heure
 * annoncée.
 *
 * Champs à remplir à la main après impression :
 *   - Heure de départ (___h____)
 *   - Motif (2 lignes pointillées)
 *   - Ville + date de signature
 *   - Signature apprenant
 */

export const LETTRE_DECHARGE_RESPONSABILITE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Lettre de décharge — Départ anticipé</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.6;
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
    margin: 28px 0 28px;
    color: #111827;
    letter-spacing: 0.4px;
  }

  p { margin: 0 0 14px; text-align: justify; }
  strong { font-weight: 700; }

  .fill {
    display: inline-block;
    border-bottom: 1px dotted #6b7280;
    color: #6b7280;
    text-align: center;
    padding: 0 4px;
  }
  .fill-line {
    display: block;
    border-bottom: 1px dotted #6b7280;
    margin: 6px 0 12px;
    min-height: 16px;
  }

  .attestation-block {
    margin-top: 20px;
  }

  .certif {
    margin: 18px 0 24px;
    font-style: italic;
  }

  .lieu-date {
    margin: 22px 0 18px;
  }
  .lieu-date .fill { min-width: 30px; }

  .signature-block {
    margin-top: 14px;
  }
  .sig-label {
    font-weight: 600;
    margin-bottom: 8px;
  }
  .sig-box {
    border: 1px solid #9ca3af;
    min-height: 90px;
    max-width: 320px;
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

  <h1 class="title">Lettre de décharge de responsabilité</h1>

  <p>Je soussigné(e), <strong>[%Nom de l'apprenant%]</strong>, doit quitter prématurément l'action de formation nommée : <strong>[%Nom de la formation%]</strong>, que j'ai suivie du <strong>[%Date de début de la formation%]</strong> au <strong>[%Date de fin de la formation%]</strong>, ce jour à <span class="fill" style="min-width:40px;">…</span>&nbsp;h&nbsp;<span class="fill" style="min-width:40px;">…</span> pour la raison suivante :</p>

  <div class="fill-line"></div>
  <div class="fill-line"></div>

  <div class="attestation-block">
    <p>J'atteste avoir prévenu mon employeur de ce départ anticipé et décharge l'organisme de formation de toute responsabilité à partir de l'heure annoncée.</p>
  </div>

  <p class="certif">Je certifie sur l'honneur l'exactitude des renseignements apportés.</p>

  <p class="lieu-date">A <span class="fill" style="min-width:120px;">…</span>, le <span class="fill" style="min-width:30px;">…</span>/<span class="fill" style="min-width:30px;">…</span>/<span class="fill" style="min-width:50px;">…</span></p>

  <div class="signature-block">
    <div class="sig-label">Signature de l'apprenant,</div>
    <div class="sig-box"></div>
  </div>

</body>
</html>`;

export const LETTRE_DECHARGE_RESPONSABILITE_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
