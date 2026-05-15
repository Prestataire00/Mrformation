/**
 * Template HTML système — Convention de formation entreprise.
 *
 * Reproduit la mise en page du modèle Loris (cf
 * `~/Downloads/convention-entreprise-mrformation.pdf`).
 *
 * Format des placeholders : `[%Libellé en français%]` (style Sellsy/Loris).
 * Cf `src/lib/utils/resolve-variables.ts::ALIAS_TO_VARIABLE_KEY` pour la map
 * complète des libellés supportés.
 *
 * Ce template est utilisé par défaut. Loris peut l'overrider en uploadant un
 * `.docx` via `/admin/documents/import` avec `default_for_doc_type =
 * 'convention_entreprise'`.
 */

export const CONVENTION_ENTREPRISE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Convention de formation entreprise</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    color: #1e293b;
    margin: 0;
  }
  h1 {
    font-size: 16pt;
    font-weight: 700;
    text-align: center;
    margin: 0 0 4px;
  }
  h1 + p.subtitle {
    font-size: 9pt;
    text-align: center;
    color: #64748b;
    margin: 0 0 18px;
    font-style: italic;
  }
  h2 {
    font-size: 12pt;
    font-weight: 600;
    margin: 18px 0 8px;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 4px;
  }
  p { margin: 0 0 8px; }
  .parties { margin-bottom: 12px; }
  .parties strong { display: inline-block; min-width: 0; }
  .between {
    text-align: center;
    margin: 14px 0 6px;
    font-style: italic;
    color: #475569;
  }
  .formation-block {
    background: #f1f5f9;
    padding: 12px 16px;
    border-left: 3px solid #2563EB;
    margin: 12px 0 16px;
    font-size: 11.5pt;
    font-weight: 600;
  }
  .signature-block {
    margin-top: 40px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
  }
  .signature-col {
    border-top: 1px solid #1e293b;
    padding-top: 8px;
  }
  .signature-col h3 {
    font-size: 11pt;
    font-weight: 600;
    margin: 0 0 4px;
  }
  .signature-col p { font-size: 10pt; }
  .signature-img-wrapper { margin-top: 12px; min-height: 60px; }
  .signature-img-wrapper img { max-height: 80px; }
  ul, ol { margin: 0 0 8px 22px; padding: 0; }
  li { margin-bottom: 2px; }
</style>
</head>
<body>
  <h1>Convention de formation professionnelle</h1>
  <p class="subtitle">(Articles L. 6353-1 et L. 6353-2 du code du travail)</p>

  <div class="parties">
    <p><strong>Entre l'organisme de formation :</strong> [%Nom de l'organisme%]<br>
    (ci-après nommé l'organisme de formation)<br>
    Situé : [%Adresse de l'organisme%]</p>

    <p>Déclaration d'activité n° [%NDA de l'organisme%], Numéro SIRET : [%SIRET de l'organisme%]<br>
    Représenté par : [%Nom du représentant de l'organisme%]</p>

    <p class="between">Et</p>

    <p><strong>le bénéficiaire :</strong> [%Nom du client%]<br>
    (ci-après nommé le bénéficiaire)<br>
    Situé : [%Adresse du client%]</p>

    <p>Représenté par : [%Nom du représentant légal du client%]</p>
  </div>

  <p>Est conclue la convention suivante en application des dispositions du livre IX
  du Code du travail portant sur l'organisation de la formation professionnelle continue
  dans le cadre de l'éducation permanente.</p>

  <h2>1. Objet, nature et durée de la formation</h2>
  <p>Le bénéficiaire entend faire participer une partie de son personnel à l'action de
  formation suivante organisée par l'organisme de formation.</p>

  <div class="formation-block">[%Nom de la formation%]</div>

  <p><strong>Type d'action de formation</strong> (art. L6313-1 du code du travail) : [%Type d'action de formation%]</p>
  <p><strong>Diplôme visé par la formation :</strong> [%Type de diplôme décerné%]</p>
  <p><strong>Durée :</strong> [%Durée de la formation%] heure(s)</p>
  <p><strong>Lieu de la formation :</strong> [%Lieu de la formation%]</p>
  <p><strong>Effectifs formés :</strong> [%Nombre d'apprenants du client%]</p>
  <p><strong>Apprenants de la formation :</strong> [%Apprenants du client%]</p>
  <p><strong>Dates de formation :</strong> [%Dates de la formation%]</p>

  <h2>2. Programme de la formation et formateur</h2>
  <p>La description détaillée du programme de formation et du formateur est fournie en annexe.</p>

  <h2>3. Engagement de participation à l'action de formation</h2>
  <p>Le bénéficiaire s'engage à assurer la présence d'un (des) stagiaire(s) aux dates et lieux prévus ci-dessus.</p>
  <p><strong>Liste des stagiaires :</strong> [%Apprenants du client%]</p>

  <h2>4. Prix de la formation</h2>
  <p>En contrepartie de cette action de formation, le bénéficiaire s'acquittera des coûts
  suivants qui couvrent l'intégralité des frais engagés par l'organisme de formation
  pour cette session :</p>
  [%Tableau des coûts du client%]

  <h2>5. Modalités de règlement</h2>
  <p>Le paiement sera dû en totalité à réception d'une facture émise par l'organisme
  de formation à destination du bénéficiaire.</p>

  <h2>6. Moyens pédagogiques et techniques mis en œuvre</h2>
  <p>Voir le programme de formation en annexe détaillant les moyens mis en œuvre pour
  réaliser techniquement l'action, suivre son exécution et apprécier ses résultats.
  Une feuille d'émargement signée par le(s) stagiaire(s) et le formateur, par
  demi-journée de formation, permettra de justifier de la réalisation de la prestation.</p>

  <h2>7. Sanction de la formation</h2>
  <p>En application de l'article L.6353-1 du Code du Travail, une attestation
  mentionnant les objectifs, la nature et la durée de l'action et les résultats
  de l'évaluation des acquis de la formation sera remise au(x) stagiaire(s) à
  l'issue de la formation.</p>

  <h2>8. Non réalisation de la prestation de formation</h2>
  <p>En application de l'article L6354-1 du Code du travail, il est convenu entre
  les signataires de la présente convention, que faute de résiliation totale ou
  partielle de la prestation de formation, l'organisme prestataire doit rembourser
  au cocontractant les sommes indûment perçues de ce fait.</p>

  <h2>9. Dédommagement, réparation ou dédit</h2>
  <p>En cas de renoncement par le bénéficiaire avant le début du programme de formation :</p>
  <ul>
    <li>Dans un délai supérieur à 1 mois avant le début de la formation : 50 % du coût de la formation est dû.</li>
    <li>Dans un délai compris entre 1 mois et 2 semaines avant le début de la formation : 70 % du coût de la formation est dû.</li>
    <li>Dans un délai inférieur à 2 semaines avant le début de la formation : 100 % du coût de la formation est dû.</li>
  </ul>
  <p>Le coût ne pourra faire l'objet d'une demande de remboursement ou de prise en charge par l'OPCA.</p>

  <h2>10. Litiges</h2>
  <p>Si une contestation ou un différend ne peuvent pas être réglés à l'amiable,
  le Tribunal de [%Ville de l'organisme%] sera seul compétent pour régler le litige.</p>

  <p style="margin-top: 24px;">
    Document réalisé en 2 exemplaires à [%Ville de l'organisme%], le [%Date d'aujourd'hui%].
  </p>

  <div class="signature-block">
    <div class="signature-col">
      <h3>Pour l'organisme de formation,</h3>
      <p>[%Nom de l'organisme%],<br>
      [%Nom du représentant de l'organisme%]</p>
      <div class="signature-img-wrapper">[%Signature de l'organisme%]</div>
    </div>
    <div class="signature-col">
      <h3>Pour le bénéficiaire</h3>
      <p>[%Nom du client%],<br>
      [%Nom du représentant légal du client%]</p>
      <div class="signature-img-wrapper">[%E-signature du client%]</div>
    </div>
  </div>
</body>
</html>`;
