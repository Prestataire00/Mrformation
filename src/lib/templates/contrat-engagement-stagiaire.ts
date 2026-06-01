/**
 * Template HTML système — Contrat d'engagement stagiaire.
 *
 * Document **optionnel** per (session, apprenant). Engagements réciproques
 * stagiaire ↔ organisme de formation.
 *
 * Structure :
 *   - Tableau 2 colonnes (Organisme | Stagiaire) avec coords
 *   - Section formation (intitulé, durée, dates, lieu)
 *   - Liste "Le stagiaire s'engage à…" (9 puces)
 *   - Liste "L'organisme s'engage à…" (6 puces)
 *   - Sanctions en cas de non-respect
 *   - Signatures (apprenant + formateur)
 *
 * "Date de naissance :" laissée vide (pas de champ birth_date côté Learner —
 * à remplir à la main après impression).
 *
 * "Lu et approuvé" + signatures à compléter manuellement.
 */

export const CONTRAT_ENGAGEMENT_STAGIAIRE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Contrat d'engagement stagiaire</title>
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
    font-size: 15pt;
    font-weight: 700;
    color: #1d4ed8;
    text-align: center;
    margin: 16px 0 4px;
    letter-spacing: 0.4px;
  }
  h1.title .subtitle {
    display: block;
    font-size: 11pt;
    font-weight: 600;
    color: #1d4ed8;
    margin-top: 4px;
  }

  table.parties {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0 18px;
    background: #eef2ff;
    border: 1px solid #c7d2fe;
  }
  table.parties th {
    text-align: center;
    font-weight: 700;
    padding: 8px 12px;
    border-bottom: 1px dashed #a5b4fc;
    color: #1e293b;
  }
  table.parties td {
    padding: 10px 14px;
    vertical-align: top;
    width: 50%;
  }
  table.parties ul {
    margin: 0;
    padding-left: 18px;
  }
  table.parties li {
    margin-bottom: 4px;
    line-height: 1.45;
  }

  p { margin: 0 0 8px; text-align: justify; }
  strong { font-weight: 700; }

  .intro-formation {
    margin: 14px 0;
  }
  .formation-block {
    margin: 8px 0 14px;
    padding-left: 16px;
  }
  .formation-block p { margin: 0 0 3px; }

  h2.section {
    font-size: 11pt;
    font-weight: 700;
    color: #111827;
    margin: 18px 0 6px;
  }

  ul.engagements {
    margin: 4px 0 12px;
    padding-left: 22px;
  }
  ul.engagements li {
    margin-bottom: 4px;
    line-height: 1.45;
  }

  .sanctions-intro {
    margin: 14px 0 6px;
    font-style: italic;
  }
  ul.sanctions {
    margin: 4px 0 12px;
    padding-left: 22px;
  }
  ul.sanctions li {
    margin-bottom: 3px;
  }

  .effet-contrat {
    margin: 14px 0;
    padding: 8px 12px;
    background: #f9fafb;
    border-left: 3px solid #9ca3af;
    font-style: italic;
  }

  .signatures-block {
    display: flex;
    justify-content: space-between;
    margin-top: 22px;
    gap: 24px;
  }
  .signatures-block > div {
    flex: 1;
  }
  .sig-label {
    font-weight: 700;
    margin-bottom: 4px;
  }
  .sig-mention {
    font-size: 8.5pt;
    font-style: italic;
    color: #4b5563;
    margin-bottom: 6px;
  }
  .sig-box {
    border: 1px solid #9ca3af;
    min-height: 70px;
    background: #ffffff;
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

  <h1 class="title">
    CONTRAT D'ENGAGEMENT
    <span class="subtitle">Entre le stagiaire et l'organisme de formation</span>
  </h1>

  <table class="parties">
    <tr>
      <th>Organisme de formation</th>
      <th>Stagiaire</th>
    </tr>
    <tr>
      <td>
        <ul>
          <li>Nom : <strong>[%Nom de l'organisme%]</strong></li>
          <li>Adresse : <strong>[%Adresse de l'organisme%]</strong></li>
          <li>Mail : <strong>[%Email de l'organisme%]</strong></li>
        </ul>
      </td>
      <td>
        <ul>
          <li>Nom : <strong>[%Nom de l'apprenant%]</strong></li>
          <li>Date de naissance : <span style="color:#9ca3af;">………………………</span></li>
          <li>Mail : <strong>[%Email de l'apprenant%]</strong></li>
        </ul>
      </td>
    </tr>
  </table>

  <p class="intro-formation">Le présent contrat vise à définir les engagements réciproques du stagiaire et de l'organisme de formation dans le cadre de la formation intitulée :</p>

  <div class="formation-block">
    <p><strong>Intitulé de la formation :</strong> [%Nom de la formation%]</p>
    <p><strong>Durée :</strong> [%Durée de la formation%] heure(s)</p>
    <p><strong>Dates :</strong> Du <strong>[%Date de début de la formation%]</strong> au <strong>[%Date de fin de la formation%]</strong></p>
    <p><strong>Lieu :</strong> [%Lieu de la formation%]</p>
  </div>

  <h2 class="section">Le stagiaire s'engage à :</h2>
  <ul class="engagements">
    <li>Être présent, assidu et ponctuel à l'ensemble des sessions de formation (cours théoriques, ateliers pratiques, chantiers-écoles, stages en entreprise).</li>
    <li>Porter les Équipements de Protection Individuelle (EPI) obligatoires : chaussures de sécurité, vêtements adaptés, casque, gants, etc.</li>
    <li>Respecter les consignes de sécurité en atelier, sur chantier ou en salle.</li>
    <li>Ne pas utiliser d'outils, machines ou matériels sans l'autorisation du formateur.</li>
    <li>Maintenir en bon état le matériel, les équipements collectifs et les zones de travail.</li>
    <li>Signaler toute absence ou retard avec justificatif, dans les plus brefs délais.</li>
    <li>Respecter le règlement intérieur de l'organisme et les consignes du personnel encadrant.</li>
    <li>Adopter un comportement respectueux, professionnel et coopératif envers les autres stagiaires, les formateurs, et les partenaires professionnels.</li>
    <li>Participer activement aux activités pédagogiques, aux évaluations et aux périodes en entreprise.</li>
  </ul>

  <h2 class="section">L'organisme de formation s'engage à :</h2>
  <ul class="engagements">
    <li>Proposer une formation conforme au programme pédagogique validé.</li>
    <li>Mettre à disposition les moyens techniques, matériels, outils et équipements nécessaires à la formation.</li>
    <li>Assurer la sécurité des stagiaires sur les zones pratiques ou chantiers pédagogiques.</li>
    <li>Fournir un accompagnement pédagogique adapté à chaque stagiaire.</li>
    <li>Assurer un suivi individuel tout au long de la formation (entretien de positionnement, point régulier, entretien de bilan).</li>
    <li>Préparer et organiser les évaluations (CCF, examens, certifications professionnelles).</li>
  </ul>

  <p class="sanctions-intro">En cas de non-respect des engagements (absentéisme, retards répétés, comportement inadapté, non-respect du règlement intérieur…), les mesures suivantes peuvent être prises après avertissements oraux ou écrits :</p>
  <ul class="sanctions">
    <li>Entretien individuel de recadrage.</li>
    <li>Avertissement écrit officiel.</li>
    <li>Exclusion temporaire ou définitive de la formation après concertation.</li>
    <li>Signalement à l'organisme financeur à chaque manquement au présent contrat.</li>
  </ul>

  <p class="effet-contrat">Ce contrat prend effet à compter du premier jour de formation et est valable jusqu'à la fin de celle-ci. Il constitue un engagement moral visant à garantir un climat propice à l'apprentissage.</p>

  <div class="signatures-block">
    <div>
      <div class="sig-label">Signature du stagiaire :</div>
      <div class="sig-mention">Fait précéder de la mention &laquo; Lu et approuvé &raquo;</div>
      <div class="sig-box"></div>
    </div>
    <div>
      <div class="sig-label">Signature du formateur :</div>
      <div class="sig-mention">&nbsp;</div>
      <div class="sig-box"></div>
    </div>
  </div>

</body>
</html>`;

export const CONTRAT_ENGAGEMENT_STAGIAIRE_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
