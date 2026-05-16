/**
 * Template HTML système — Politique RGPD.
 *
 * Document **statique** au niveau session/client — seuls les champs organisme
 * varient (nom, email, adresse, etc.). Reproduit fidèlement le PDF Loris
 * `Politique-rgpd-mrformation.pdf` : 6 sections + intro + DPO contact.
 *
 * Pattern identique aux CGV (cf `cgv.ts`) : header organisme + logo + titre
 * centré + sections + footer SIRET/NDA per-page.
 *
 * Format placeholders : `[%xxx%]` (cf ALIAS_TO_VARIABLE_KEY).
 */

export const POLITIQUE_RGPD_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Politique RGPD</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.5;
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
    color: #111827;
    text-align: center;
    margin: 24px 0 18px;
    letter-spacing: 0.5px;
  }

  h2.section-label {
    font-size: 10pt;
    font-weight: 700;
    color: #111827;
    margin: 14px 0 4px;
  }
  h3.sub-title {
    font-size: 9.5pt;
    font-weight: 700;
    color: #111827;
    margin: 8px 0 2px;
  }

  p { margin: 0 0 6px; text-align: justify; }

  /* Listes 1er niveau (puces noires pleines) */
  ul.level-1 {
    list-style: none;
    padding: 0;
    margin: 4px 0 6px 4px;
  }
  ul.level-1 > li {
    padding: 1px 0 1px 14px;
    position: relative;
  }
  ul.level-1 > li::before {
    content: "\\2022";
    color: #111827;
    font-weight: 700;
    position: absolute;
    left: 2px;
    top: 1px;
  }

  /* Listes 2e niveau (cercles vides) */
  ul.level-2 {
    list-style: none;
    padding: 0;
    margin: 2px 0 4px 18px;
  }
  ul.level-2 > li {
    padding: 1px 0 1px 14px;
    position: relative;
  }
  ul.level-2 > li::before {
    content: "\\25E6";
    color: #374151;
    position: absolute;
    left: 2px;
    top: 1px;
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

  <h1 class="title">POLITIQUE RGPD</h1>

  <h2 class="section-label">Introduction</h2>
  <p>Notre organisme de formation accorde une importance majeure à la protection et à la confidentialité des données à caractère personnel collectées et traitées dans le cadre de ses activités. Conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés, nous adoptons des mesures techniques et organisationnelles rigoureuses afin de garantir la sécurité, la confidentialité, l'intégrité et la disponibilité des données personnelles.</p>

  <h2 class="section-label">1. Finalité du traitement des données</h2>
  <p>Les données collectées visent exclusivement à :</p>
  <ul class="level-1">
    <li>Assurer la gestion administrative et pédagogique des formations.</li>
    <li>Gérer l'inscription, le suivi pédagogique, et l'évaluation des stagiaires.</li>
    <li>Répondre aux obligations légales et réglementaires (déclaration d'activité, suivi qualité, etc.).</li>
  </ul>

  <h2 class="section-label">2. Catégories de données collectées</h2>
  <ul class="level-1">
    <li>Nom et prénom</li>
    <li>Adresse email</li>
  </ul>
  <p>Aucune autre information sensible n'est stockée dans notre base de données.</p>

  <h2 class="section-label">3. Mesures techniques de sécurité</h2>
  <ul class="level-1">
    <li>
      <strong>Chiffrement des données :</strong>
      <ul class="level-2">
        <li>Toutes les données collectées sont systématiquement chiffrées lors de leur stockage (AES 256 bits).</li>
        <li>Utilisation du protocole sécurisé HTTPS pour tous les échanges de données en ligne.</li>
      </ul>
    </li>
    <li>
      <strong>Contrôle d'accès :</strong>
      <ul class="level-2">
        <li>Authentification sécurisée des utilisateurs avec des mots de passe robustes, renouvelés régulièrement.</li>
        <li>Gestion stricte des droits d'accès selon le principe du moindre privilège, limitant l'accès aux seules données nécessaires à la fonction de l'utilisateur.</li>
      </ul>
    </li>
    <li>
      <strong>Sauvegarde et récupération des données :</strong>
      <ul class="level-2">
        <li>Sauvegardes automatiques quotidiennes stockées sur des serveurs sécurisés distants.</li>
        <li>Test régulier des procédures de restauration des données pour assurer la continuité d'activité.</li>
      </ul>
    </li>
    <li>
      <strong>Protection des équipements :</strong>
      <ul class="level-2">
        <li>Systèmes antivirus et pare-feu professionnels mis à jour automatiquement.</li>
        <li>Sécurisation physique des locaux avec contrôle d'accès restreint et vidéo-surveillance.</li>
      </ul>
    </li>
  </ul>

  <h2 class="section-label">4. Mesures organisationnelles de sécurité</h2>
  <ul class="level-1">
    <li>
      <strong>Politique interne de confidentialité :</strong>
      <ul class="level-2">
        <li>Sensibilisation régulière du personnel à la sécurité des données et à la confidentialité par des formations dédiées.</li>
        <li>Signature d'accords de confidentialité par chaque employé.</li>
      </ul>
    </li>
    <li>
      <strong>Gestion des incidents de sécurité :</strong>
      <ul class="level-2">
        <li>Procédure claire pour la gestion et la notification immédiate des violations de données.</li>
        <li>Analyse systématique et documentation des incidents afin de mettre en œuvre des actions correctives efficaces.</li>
      </ul>
    </li>
    <li>
      <strong>Sous-traitance :</strong>
      <ul class="level-2">
        <li>Sélection rigoureuse des prestataires et sous-traitants, avec signature systématique d'un contrat de traitement des données conforme au RGPD.</li>
        <li>Audits réguliers des sous-traitants pour s'assurer du respect des engagements pris en matière de sécurité des données.</li>
      </ul>
    </li>
    <li>
      <strong>Conservation limitée des données :</strong>
      <ul class="level-2">
        <li>Respect strict des durées de conservation définies en fonction des finalités du traitement et des obligations légales.</li>
        <li>Destruction sécurisée ou anonymisation des données au terme de la période de conservation.</li>
      </ul>
    </li>
  </ul>

  <h2 class="section-label">5. Droits des personnes concernées</h2>
  <p>Conformément au RGPD, chaque personne dispose des droits suivants :</p>
  <ul class="level-1">
    <li>Accès à ses données personnelles</li>
    <li>Rectification et mise à jour</li>
    <li>Opposition et limitation du traitement</li>
    <li>Effacement (droit à l'oubli)</li>
    <li>Portabilité des données</li>
  </ul>
  <p>Toute demande relative à ces droits doit être adressée au Responsable de la Protection des Données (DPO), désigné au sein de notre organisme, par email ou courrier postal.</p>

  <h2 class="section-label">6. Mise à jour de la politique</h2>
  <p>La présente politique est revue annuellement ou lors d'évolutions significatives des pratiques internes ou réglementaires.</p>

  <h3 class="sub-title">Contact du DPO :</h3>
  <ul class="level-1">
    <li>Email : [%Email de l'organisme%]</li>
    <li>Adresse : [%Adresse de l'organisme%].</li>
  </ul>

</body>
</html>`;

/**
 * Footer Puppeteer — identique aux autres docs (CGV, convention, émargement).
 */
export const POLITIQUE_RGPD_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
