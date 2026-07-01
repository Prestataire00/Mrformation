/**
 * Template HTML système — Contrat de sous-traitance de formation (version
 * Qualiopi étendue).
 *
 * Document **par (session, formateur)** : 1 contrat = 1 sous-traitant (formateur)
 * d'une session. Distinct de `convention-intervention.ts` (contrat interne MR
 * en 10 articles). Celui-ci est le contrat Qualiopi complet en 8 articles avec
 * clauses engagements qualité, gestion documentaire, contrôle qualité, etc.
 *
 * Placeholders : `[%xxx%]` (cf ALIAS_TO_VARIABLE_KEY dans resolve-variables.ts).
 * Nouvelle variable ajoutée : `[%Liste des stagiaires de la session%]`
 * → `{{liste_apprenants}}` (noms/prénoms des apprenants inscrits).
 */

export const CONTRAT_SOUS_TRAITANCE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Contrat de sous-traitance de formation</title>
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
    margin-bottom: 14px;
    border-bottom: 2px solid #7f1d1d;
    padding-bottom: 10px;
  }
  .header .org-info { flex: 1; padding-right: 12px; }
  .header .org-name {
    font-size: 15pt;
    font-weight: 700;
    color: #111827;
    margin: 0 0 5px;
  }
  .header .org-address {
    font-size: 8pt;
    line-height: 1.5;
    color: #374151;
  }
  .header .logo-cell { width: 120px; text-align: right; }
  .header .logo-cell img { max-width: 120px; max-height: 100px; }

  h1.title {
    font-size: 13pt;
    font-weight: 700;
    color: #7f1d1d;
    text-align: center;
    margin: 18px 0 14px;
    letter-spacing: 0.4px;
  }

  .parties-block {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 10px 12px;
    margin-bottom: 14px;
    background: #f9fafb;
  }
  .parties-block table { width: 100%; border-collapse: collapse; }
  .parties-block td { padding: 2px 4px; vertical-align: top; font-size: 8.5pt; }
  .parties-block td.label {
    font-weight: 700;
    color: #7f1d1d;
    width: 46%;
    white-space: nowrap;
  }
  .parties-block td.value { color: #1f2937; }

  .preambule {
    margin-bottom: 12px;
    padding: 8px 10px;
    border-left: 3px solid #b91c1c;
    background: #fef2f2;
    font-size: 8.5pt;
    font-style: italic;
    line-height: 1.5;
  }
  .preambule-title {
    font-style: normal;
    font-weight: 700;
    color: #7f1d1d;
    margin-bottom: 4px;
    font-size: 9pt;
  }

  h2.article {
    font-size: 9.5pt;
    font-weight: 700;
    color: #7f1d1d;
    margin: 12px 0 4px;
    border-bottom: 1px solid #fee2e2;
    padding-bottom: 2px;
  }

  h3.sub-article {
    font-size: 9pt;
    font-weight: 700;
    color: #374151;
    margin: 8px 0 3px;
  }

  p { margin: 0 0 6px; text-align: justify; font-size: 9pt; }

  ul.bullets {
    list-style: none;
    padding: 0;
    margin: 3px 0 6px 4px;
  }
  ul.bullets > li {
    padding: 1px 0 1px 14px;
    position: relative;
    font-size: 8.5pt;
  }
  ul.bullets > li::before {
    content: "\\2022";
    color: #b91c1c;
    font-weight: 700;
    position: absolute;
    left: 2px;
    top: 1px;
  }

  .signature-block {
    margin-top: 20px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    page-break-inside: avoid;
  }
  .signature-col { font-size: 8.5pt; }
  .signature-col .role {
    font-weight: 700;
    margin: 0 0 3px;
    color: #374151;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 2px;
    font-size: 9pt;
  }
  .signature-col .signatory { margin: 4px 0 6px; font-size: 8.5pt; color: #4b5563; }
  .signature-img { margin-top: 4px; min-height: 80px; }
  .signature-img img { max-width: 200px; max-height: 100px; }

  strong { font-weight: 700; }
</style>
</head>
<body>

  <div class="header">
    <div class="org-info">
      <div class="org-name">[%Nom de l'organisme%]</div>
      <div class="org-address">
        [%Adresse de l'organisme%]<br>
        NDA : [%NDA de l'organisme%] &nbsp;|&nbsp; SIRET : [%SIRET de l'organisme%]
      </div>
    </div>
    <div class="logo-cell">[%Logo de l'organisme%]</div>
  </div>

  <h1 class="title">CONTRAT DE SOUS-TRAITANCE DE FORMATION</h1>

  <div class="parties-block">
    <table>
      <tr>
        <td class="label">Donneur d&rsquo;ordre (OF principal) :</td>
        <td class="value"><strong>[%Nom de l'organisme%]</strong></td>
      </tr>
      <tr>
        <td class="label">Sous-traitant (OF prestataire) :</td>
        <td class="value"><strong>[%Nom du formateur%]</strong></td>
      </tr>
      <tr>
        <td class="label">Formation(s) concern&eacute;e(s) :</td>
        <td class="value">[%Nom de la formation%]</td>
      </tr>
      <tr>
        <td class="label">Date du pr&eacute;sent contrat :</td>
        <td class="value">Du [%Date de début de la formation%] au [%Date de fin de la formation%]</td>
      </tr>
      <tr>
        <td class="label">Stagiaire(s) :</td>
        <td class="value">[%Liste des stagiaires de la session%]</td>
      </tr>
    </table>
  </div>

  <div class="preambule">
    <div class="preambule-title">PR&Eacute;AMBULE</div>
    Le pr&eacute;sent contrat est conclu entre le donneur d&rsquo;ordre, organisme de formation certifi&eacute; Qualiopi,
    et le sous-traitant, prestataire de formation charg&eacute; d&rsquo;assurer tout ou partie des actions de formation
    pour le compte du donneur d&rsquo;ordre. Le donneur d&rsquo;ordre demeure l&rsquo;interlocuteur unique du
    b&eacute;n&eacute;ficiaire et est responsable de la qualit&eacute; globale de la prestation au sens du
    r&eacute;f&eacute;rentiel national Qualiopi (Loi n&deg;2018-771 du 5 septembre 2018 et d&eacute;cret
    n&deg;2019-564 du 6 juin 2019). Le sous-traitant s&rsquo;engage &agrave; respecter l&rsquo;ensemble des
    exigences du r&eacute;f&eacute;rentiel national qualit&eacute; Qualiopi applicables aux organismes de formation,
    notamment les indicateurs 1 &agrave; 32 dans la mesure o&ugrave; ils concernent les prestations r&eacute;alis&eacute;es.
  </div>

  <h2 class="article">ARTICLE 1 &ndash; OBJET DU CONTRAT</h2>
  <p>Le pr&eacute;sent contrat a pour objet de d&eacute;finir les conditions dans lesquelles le sous-traitant assure
  la r&eacute;alisation de prestations de formation pour le compte du donneur d&rsquo;ordre, ainsi que les obligations
  r&eacute;ciproques en mati&egrave;re de qualit&eacute;, de conformit&eacute; r&eacute;glementaire et de gestion
  documentaire. Les formations concern&eacute;es sont pr&eacute;cis&eacute;es en Annexe 1 du pr&eacute;sent contrat
  (intitul&eacute;, dur&eacute;e, modalit&eacute;s, public cible, objectifs).</p>

  <h2 class="article">ARTICLE 2 &ndash; ENGAGEMENTS QUALIT&Eacute; DU SOUS-TRAITANT</h2>

  <h3 class="sub-article">2.1 Respect des r&eacute;f&eacute;rentiels et r&eacute;glementations</h3>
  <p>Le sous-traitant s&rsquo;engage &agrave; respecter et &agrave; d&eacute;montrer la conformit&eacute; &agrave; :</p>
  <ul class="bullets">
    <li>Le r&eacute;f&eacute;rentiel national qualit&eacute; Qualiopi (indicateurs 1 &agrave; 32 applicables) ;</li>
    <li>Les r&eacute;f&eacute;rentiels sp&eacute;cifiques aux formations r&eacute;alis&eacute;es : TOUT CACES, AIPR, SST, HABILITATIONS &Eacute;LECTRIQUES, etc&hellip; ;</li>
    <li>Le Code du travail (Art. L.6351-1 et suivants) relatif aux organismes de formation ;</li>
    <li>Les exigences l&eacute;gales propres &agrave; chaque certification ou habilitation d&eacute;livr&eacute;e ;</li>
    <li>La r&eacute;glementation RGPD pour le traitement des donn&eacute;es des stagiaires.</li>
  </ul>

  <h3 class="sub-article">2.2 Qualification des formateurs</h3>
  <p>Le sous-traitant garantit que tous les formateurs intervenant dans le cadre de ce contrat :</p>
  <ul class="bullets">
    <li>Poss&egrave;dent les qualifications, certifications et habilitations requises (ex. : formateur certifi&eacute; AIPR, formateur habilit&eacute; CACES&hellip;) ;</li>
    <li>Disposent d&rsquo;une exp&eacute;rience professionnelle en lien avec les contenus enseign&eacute;s ;</li>
    <li>Font l&rsquo;objet d&rsquo;un suivi et d&rsquo;une &eacute;valuation r&eacute;guli&egrave;re par le sous-traitant ;</li>
    <li>Sont couverts par une assurance responsabilit&eacute; civile professionnelle en cours de validit&eacute;.</li>
  </ul>
  <p>Le sous-traitant s&rsquo;engage &agrave; communiquer au donneur d&rsquo;ordre, sur demande, les CV, dipl&ocirc;mes,
  certifications et habilitations des formateurs mobilis&eacute;s.</p>

  <h3 class="sub-article">2.3 Plateaux techniques et &eacute;quipements</h3>
  <p>Le sous-traitant certifie que les plateaux techniques et &eacute;quipements utilis&eacute;s pour les formations :</p>
  <ul class="bullets">
    <li>Sont conformes aux normes et r&eacute;f&eacute;rentiels en vigueur (notamment pour les CACES) ;</li>
    <li>Font l&rsquo;objet de v&eacute;rifications p&eacute;riodiques document&eacute;es (registres de maintenance, VGP, certificats de conformit&eacute;) ;</li>
    <li>Sont adapt&eacute;s aux objectifs p&eacute;dagogiques et au nombre de stagiaires accueillis ;</li>
    <li>Respectent les r&egrave;gles d&rsquo;hygi&egrave;ne, de s&eacute;curit&eacute; et d&rsquo;accessibilit&eacute; applicables.</li>
  </ul>
  <p>Tout changement de site ou d&rsquo;&eacute;quipement doit &ecirc;tre signal&eacute; au donneur d&rsquo;ordre au
  minimum 15 jours avant la formation concern&eacute;e, accompagn&eacute; des justificatifs de conformit&eacute;.</p>

  <h3 class="sub-article">2.4 Positionnement et &eacute;valuation des acquis &agrave; l&rsquo;entr&eacute;e</h3>
  <p>Conform&eacute;ment &agrave; l&rsquo;indicateur 8 du r&eacute;f&eacute;rentiel Qualiopi, le sous-traitant s&rsquo;engage &agrave; :</p>
  <ul class="bullets">
    <li>Mettre en &oelig;uvre une proc&eacute;dure formalis&eacute;e de positionnement et d&rsquo;&eacute;valuation des acquis
    pour CHAQUE stagiaire, au d&eacute;but et &agrave; la fin de toute formation ;</li>
    <li>Adapter le parcours de formation en fonction des r&eacute;sultats du positionnement ;</li>
    <li>Transmettre les fiches de positionnement compl&eacute;t&eacute;es et sign&eacute;es au donneur d&rsquo;ordre
    dans les d&eacute;lais d&eacute;finis &agrave; l&rsquo;Article 4.</li>
  </ul>

  <h3 class="sub-article">2.5 Suivi de l&rsquo;ex&eacute;cution et &eacute;valuation</h3>
  <ul class="bullets">
    <li>&Eacute;valuer les acquis en cours et en fin de formation (&eacute;valuations formatives et sommatives) ;</li>
    <li>Recueillir les appr&eacute;ciations des stagiaires &agrave; l&rsquo;issue de chaque session (questionnaire de satisfaction) ;</li>
    <li>Informer sans d&eacute;lai le donneur d&rsquo;ordre de toute difficult&eacute; ou incident survenu pendant la formation.</li>
  </ul>

  <h2 class="article">ARTICLE 3 &ndash; OBLIGATIONS DU DONNEUR D&rsquo;ORDRE</h2>
  <p>Le donneur d&rsquo;ordre s&rsquo;engage &agrave; :</p>
  <ul class="bullets">
    <li>Transmettre uniquement les informations strictement n&eacute;cessaires &agrave; la gestion administrative
    des stagiaires : nom, pr&eacute;nom. De v&eacute;rifier le cas &eacute;ch&eacute;ant l&rsquo;atteinte des
    pr&eacute;requis par les b&eacute;n&eacute;ficiaires dans le cas de formations n&eacute;cessitant des
    pr&eacute;requis sp&eacute;cifiques. Les &eacute;l&eacute;ments seront tenus &agrave; disposition du
    sous-traitant sur simple demande ;</li>
    <li>S&rsquo;assurer de la bonne cat&eacute;gorie de CACES ;</li>
    <li>Informer le sous-traitant de toute &eacute;volution administrative ou r&eacute;glementaire pouvant
    impacter la formation.</li>
  </ul>

  <h2 class="article">ARTICLE 4 &ndash; GESTION DOCUMENTAIRE ET TRA&Ccedil;ABILIT&Eacute;</h2>
  <p>La gestion documentaire est un &eacute;l&eacute;ment central de la conformit&eacute; Qualiopi. Elle fait l&rsquo;objet
  d&rsquo;une proc&eacute;dure d&eacute;taill&eacute;e en Annexe 3. Les obligations suivantes s&rsquo;appliquent :</p>

  <h3 class="sub-article">4.1 Documents fournis par le donneur d&rsquo;ordre au sous-traitant</h3>
  <ul class="bullets">
    <li>La pr&eacute;sente convention r&eacute;capitulant tous les points cl&eacute;s de la formation ainsi que le programme de formation ;</li>
    <li>Feuille d&rsquo;&eacute;margement pr&eacute;-remplie ;</li>
    <li>Questionnaire de satisfaction stagiaire ;</li>
    <li>Synth&egrave;se p&eacute;dagogique d&eacute;mat&eacute;rialis&eacute;e.</li>
  </ul>

  <h3 class="sub-article">4.2 Documents compl&eacute;t&eacute;s par l&rsquo;ensemble des participants fournis par le sous-traitant au donneur d&rsquo;ordre</h3>
  <ul class="bullets">
    <li>La pr&eacute;sente convention sign&eacute;e &eacute;lectroniquement ;</li>
    <li>Feuille d&rsquo;&eacute;margement sign&eacute;e par le stagiaire et le formateur ;</li>
    <li>Questionnaire de satisfaction stagiaire ;</li>
    <li>Fiches de positionnement compl&eacute;t&eacute;es et sign&eacute;es ;</li>
    <li>Copie des &eacute;valuations r&eacute;alis&eacute;es ou r&eacute;sultat des &eacute;valuations avec d&eacute;tail
    des &eacute;valuations r&eacute;alis&eacute;es et m&eacute;thode d&rsquo;&eacute;valuation ;</li>
    <li>Certificat/attestation de r&eacute;ussite ou de niveau valid&eacute; pour les formations le n&eacute;cessitant
    (voir d&eacute;tail mentionn&eacute; sur le programme de formation annex&eacute;) ;</li>
    <li>R&eacute;capitulatif des livrables transmis aux stagiaires et sous quel format pour appropriation de la formation ;</li>
    <li>Synth&egrave;se p&eacute;dagogique d&eacute;mat&eacute;rialis&eacute;e.</li>
  </ul>

  <h2 class="article">ARTICLE 5 &ndash; CONTR&Ocirc;LE QUALIT&Eacute; ET SUIVI</h2>
  <p>Le donneur d&rsquo;ordre r&eacute;alisera :</p>
  <ul class="bullets">
    <li>Un audit annuel des pratiques du sous-traitant (sur site ou sur pi&egrave;ces) ;</li>
    <li>Des visites d&rsquo;observation en salle de formation, apr&egrave;s accord pr&eacute;alable ;</li>
    <li>Une revue semestrielle des dossiers documentaires transmis.</li>
  </ul>
  <p>En cas de manquement constat&eacute;, un plan d&rsquo;actions correctives sera demand&eacute; par &eacute;crit
  au sous-traitant dans un d&eacute;lai de 15 jours.</p>

  <h2 class="article">ARTICLE 6 &ndash; CONDITIONS FINANCI&Egrave;RES</h2>
  <p>Les conditions tarifaires applicables sont d&eacute;finies dans la convention envoy&eacute;e par le sous-traitant.
  Le paiement des prestations est conditionn&eacute; &agrave; la r&eacute;ception compl&egrave;te de l&rsquo;ensemble
  des documents list&eacute;s &agrave; l&rsquo;Article 4.2 ainsi qu&rsquo;&agrave; leur conformit&eacute;, tout en
  respectant les d&eacute;lais demand&eacute;s par le sous-traitant.</p>

  <h2 class="article">ARTICLE 7 &ndash; CONFIDENTIALIT&Eacute; ET PROTECTION DES DONN&Eacute;ES</h2>
  <p>Le sous-traitant s&rsquo;engage &agrave; traiter les donn&eacute;es personnelles des stagiaires conform&eacute;ment
  au RGPD (R&egrave;glement UE 2016/679) et &agrave; ne pas les utiliser &agrave; d&rsquo;autres fins que l&rsquo;ex&eacute;cution
  des formations pr&eacute;vues au pr&eacute;sent contrat. Toute violation de donn&eacute;es doit &ecirc;tre notifi&eacute;e
  au donneur d&rsquo;ordre dans les 24 heures suivant sa d&eacute;couverte. Les informations &eacute;chang&eacute;es
  dans le cadre de ce contrat sont confidentielles et ne peuvent &ecirc;tre divulgu&eacute;es &agrave; des tiers sans
  accord &eacute;crit pr&eacute;alable.</p>

  <h2 class="article">ARTICLE 8 &ndash; RESPONSABILIT&Eacute; ET ASSURANCES</h2>
  <p>Le sous-traitant demeure seul responsable des dommages caus&eacute;s aux stagiaires ou aux tiers du fait de
  l&rsquo;ex&eacute;cution des formations. Il s&rsquo;engage &agrave; maintenir une assurance responsabilit&eacute;
  civile professionnelle couvrant l&rsquo;ensemble de ses activit&eacute;s pour la dur&eacute;e du pr&eacute;sent
  contrat, et &agrave; en fournir une attestation annuelle. Le donneur d&rsquo;ordre ne saurait &ecirc;tre tenu
  responsable des actes ou omissions du sous-traitant dans le cadre de l&rsquo;ex&eacute;cution des formations.</p>

  <div class="signature-block">
    <div class="signature-col">
      <div class="role">Pour le donneur d&rsquo;ordre</div>
      <div class="signatory">[%Nom de l'organisme%]</div>
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

export const CONTRAT_SOUS_TRAITANCE_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] &mdash; SIRET : [%SIRET de l'organisme%] &mdash; NDA : [%NDA de l'organisme%]</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
