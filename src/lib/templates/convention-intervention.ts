/**
 * Template HTML système — Contrat de sous-traitance de formation (convention
 * d'intervention formateur).
 *
 * Document **par (session, formateur)** : 1 contrat = 1 formateur d'une
 * session. Si la session a N formateurs, on génère N contrats.
 *
 * Reproduit le PDF Loris `contrat de sous-traitance de formation-mrformation.pdf`
 * avec 10 articles + bloc signature dual.
 *
 * Format placeholders : `[%xxx%]` (cf ALIAS_TO_VARIABLE_KEY).
 */

export const CONVENTION_INTERVENTION_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Contrat de sous-traitance de formation</title>
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
    margin: 24px 0 18px;
    letter-spacing: 0.5px;
  }

  h2.article {
    font-size: 10.5pt;
    font-weight: 700;
    color: #7f1d1d;
    margin: 16px 0 6px;
  }

  p { margin: 0 0 8px; text-align: justify; }

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
    color: #b91c1c;
    font-weight: 700;
    position: absolute;
    left: 2px;
    top: 2px;
  }

  /* Bloc signature dual */
  .signature-block {
    margin-top: 28px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    page-break-inside: avoid;
  }
  .signature-col { font-size: 9pt; }
  .signature-col .role { font-weight: 700; margin: 0 0 2px; }
  .signature-col .signatory { margin: 0 0 6px; }
  .signature-img { margin-top: 6px; min-height: 80px; }
  .signature-img img { max-width: 220px; max-height: 100px; }

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

  <h1 class="title">CONTRAT DE SOUS-TRAITANCE DE FORMATION</h1>

  <p>Entre l'organisme de formation: <strong>[%Nom de l'organisme%]</strong> (ci-après nommé le donneur d'ordre)</p>
  <p>Situé: [%Adresse de l'organisme%]</p>
  <p>Déclaration d'activité n° [%NDA de l'organisme%], Numéro SIRET: N° [%SIRET de l'organisme%]<br>
  Représenté par: [%Nom du représentant de l'organisme%]</p>

  <p>Et le formateur: <strong>[%Nom du formateur%]</strong> (ci-après nommé le sous traitant)</p>
  <p>Situé: [%Adresse du formateur%]</p>
  <p>Déclaration d'activité n° [%NDA du formateur%], Numéro SIRET: N° [%SIRET du formateur%]</p>

  <h2 class="article">ARTICLE 1 - OBJET ET NATURE DE LA FORMATION</h2>
  <p>Le présent contrat est conclu dans le cadre d'une prestation de formation réalisée par le sous-traitant au bénéfice du donneur d'ordre.</p>
  <p><strong>Intitulé de la formation :</strong> [%Nom de la formation%]</p>
  <p><strong>Durée de la formation :</strong> [%Durée de la formation%] heure(s)</p>
  <p><strong>Lieu de la formation :</strong> [%Lieu de la formation%], [%Adresse de la formation%]</p>
  <p><strong>Dates de la formation :</strong> Du [%Date de début de la formation%] au [%Date de fin de la formation%]</p>
  <p><strong>Programme de formation :</strong> sur votre extranet, considéré accepté en signant ce contrat : [%Lien de l'extranet du formateur%]</p>

  <h2 class="article">ARTICLE 2 - DURÉE DU CONTRAT</h2>
  <p>Le présent contrat est strictement limité à la prestation de formation visée à l'article 1. Il cesse de plein droit à son terme.</p>

  <h2 class="article">ARTICLE 3 - OBLIGATIONS DU SOUS-TRAITANT</h2>
  <p>Le sous-traitant s'engage à :</p>
  <ul class="bullets">
    <li>Connaître, et appliquer scrupuleusement la charte de sous traitant ;</li>
    <li>Connaître, et appliquer scrupuleusement la fiche de poste du formateur ;</li>
    <li>Communiquer au donneur d'ordre une copie de son extrait K-bis ;</li>
    <li>Communiquer au donneur d'ordre ses besoins en matériel au moins 10 jours avant ;</li>
    <li>Faire signer l'émargement à chaque session l'apprenant ;</li>
    <li>Animer la formation dans le respect des objectifs fixés par le donneur d'ordre ;</li>
    <li>Assurer un test de positionnement en amont de la formation ;</li>
    <li>Assurer l'évaluation des stagiaires à l'issue de l'action de formation ;</li>
    <li>Animer personnellement la formation ;</li>
    <li>Envoyer en fin de formation tous les documents nécessaire au suivi pédagogique de la formation.</li>
  </ul>

  <h2 class="article">ARTICLE 4 - OBLIGATIONS DU DONNEUR D'ORDRE</h2>
  <p>Le donneur d'ordre s'engage à :</p>
  <ul class="bullets">
    <li>Prendre en charge la gestion administrative et logistique de la formation ;</li>
    <li>Transmettre sur demande au sous-traitant une copie des feuilles de présence signées par l'apprenant ;</li>
    <li>Transmettre sur demande au sous-traitant une copie des questionnaires de satisfaction remplis par les stagiaires à l'issue de la formation.</li>
  </ul>

  <h2 class="article">ARTICLE 5 - MODALITÉS FINANCIÈRE</h2>
  <p>La rémunération sera versée lorsque la formation sera terminée après l'envoi de tous les documents nécessaires, payée à 30 jours. Soit un total de <strong>[%Coût total du formateur (HT)%] € HT</strong> pour l'intégralité de la prestation.</p>

  <h2 class="article">ARTICLE 6 – CONDITIONS D'ANNULATION</h2>
  <p>En cas de renoncement de la prestation imputable à l'intervenant, sans motif justifié (production d'un arrêt maladie) à moins de 8 jours avant le début du 1er jour de l'action, celui-ci s'engage à verser à [%Nom de l'organisme%] 15 % de la prestation au titre de dédommagement.</p>

  <h2 class="article">ARTICLE 7 – CLAUSES PARTICULIERES</h2>
  <p>Le prestataire s'engage à respecter la confidentialité de cet accord. Les parties déclarent qu'elles sont indépendantes entre elles et que le présent contrat ne créé entre elles aucun lien de subordination ou association autre que celle relative à son objet. Le prestataire a été sélectionné par [%Nom de l'organisme%] en raison de sa compétence reconnue sur le sujet. Il demeure maître et responsable du contenu de ses prestations tant écrites qu'orales. Le prestataire déclare avoir souscrit une police d'assurance Responsabilité Civile Professionnelle garantissant [%Nom de l'organisme%] et les tiers de tout dommage survenant de son fait dans le cadre de l'exécution de ses prestations.</p>

  <h2 class="article">ARTICLE 8 - NON-CONCURRENCE</h2>
  <p>Le prestataire s'engage à ne pas prospecter ou avoir des contacts commerciaux avec les clients de [%Nom de l'organisme%] chez lesquels il est intervenu, pour son propre compte ou celui d'un autre organisme, pendant une durée de 2 ans à compter de la date de fin de la dernière formation.</p>

  <h2 class="article">ARTICLE 9 - CONTESTATIONS</h2>
  <p>Toute contestation relative à l'interprétation et/ou l'exécution du présent contrat sera réglée amiablement par les parties avec l'aide éventuelle de leurs conseils respectifs.</p>
  <p>Dans le cas où aucun accord n'aurait pu être trouvé dans un délai de deux mois à compter du jour où les parties se seront réunies ou auront tenté de se réunir par convocation dûment notifiée par lettre recommandée avec avis de réception pour régler amiablement leur différend, celui-ci pourra être déféré devant les Tribunaux de Marseille à l'initiative de la partie la plus diligente.</p>
  <p>Ce contrat est établi en 2 exemplaires, dont l'un est à nous retourner dûment signé et précédé de la mention « Lu et approuvé » - « Bon pour accord ». Il est rappelé au contractant qu'il doit être en règle avec les dispositions de l'article D8222-5 du code du travail aux termes duquel il doit fournir tous les 6 mois à [%Nom de l'organisme%] les documents attestant du paiement de ses cotisations sociales et fiscales (contrats d'un montant supérieur à 5 000€). Le contractant certifie sur l'honneur, compte tenu d'emplois éventuels dans différents établissements, être en règle vis-à-vis de la réglementation sur la durée journalière et hebdomadaire du travail.</p>

  <h2 class="article">ARTICLE 10 - DISPOSITIONS DIVERSES</h2>
  <ul class="bullets">
    <li>Le présent contrat ne crée entre les parties aucun lien de subordination, le sous-traitant demeurant libre et responsable du contenu de la formation ;</li>
    <li>Le sous-traitant dispose d'une propriété intellectuelle et/ou artistique sur le contenu de sa formation. Le donneur d'ordre s'engage à ne pas reproduire ni diffuser ce contenu sans l'accord du sous-traitant.</li>
  </ul>

  <div class="signature-block">
    <div class="signature-col">
      <div class="role">Pour l'organisme de formation,</div>
      <div class="signatory">[%Nom de l'organisme%],<br>[%Nom du représentant de l'organisme%]</div>
      <div class="signature-img">[%Cachet de l'organisme%]</div>
    </div>
    <div class="signature-col">
      <div class="role">Pour le sous-traitant</div>
      <div class="signatory">[%Nom du formateur%]</div>
      <div class="signature-img">[%E-signature du Formateur%]</div>
    </div>
  </div>

</body>
</html>`;

export const CONVENTION_INTERVENTION_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
