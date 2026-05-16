/**
 * Template HTML système — Règlement Intérieur.
 *
 * Document **statique** au niveau session/client — seuls les champs organisme
 * varient. Reproduit le PDF Loris `reglement intérieur-mrformation.pdf` :
 * 8 articles (Discipline, Sanctions, Procédure, Hygiène et sécurité, Horaires,
 * Réclamations, Publicité) conformes aux articles L.6352-3/4 et R.6352-1 à 15
 * du Code du travail.
 *
 * Spécificité visuelle vs CGV/RGPD : titre dans une **boîte bordurée
 * orange/marron** (cf style Loris) au lieu du titre centré simple.
 */

export const REGLEMENT_INTERIEUR_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Règlement intérieur</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10pt;
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

  /* Titre dans une boîte bordurée (style Loris) */
  .title-box {
    border: 3px solid #c2410c;
    background: #ffffff;
    padding: 14px 24px;
    margin: 24px 0 24px;
    text-align: center;
  }
  .title-box h1 {
    font-size: 22pt;
    font-weight: 700;
    color: #1f2937;
    margin: 0;
    letter-spacing: 0.5px;
  }

  /* Articles */
  h2.article-title {
    font-size: 11pt;
    font-weight: 700;
    color: #111827;
    margin: 18px 0 6px;
  }

  p { margin: 0 0 8px; text-align: justify; }

  ul.dash {
    list-style: none;
    padding: 0;
    margin: 4px 0 8px 4px;
  }
  ul.dash > li {
    padding: 1px 0 1px 14px;
    position: relative;
  }
  ul.dash > li::before {
    content: "-";
    position: absolute;
    left: 2px;
  }

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
    color: #111827;
    font-weight: 700;
    position: absolute;
    left: 2px;
    top: 2px;
  }

  strong { font-weight: 700; }
  a { color: #1f2937; text-decoration: underline; }
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

  <div class="title-box">
    <h1>Règlement intérieur</h1>
  </div>

  <h2 class="article-title">ARTICLE 1</h2>
  <p>Le présent règlement est établi conformément aux dispositions des articles L.6352-3 et L.6352-4 et R.6352-1 à R.6352-15 du Code du travail. Il s'applique à tous les stagiaires, et ce pour la durée de la formation suivie.</p>

  <h2 class="article-title">ARTICLE 2 / DISCIPLINE</h2>
  <p>Il est formellement interdit aux stagiaires :</p>
  <ul class="dash">
    <li>D'introduire des boissons alcoolisées dans les locaux de l'organisme ;</li>
    <li>De se présenter aux formations en état d'ébriété, et/ou sous l'effet de stupéfiants ;</li>
    <li>De modifier les supports de formation ;</li>
    <li>D'emporter tout support documentaire ou de formation sans autorisation explicite du Responsable pédagogique ;</li>
    <li>D'utiliser leurs téléphones portables durant les sessions.</li>
  </ul>

  <h2 class="article-title">ARTICLE 3 / SANCTIONS</h2>
  <p>Tout agissement considéré comme fautif par la direction de l'organisme de formation pourra, en fonction de sa nature et de sa gravité, faire l'objet de l'une ou l'autre des sanctions ci-après par ordre croissant d'importance :</p>
  <ul class="dash">
    <li>Avertissement écrit par le Directeur de l'organisme de formation ;</li>
    <li>Exclusion définitive de la formation</li>
  </ul>

  <h2 class="article-title">ARTICLE 4 / ENTRETIEN PREALABLE A UNE SANCTION ET PROCEDURE</h2>
  <p>Aucune sanction ne peut être infligée au stagiaire sans que celui-ci ne soit informé dans le même temps et par écrit des griefs retenus contre lui.</p>
  <p>Lorsque l'organisme de formation envisage une prise de sanction, il convoque le stagiaire par lettre recommandée avec accusé de réception ou remise à l'intéressé contre décharge en lui indiquant l'objet de la convocation, la date, l'heure et le lieu de l'entretien, sauf si la sanction envisagée n'a pas d'incidence sur la présence du stagiaire pour la suite de la formation.</p>
  <p>Au cours de l'entretien, le stagiaire a la possibilité de se faire assister par une personne de son choix, stagiaire ou salarié de l'organisme de formation. La convocation mentionnée à l'article précédent fait état de cette faculté.</p>
  <p>Lors de l'entretien, le motif de la sanction envisagée est indiqué au stagiaire : celui-ci a alors la possibilité de donner toute explication ou justification des faits qui lui sont reprochés.</p>
  <p>Lorsqu'une mesure conservatoire d'exclusion à effet immédiat est considérée comme indispensable par l'organisme de formation, aucune sanction définitive relative à l'agissement fautif à l'origine de cette exclusion ne peut être prise sans que le stagiaire n'ait été au préalable informé des griefs retenus contre lui et, éventuellement, qu'il ait été convoqué à un entretien et ait eu la possibilité de s'expliquer devant une Commission de discipline.</p>
  <p>La sanction ne peut intervenir moins d'un jour franc ni plus de 15 jours après l'entretien où, le cas échéant, après avis de la Commission de discipline.</p>
  <p>Elle fait l'objet d'une notification écrite et motivée au stagiaire sous forme lettre recommandée, ou d'une lettre remise contre décharge. L'organisme de formation informe concomitamment l'employeur, et éventuellement l'organisme paritaire prenant à sa charge les frais de formation, de la sanction prise.</p>

  <h2 class="article-title">ARTICLE 5 / HYGIENE ET SECURITE</h2>
  <p>La prévention des risques d'accidents et de maladies est impérative et exige de chacun le respect total de toutes les prescriptions applicables en matière d'hygiène et de sécurité. A cet effet, les consignes générales et particulières de sécurité en vigueur dans l'organisme, lorsqu'elles existent, doivent être strictement respectées sous peine de sanctions disciplinaires.</p>

  <h2 class="article-title">ARTICLE 6 / Horaires des formations – Absence / retard</h2>
  <p>Les horaires de stage sont fixés par l'organisme de formation et portés à la connaissance des stagiaires sur la convocation à la formation.</p>
  <p>Les stagiaires sont tenus de respecter scrupuleusement les horaires qui leur sont communiqués sous peine de l'application des dispositions suivantes :</p>
  <ul class="bullets">
    <li>en cas d'absence ou de retard, les stagiaires doivent avertir l'organisme de formation par téléphone au [%Téléphone de l'organisme%] ou sur l'adresse [%Email de l'organisme%] et s'en justifier. Par ailleurs, les stagiaires ne peuvent s'absenter pendant les heures de formation, sauf circonstances exceptionnelles validées par le directeur du centre de formation.</li>
    <li>lorsque les stagiaires sont des salariés en formation dans le cadre du plan de formation, l'organisme de formation informe préalablement l'employeur de ces absences.</li>
    <li>Les manquements non justifiés à l'obligation d'assiduité déterminée dans les conditions prévues au 2° de l'article R. 6341-13 par des circonstances particulières constitue une faute passible de sanctions disciplinaires.</li>
    <li>en outre, pour les stagiaires demandeurs d'emploi rémunérés par l'État ou une région, les absences non justifiées entraîneront, en application de l'article R 6341-45 du Code du Travail, une retenue de rémunération proportionnelle à la durée des dites absences.</li>
  </ul>

  <h2 class="article-title">ARTICLE 7 / Réclamations</h2>
  <p>Les stagiaires, les employeurs font part de leurs réclamations au Référent Pédagogique qui leur accorde une attention particulière. La confidentialité des échanges est assurée.</p>
  <p>Les stagiaires sont reçus sur place à leur demande par le Référent Pédagogique, aux pauses, avant/après les horaires de formation, ou sur rendez-vous au [%Téléphone de l'organisme%] ou sur l'adresse [%Email de l'organisme%].</p>
  <p>Les employeurs peuvent communiquer leurs réclamations par téléphone, ou courriel, ou sur rendez-vous, au [%Téléphone de l'organisme%] ou sur l'adresse [%Email de l'organisme%].</p>
  <p>Après connaissance des réclamations, les mesures correctives appropriées sont mises en œuvre par le Référent Pédagogique.</p>

  <h2 class="article-title">ARTICLE 8 / Publicité du Règlement Intérieur</h2>
  <p>Un exemplaire du présent règlement est remis à chaque stagiaire (avant toute inscription définitive).</p>

</body>
</html>`;

/**
 * Footer Puppeteer — identique aux autres docs (CGV, RGPD, convention, émargement).
 */
export const REGLEMENT_INTERIEUR_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
