/**
 * Template HTML système — Convention de formation entreprise.
 *
 * Reproduit fidèlement la mise en page du modèle Loris MR FORMATION
 * (cf `~/Downloads/convention-entreprise-mrformation.pdf`) :
 * - Header organisme (nom + adresse + logo) sur la 1re page
 * - Titre rouge bordeaux centré
 * - 10 articles numérotés "Article Xer/X :" avec texte légal exact
 * - Article 1 dans une boîte bordurée avec puces rouges
 * - Bloc signature : tampon organisme à gauche, e-signature client à droite
 * - Footer SIRET/NDA injecté via Puppeteer `footerTemplate` (cf route API)
 *
 * Format des placeholders : `[%Libellé en français%]` (style Sellsy/Loris).
 * Cf `src/lib/utils/resolve-variables.ts::ALIAS_TO_VARIABLE_KEY` pour la map.
 *
 * Loris peut overrider en uploadant un `.docx` via `/admin/documents/import`
 * avec `default_for_doc_type = 'convention_entreprise'`.
 */

export const CONVENTION_ENTREPRISE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Convention de formation professionnelle</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.45;
    color: #1f2937;
    margin: 0;
  }

  /* Header organisme (page 1 uniquement) */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
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

  /* Titre central */
  h1.title {
    font-size: 14pt;
    font-weight: 700;
    color: #7f1d1d;
    text-align: center;
    margin: 26px 0 4px;
  }
  p.subtitle {
    font-size: 10pt;
    font-weight: 700;
    color: #7f1d1d;
    text-align: center;
    margin: 0 0 18px;
  }

  /* En-têtes d'article */
  h2 {
    font-size: 10pt;
    font-weight: 700;
    color: #7f1d1d;
    margin: 14px 0 6px;
  }

  p { margin: 0 0 8px; }

  /* Boîte Article 1 avec puces rouges */
  .article-1-box {
    border: 1px solid #9ca3af;
    padding: 10px 16px;
    margin: 4px 0 10px;
  }
  .article-1-box ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .article-1-box li {
    padding: 3px 0 3px 14px;
    position: relative;
  }
  .article-1-box li::before {
    content: "\\2022";
    color: #b91c1c;
    font-weight: 700;
    position: absolute;
    left: 0;
    top: 1px;
  }

  /* Liste à puces standard (Article 8, 9) */
  ul.bullets {
    list-style: none;
    padding: 0;
    margin: 0 0 8px 4px;
  }
  ul.bullets li {
    padding: 2px 0 2px 14px;
    position: relative;
  }
  ul.bullets li::before {
    content: "\\2022";
    color: #b91c1c;
    font-weight: 700;
    position: absolute;
    left: 0;
    top: 1px;
  }

  /* Bloc signature */
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
  .signature-org-img { margin-top: 6px; min-height: 80px; }
  .signature-org-img img { max-width: 220px; max-height: 110px; }

  .e-signature-card {
    margin-top: 6px;
    border: 1px solid #93c5fd;
    background: #eff6ff;
    border-radius: 6px;
    padding: 18px 12px;
    text-align: center;
    color: #1e3a8a;
  }
  .e-signature-card .e-sig-title {
    font-weight: 700;
    font-size: 12pt;
    letter-spacing: 1px;
  }
  .e-signature-card .e-sig-sub {
    font-size: 10pt;
    margin-top: 2px;
    font-weight: 600;
  }
  .e-signature-card .e-sig-note {
    font-size: 8.5pt;
    color: #475569;
    margin-top: 10px;
    font-style: italic;
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

  <h1 class="title">CONVENTION DE FORMATION PROFESSIONNELLE</h1>
  <p class="subtitle">(Articles L.6353-1 et D.6353-1 du Code du travail)</p>

  <p>Entre les soussignés :</p>

  <p>1) <strong>[%Nom de l'organisme%]</strong> enregistré sous le numéro de déclaration d'activité : [%NDA de l'organisme%] auprès de la Direction Régionale de l'Economie, de l'Emploi, du Travail et des Solidarités (DREETS) PACA, Représenté par Monsieur [%Nom du représentant de l'organisme%], en qualité de : Président</p>

  <p>&nbsp;et</p>

  <p>2) <strong>[%Nom du client%], Adresse : [%Adresse du client%], SIRET : [%SIRET du client%]</strong></p>

  <p>Représenté(e) par [%Nom du représentant légal du client%]. Est conclue la convention suivante, en application des dispositions du Livre III de la Sixième partie du Code du travail portant organisation de la formation professionnelle continue.</p>

  <h2>Article 1<sup>er</sup> : Objet de la convention</h2>
  <p>L'organisme nommé ci-dessus organisera l'action de formation suivante :</p>
  <div class="article-1-box">
    <ul>
      <li><strong>Intitulé du stage</strong> : [%Nom de la formation%]</li>
      <li><strong>Type d'action de formation</strong> (article L.6313-1 du Code du travail) : [%Type d'action de formation%]</li>
      <li><strong>Objectifs, modalités et méthodes :</strong> Voir programme en annexe</li>
      <li><strong>Dates :</strong> [%Dates de la formation%]</li>
      <li><strong>Durée :</strong> [%Durée de la formation%] heure(s)</li>
      <li><strong>Lieu :</strong> [%Lieu de la formation%]</li>
    </ul>
  </div>

  <h2>Article 2 : Effectif formé</h2>
  <p><strong>Nombre de participants : [%Nombre d'apprenants du client%]</strong></p>
  <p><strong>NOM Prénom des stagiaires :</strong> [%Apprenants du client%]</p>

  <h2>Article 3 : Dispositions financières</h2>
  <p>Le coût de la formation, objet de la présente convention, s'élève à : <strong>[%Montant HT%]€ soit [%Montant TTC%]€ TTC</strong> (TVA 20% = [%Montant TVA%]€), frais de déplacement de l'intervenant(e) inclus.</p>

  <h2>Article 4 : Modalités de règlement</h2>
  <p>En application de l'article L441-6 du code de commerce, il est convenu entre les signataires de la présente convention, que les sommes dues devront être réglées afin de mois date de facturation. Toute somme, y compris l'acompte, non payée à sa date d'exigibilité pourra produire de plein droit des intérêts de retard équivalents au triple du taux d'intérêt légal de l'année en cours ainsi que le paiement d'une somme forfaitaire de 40 euros due au titre des frais de recouvrement. En contrepartie des sommes reçues, l'organisme de formation s'engage à fournir tout document et pièce de nature à justifier la réalité et la validité des dépenses de formation engagées à ce titre. Dans la mesure où l'organisme de formation édite la présente convention de formation pour l'action commandée, il revient à l'entreprise de vérifier l'imputabilité de celle-ci.</p>

  <h2>Article 5 : Dédit ou abandon</h2>
  <p>Toute formation ou cycle commencé est dû en totalité, sauf accord contraire exprès de [%Nom de l'organisme%]. Toute annulation d'une formation à l'initiative du Client devra être communiquée par écrit dans les conditions qui suivent : Pour les formations Inter et intra entreprises (hors Cycles et Parcours) : La demande devra être communiquée au moins quinze (10) jours calendaires avant le début de la formation. A défaut, un montant forfaitaire restera immédiatement exigible à titre d'indemnité forfaitaire. Pour les Cycles et Parcours : La demande devra être communiquée au moins quinze (15) jours calendaires avant le début de la formation. A défaut, un montant forfaitaire de la formation restera immédiatement exigible à titre d'indemnité forfaitaire.</p>

  <h2>Article 6 : Matériels mis à disposition de l'organisme de formation :</h2>
  <p>Dans le cas de formation en intra entreprise dans le respect des contenus du programme de formation, l'entreprise s'engage à mettre à titre gratuit à la disposition de l'organisme de formation pendant l'intégralité de la durée de l'action de formation : une salle équipée de tables et de chaises en nombre suffisant, un mur de projection. Le matériel spécifique à la formation et matériel stagiaire nécessaire sont précisés sur la convocation à la formation. Dans le cas des formations intra entreprise, l'article sur la sécurité et l'hygiène du règlement intérieur du client s'appliquera, notre livret d'accueil reprenant tous les éléments nécessaires est disponible sur notre site internet.</p>

  <h2>Article 7 : Replacement d'un participant</h2>
  <p>Quel que soit le type de la formation, sur demande écrite avant le début de la formation, le Client a la possibilité de remplacer un participant sans facturation supplémentaire.</p>

  <h2>Article 8 : Règlement par un Opérateur de Compétences</h2>
  <p>Si le Client souhaite que le règlement soit exécuté par l'Opérateur de Compétences dont il dépend, il lui appartient :</p>
  <ul class="bullets">
    <li>de faire une demande de prise en charge avant le début de la formation et de s'assurer de la bonne fin de cette demande ;</li>
    <li>de l'indiquer explicitement sur son bon de commande ;</li>
    <li>de s'assurer de la bonne fin du paiement par l'Opérateur de Compétences qu'il aura désigné.</li>
  </ul>
  <p>Si l'Opérateur de Compétences ne prend en charge que partiellement le coût de la formation, le reliquat sera facturé au Client. Si [%Nom de l'organisme%] n'a pas reçu la prise en charge de l'Opérateur de Compétences au 1er jour de la formation, le Client sera facturé de l'intégralité du coût de la formation concernée par ce financement. En cas de non-paiement par l'Opérateur de Compétences, pour quelque motif que ce soit à la faute du client, le client sera redevable de l'intégralité du coût de la formation et sera facturé du montant correspondant cependant en cas de subrogation de paiement [%Nom de l'organisme%] est responsable de la gestion du paiement de ses factures.</p>

  <h2>Article 9 : Obligations du Client</h2>
  <p>Le Client s'engage à :</p>
  <ul class="bullets">
    <li>payer le prix de la formation ;</li>
    <li>n'effectuer aucune reproduction de matériel ou documents dont les droits d'auteur appartiennent à [%Nom de l'organisme%]., sans l'accord écrit et préalable de ce dernier ; et</li>
    <li>ne pas utiliser de matériel d'enregistrement audio ou vidéo lors des formations, sans l'accord écrit et préalable de [%Nom de l'organisme%].</li>
  </ul>

  <h2>Article 10 : Différends éventuels</h2>
  <p>Si une contestation ou un différend ne peuvent être réglés à l'amiable, le Tribunal de Salon de Provence sera seul compétent pour régler le litige.</p>

  <p style="margin-top: 14px;">Date du terme de la convention : [%Date de fin de la formation%]</p>

  <p>Convention établie en double exemplaires à [%Ville de l'organisme%], le [%Date d'aujourd'hui%]</p>

  <p>La signature de cette convention vaut acceptation du livret d'accueil disponible sur notre site internet.</p>

  <div class="signature-block">
    <div class="signature-col">
      <div class="role">Pour l'organisme de formation,</div>
      <div class="signatory">[%Nom de l'organisme%],<br>[%Nom du représentant de l'organisme%]</div>
      <div class="signature-org-img">[%Signature de l'organisme%]</div>
    </div>
    <div class="signature-col">
      <div class="role">Pour le bénéficiaire</div>
      <div class="signatory">[%Nom du client%],<br>[%Nom du représentant légal du client%]</div>
      <div class="e-signature-card">
        <div class="e-sig-title">E-SIGNATURE</div>
        <div class="e-sig-sub">VisioFormation</div>
        <div class="e-sig-note">(Signature Électronique)</div>
      </div>
    </div>
  </div>

</body>
</html>`;

/**
 * Footer template Puppeteer — appliqué à TOUTES les pages.
 *
 * Doit être résolu via `resolveDocumentVariables(CONVENTION_FOOTER_TEMPLATE, ctx)`
 * avant d'être passé à `options.footerTemplate` du PDFEngine.
 *
 * Note Puppeteer : pas d'héritage CSS depuis le `<body>`, donc tous les styles
 * doivent être inline. `<span class="pageNumber"></span>` et `totalPages` sont
 * remplacés automatiquement par Chrome.
 */
export const CONVENTION_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
