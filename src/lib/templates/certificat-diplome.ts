/**
 * Template HTML système — Certificat diplôme (fin de formation).
 *
 * Document per (session, apprenant). Reproduit le PDF Loris
 * `Certificat-mrformation.pdf` : design "diplôme stylé" avec crown 👑 en
 * haut, gros titre "Certificat", nom apprenant teal en uppercase, nom
 * formation noir uppercase, organisme + code identification + cachet, et
 * cadre décoratif teal/or en bas.
 *
 * Code certificat : déterministe via `generateCertificateCode(learnerId,
 * sessionId)` (hash SHA-256 13 chars). Calculé côté API et passé via
 * `ResolveContext.certificateCode`.
 *
 * NB : pas de "Footer" Puppeteer car le design est full-bleed (décoration
 * teal en bas du body).
 */

export const CERTIFICAT_DIPLOME_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Certificat</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 40px 50px 0;
    color: #1f2937;
    min-height: 100vh;
    position: relative;
    text-align: center;
  }

  .crown {
    font-size: 38pt;
    color: #b45309;
    margin: 0 0 8px;
    line-height: 1;
  }

  .delivered-line {
    font-size: 11pt;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 18px;
  }

  h1.title {
    font-size: 40pt;
    font-weight: 800;
    color: #111827;
    margin: 0 0 18px;
    letter-spacing: -1px;
  }

  .atteste-line {
    font-size: 11pt;
    color: #4b5563;
    margin: 0 0 8px;
  }

  .learner-name {
    font-size: 32pt;
    font-weight: 800;
    color: #0d9488;
    margin: 14px 0 22px;
    text-transform: uppercase;
    letter-spacing: 1px;
    line-height: 1.1;
  }

  .success-line {
    font-size: 11pt;
    color: #4b5563;
    margin: 0 0 12px;
  }

  .formation-name {
    font-size: 18pt;
    font-weight: 800;
    color: #111827;
    margin: 12px 16px 30px;
    text-transform: uppercase;
    line-height: 1.3;
  }

  .org-label {
    font-size: 10pt;
    color: #6b7280;
    margin: 0 0 4px;
  }
  .org-name {
    font-size: 12pt;
    font-weight: 700;
    color: #111827;
    margin: 0 0 22px;
  }

  .code-label {
    font-size: 10pt;
    color: #6b7280;
    margin: 0 0 4px;
  }
  .code-value {
    font-size: 12pt;
    font-weight: 700;
    color: #111827;
    margin: 0 0 22px;
    font-family: 'Courier New', monospace;
  }

  .cachet-block {
    display: flex;
    justify-content: center;
    margin: 14px 0 0;
  }
  .cachet-block img {
    max-width: 220px;
    max-height: 110px;
  }

  /* Décor bas : 2 triangles teal + ruban or au centre */
  .bottom-decor {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 110px;
    overflow: hidden;
  }
  .bottom-decor svg {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
</head>
<body>

  <div class="crown">👑</div>
  <p class="delivered-line">Délivré Le [%Date d'aujourd'hui%]</p>

  <h1 class="title">Certificat</h1>

  <p class="atteste-line">Ce certificat atteste que :</p>
  <div class="learner-name">[%Nom de l'apprenant%]</div>

  <p class="success-line">A suivi la formation avec succès</p>
  <div class="formation-name">[%Nom de la formation%]</div>

  <p class="org-label">Nom de l'Organisme de Formation</p>
  <p class="org-name">[%Nom de l'organisme%]</p>

  <p class="code-label">Code d'Identification du Certificat</p>
  <p class="code-value">CODE: [%Code d'identification du certificat%]</p>

  <div class="cachet-block">[%Cachet de l'organisme%]</div>

  <div class="bottom-decor">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 110" preserveAspectRatio="none">
      <!-- Triangle gauche teal -->
      <polygon points="0,30 0,110 400,110" fill="#0d9488" />
      <polygon points="0,15 0,30 410,110 400,110" fill="#fbbf24" />
      <!-- Triangle droit teal -->
      <polygon points="800,30 800,110 400,110" fill="#0d9488" />
      <polygon points="800,15 800,30 390,110 400,110" fill="#fbbf24" />
      <!-- Médaille centrale (cercle + ruban) -->
      <circle cx="400" cy="80" r="36" fill="#0d9488" stroke="#fbbf24" stroke-width="4"/>
      <circle cx="400" cy="80" r="20" fill="#0d9488" stroke="#fbbf24" stroke-width="2"/>
      <polygon points="380,108 400,90 420,108" fill="#0d9488" stroke="#fbbf24" stroke-width="2"/>
    </svg>
  </div>

</body>
</html>`;

/**
 * Footer vide (le design diplôme est full-bleed, pas de footer SIRET).
 */
export const CERTIFICAT_DIPLOME_FOOTER_TEMPLATE = `<span></span>`;
