/**
 * Template HTML système — Conditions Générales de Vente (CGV).
 *
 * Document **statique** au niveau formation/session/client — la seule variable
 * dynamique est l'organisme (nom, SIRET, NDA, adresse). Reproduit fidèlement
 * le PDF de référence Loris (`~/Downloads/CGV-mrformation.pdf`) : 17 articles
 * de boilerplate juridique français.
 *
 * Utilisé par :
 * - `/admin/test-convention` (mode mock pour valider le rendu)
 * - TabConventionDocs (bouton "Télécharger CGV" — Lot D)
 * - Espace client + espace apprenant (téléchargement direct)
 *
 * Format placeholders : `[%xxx%]` (cf ALIAS_TO_VARIABLE_KEY).
 */

export const CGV_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Conditions Générales de Vente</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.5;
    color: #1f2937;
    margin: 0;
  }

  /* Header organisme (page 1) */
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

  /* Titre */
  h1.title {
    font-size: 13pt;
    font-weight: 700;
    color: #111827;
    text-align: center;
    margin: 24px 0 18px;
  }

  /* Section et article headers */
  h2.section-label {
    font-size: 10pt;
    font-weight: 700;
    color: #111827;
    margin: 14px 0 4px;
  }
  h3.article-title {
    font-size: 9.5pt;
    font-weight: 700;
    color: #111827;
    margin: 12px 0 4px;
  }

  p { margin: 0 0 6px; text-align: justify; }
  ul { margin: 4px 0 6px 4px; padding: 0; list-style: none; }
  ul li {
    padding: 1px 0 1px 14px;
    position: relative;
  }
  ul li::before {
    content: "-";
    position: absolute;
    left: 2px;
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

  <h1 class="title">Conditions Générales de Vente</h1>

  <h2 class="section-label">Définitions</h2>
  <p><strong>Client :</strong> co-contractant de [%Nom de l'organisme%]</p>
  <p><strong>Contrat :</strong> convention de formation professionnelle conclue entre [%Nom de l'organisme%] et le Client. Cette convention peut prendre la forme d'un contrat en bonne et due forme, d'un bon de commande émis par le Client et validé par [%Nom de l'organisme%] ou une facture établie pour la réalisation des actions de formation professionnelle.</p>
  <p><strong>Formation interentreprises :</strong> Formation réalisée dans les locaux de [%Nom de l'organisme%] ou dans des locaux mis à sa disposition par tout tiers et/ou à distance.</p>
  <p><strong>Formation intra-entreprise :</strong> Formation réalisée sur mesure pour le compte du Client, réalisée dans les locaux du Client, de tout tiers et/ou à distance.</p>

  <h3 class="article-title">1. Objet et champ d'application</h3>
  <p>Tout Contrat implique l'acceptation sans réserve par le Client et son adhésion pleine et entière aux présentes Conditions Générales de Vente qui prévalent sur tout autre document du Client, et notamment sur toutes conditions générales d'achat. Aucune dérogation aux présentes Conditions Générales n'est opposable à [%Nom de l'organisme%] si elle n'a pas été expressément acceptée par écrit par celle-ci.</p>

  <h3 class="article-title">2. Documents contractuels</h3>
  <p>Le Contrat précisera l'intitulé de la formation, sa nature, sa durée, ses effectifs, les modalités de son déroulement et la sanction de la formation ainsi que son prix et les contributions financières éventuelles de personnes publiques. Tout Contrat sera établi selon les dispositions légales et réglementaires en vigueur et plus précisément suivant les articles L6353-1 et L6353-2 du Code du travail.</p>

  <h3 class="article-title">3. Report / annulation d'une formation par [%Nom de l'organisme%]</h3>
  <p>[%Nom de l'organisme%] se réserve la possibilité d'annuler ou de reporter des formations planifiées, sans indemnités, sous réserve d'en informer le Client avec un préavis raisonnable.</p>

  <h3 class="article-title">4. Annulation d'une formation par le Client</h3>
  <p>Toute formation ou cycle commencé est dû en totalité, sauf accord contraire exprès de [%Nom de l'organisme%]. Toute annulation d'une formation à l'initiative du Client devra être communiquée par écrit dans les conditions qui suivent :</p>
  <p><strong>- Pour les formations Inter et intra entreprises (hors Cycles et Parcours) :</strong></p>
  <p>La demande devra être communiquée au moins quinze (10) jours calendaires avant le début de la formation. A défaut, 100% du montant de la formation restera immédiatement exigible à titre d'indemnité forfaitaire.</p>
  <p><strong>- Pour les Cycles et Parcours :</strong></p>
  <p>La demande devra être communiquée au moins quinze (15) jours calendaires avant le début de la formation. A défaut, 50% du montant de la formation restera immédiatement exigible à titre d'indemnité forfaitaire.</p>

  <h3 class="article-title">5. Replacement d'un participant</h3>
  <p>Quel que soit le type de la formation, sur demande écrite avant le début de la formation, le Client a la possibilité de remplacer un participant sans facturation supplémentaire.</p>

  <h3 class="article-title">6. Dématérialisation des supports</h3>
  <p>Dans le cadre d'un engagement environnemental, toute la documentation relative à la formation est remise sur des supports dématérialisés.</p>

  <h3 class="article-title">7. Refus de former</h3>
  <p>Dans le cas où un Contrat serait conclu entre le Client et [%Nom de l'organisme%] sans avoir procédé au paiement de la (des) formation(s) précédente(s), [%Nom de l'organisme%] pourra, sans autre motif et sans engager sa responsabilité, refuser d'honorer le Contrat et de délivrer les formations concernées, sans que le Client puisse prétendre à une quelconque indemnité, pour quelque raison que ce soit.</p>

  <h3 class="article-title">8. Prix et règlements</h3>
  <p>Les prix couvrent les frais pédagogiques. Les frais de repas, hébergement, transport, etc ne sont pas compris dans le prix des formations. Ils restent à la charge du client ou seront facturés en sus.</p>
  <p>Pour les formations interentreprises les factures sont émises et payables à l'inscription.</p>
  <p>Pour les formations intra-entreprises, un acompte minimum de 50% devra être versé par le Client à la conclusion du Contrat.</p>
  <p>Tous les prix sont indiqués en euros et nets de taxes. S'ils venaient à être soumis à la TVA, les prix seront majorés de la TVA au taux en vigueur au jour de l'émission de la facture correspondante. Dans le cadre d'un engagement environnemental les factures sont transmises par voie dématérialisée et payables à réception par virement aux coordonnées bancaires de [%Nom de l'organisme%], sans escompte pour règlement anticipé. Toute somme non payée à l'échéance donnera lieu au paiement par le Client de pénalités de retard égales au taux d'intérêt légal assorti du taux d'intérêt appliqué par la BCE à son opération de refinancement la plus récente majoré de 10 points de pourcentage.</p>
  <p>Ces pénalités sont exigibles de plein droit, sans mise en demeure préalable, dès le premier jour de retard de paiement par rapport à la date d'exigibilité du paiement.</p>
  <p>En outre, conformément aux dispositions législatives et réglementaires en vigueur, toute somme non payée à l'échéance donnera lieu au paiement par le Client d'une indemnité forfaitaire pour frais de recouvrement d'un montant de quarante euros (40€). Cette indemnité est due de plein droit, sans mise en demeure préalable dès le premier jour de retard de paiement et pour chaque facture impayée à son échéance.</p>

  <h3 class="article-title">9. Règlement par un Opérateur de Compétences</h3>
  <p>Si le Client souhaite que le règlement soit effectué par l'Opérateur de Compétences dont il dépend, il lui appartient :</p>
  <ul>
    <li>de faire une demande de prise en charge avant le début de la formation et de s'assurer de la bonne fin de cette demande ;</li>
    <li>de l'indiquer explicitement sur son bon de commande ;</li>
    <li>de s'assurer de la bonne fin du paiement par l'Opérateur de Compétences qu'il aura désigné.</li>
  </ul>
  <p>Si l'Opérateur de Compétences ne prend en charge que partiellement le coût de la formation, le reliquat sera facturé au Client.</p>
  <p>Si [%Nom de l'organisme%] n'a pas reçu la prise en charge de l'Opérateur de Compétences au 1er jour de la formation, le Client sera facturé de l'intégralité du coût de la formation concernée par ce financement.</p>
  <p>En cas de non-paiement par l'Opérateur de Compétences, pour quelque motif que ce soit, le Client sera redevable de l'intégralité du coût de la formation et sera facturé du montant correspondant.</p>

  <h3 class="article-title">10. Obligations et Responsabilité de [%Nom de l'organisme%]</h3>
  <p>[%Nom de l'organisme%] s'engage à fournir la formation avec diligence et soin raisonnables. S'agissant d'une prestation intellectuelle, [%Nom de l'organisme%] n'est tenu qu'à une obligation de moyens.</p>
  <p>En conséquence, [%Nom de l'organisme%] sera responsable uniquement des dommages directs résultant d'une mauvaise exécution de ses prestations de formation, à l'exclusion de tout dommage immatériel ou indirect consécutifs ou non.</p>
  <p>En toutes hypothèses, la responsabilité globale de [%Nom de l'organisme%], au titre ou à l'occasion de la formation, sera limitée au prix total de la formation.</p>

  <h3 class="article-title">11. Obligations du Client</h3>
  <p>Le Client s'engage à :</p>
  <ul>
    <li>payer le prix de la formation ;</li>
    <li>n'effectuer aucune reproduction de matériel ou documents dont les droits d'auteur appartiennent à [%Nom de l'organisme%], sans l'accord écrit et préalable de ce dernier ; et</li>
    <li>ne pas utiliser de matériel d'enregistrement audio ou vidéo lors des formations, sans l'accord écrit et préalable de [%Nom de l'organisme%].</li>
  </ul>

  <h3 class="article-title">12. Formations en distanciel</h3>
  <p>Les règles ci-dessus s'appliquent aux formations en distanciel. Les participants doivent disposer d'un ordinateur équipé d'une carte son et de hauts parleurs, d'un écran, d'une connexion internet stable, d'un navigateur web, avant la signature de la commande.</p>

  <h3 class="article-title">13. Confidentialité et Propriété Intellectuelle</h3>
  <p>Il est expressément convenu que toute information divulguée par [%Nom de l'organisme%] au titre ou à l'occasion de la formation doit être considérée comme confidentielle (ci-après « Informations ») et ne peut être communiquée à des tiers ou utilisée pour un objet différent de celui de la formation, sans l'accord préalable écrit de [%Nom de l'organisme%]. Le droit de propriété sur toutes les Informations que [%Nom de l'organisme%] divulgue, quel qu'en soit la nature, le support et le mode de communication, dans le cadre ou à l'occasion de la formation, appartient exclusivement à [%Nom de l'organisme%]. En conséquence, le Client s'engage à conserver les Informations en lieu sûr et à y apporter au minimum, les mêmes mesures de protection que celles qu'il applique habituellement à ses propres informations. Le Client se porte fort du respect de ces stipulations de confidentialité et de conservation par les apprenants.</p>
  <p>La divulgation d'Informations par [%Nom de l'organisme%] ne peut en aucun cas être interprétée comme conférant de manière expresse ou implicite un droit quelconque (aux termes d'une licence ou par tout autre moyen) sur les Informations ou autres droits attachés à la propriété intellectuelle et industrielle, propriété littéraire et artistique (copyright), les marques ou le secret des affaires. Le paiement du prix n'opère aucun transfert de droit de propriété intellectuelle sur les Informations.</p>
  <p>Par dérogation, [%Nom de l'organisme%] accorde à l'apprenant, sous réserve des droits des tiers, une licence d'utilisation non exclusive, non-cessible et strictement personnelle du support de formation fourni, et ce quel que soit le support. L'apprenant a le droit d'effectuer une photocopie de ce support pour son usage personnel à des fins d'étude, à condition que la mention des droits d'auteur de [%Nom de l'organisme%] ou toute autre mention de propriété intellectuelle soient reproduites sur chaque copie du support de formation. L'apprenant et le Client n'ont pas le droit, sauf accord préalable de [%Nom de l'organisme%] :</p>
  <ul>
    <li>d'utiliser, copier, modifier, créer une œuvre dérivée et/ou distribuer le support de formation à l'exception de ce qui est prévu aux présentes Conditions Générales ;</li>
    <li>de désassembler, décompiler et/ou traduire le support de formation, sauf dispositions légales contraires et sans possibilité de renonciation contractuelle ;</li>
    <li>de sous licencier, louer et/ou prêter le support de formation ;</li>
    <li>d'utiliser à d'autres fins que la formation le support associé.</li>
  </ul>

  <h3 class="article-title">14. Responsabilité</h3>
  <p>La responsabilité de [%Nom de l'organisme%] ne saurait être engagée dans le cas où des dégradations ou des dommages seraient causés à des tiers, aux locaux et matériels mis à disposition de [%Nom de l'organisme%] mais utilisés par les stagiaires, salariés des entreprises clientes pendant la durée des sessions de formation. Dans le cadre d'un stage réalisé en intra-entreprise, et sauf dispositions particulières, l'entreprise d'accueil se charge de toute la partie logistique (restauration, réservation de la salle de cours, mise à disposition des matériels et équipements pédagogiques, etc.). L'entreprise d'accueil est garante du bon fonctionnement de ses équipements. En cas de défaillance de l'un d'entre eux, elle prendra toutes les dispositions nécessaires pour les remplacer dans un délai compatible avec la poursuite de la session. À défaut, [%Nom de l'organisme%] ne pourra être tenu responsable des dysfonctionnements susceptibles de conduire à l'annulation de la session. Si une annulation intervenait pour ce motif, l'entreprise paiera à [%Nom de l'organisme%] le montant total de la prestation tel que défini contractuellement.</p>

  <h3 class="article-title">15. Protection des données personnelles</h3>
  <p>Dans le cadre de la réalisation des formations, [%Nom de l'organisme%] est amené à collecter des données à caractère personnel. L'accès à ces données est strictement limité aux employés et préposés de [%Nom de l'organisme%], habilités à les traiter en raison de leurs fonctions. Les informations recueillies peuvent être partagées avec des tiers liés par contrat pour l'exécution de tâches sous-traitées nécessaires pour le strict besoin des formations, sans qu'une autorisation du client et/ou stagiaire ne soit nécessaire.</p>
  <p>En outre les personnes concernées disposent sur les données personnelles les concernant d'un droit d'accès, de rectification, d'effacement, de limitation, de portabilité, et d'opposition et peuvent à tout moment révoquer les consentements aux traitements. Les personnes concernées seront susceptibles de faire valoir leurs droits directement auprès de [%Nom de l'organisme%] ou de l'éventuel prestataire ou sous-traitant, qui s'engage à y faire droit dans les délais règlementaires et à en informer par écrit [%Nom de l'organisme%].</p>
  <p>Conformément à l'exigence essentielle de sécurité des données personnelles, [%Nom de l'organisme%] s'engage dans le cadre de l'exécution de ses formations à prendre toutes mesures techniques et organisationnelles utiles afin de préserver la sécurité et la confidentialité des données à caractère personnel et notamment d'empêcher qu'elles ne soient déformées, endommagées, perdues, détournées, corrompues, divulguées, transmises et/ou communiquées à des personnes non autorisées. Par conséquent, [%Nom de l'organisme%] s'engage à :</p>
  <ul>
    <li>Ne traiter les données personnelles que pour le strict besoin des formations et en toute neutralité ;</li>
    <li>Conserver les données personnelles pendant trois (3) ans ou une durée supérieure pour se conformer aux obligations légales, résoudre d'éventuels litiges et faire respecter les engagements contractuels ;</li>
    <li>En cas de sous-traitance, [%Nom de l'organisme%] se porte fort du respect par ses sous-traitants de tous ses engagements en matière de sécurité et de protection des données personnelles ;</li>
    <li>Enfin, dans le cas où les données à caractère personnel seraient amenées à être transférées hors de l'union européenne, il est rappelé que cela ne pourra se faire sans l'accord du Client et/ou de la personne physique concernée.</li>
  </ul>

  <h3 class="article-title">16. Communication</h3>
  <p>Le Client autorise expressément [%Nom de l'organisme%] à mentionner son nom, son logo et à faire mention à titre de références de la conclusion d'un Contrat et de toute opération découlant de son application dans l'ensemble de leurs documents commerciaux.</p>

  <h3 class="article-title">17. Loi applicable et juridiction</h3>
  <p>Les Contrat et tous les rapports entre [%Nom de l'organisme%] et son Client relèvent de la Loi française. Tous litiges qui ne pourraient être réglés à l'amiable dans un délai de soixante (60) jours compté à partir de la date de la première présentation de la lettre recommandée avec accusé de réception, que la partie qui soulève le différend devra avoir adressée à l'autre, seront de la compétence exclusive du tribunal de commerce de Marseille quel que soit le siège du Client, nonobstant pluralité de défendeurs ou appel en garantie.</p>

</body>
</html>`;

/**
 * Footer Puppeteer — répété sur chaque page (résolu via le resolver avant
 * d'être passé à `options.footerTemplate`). Identique aux autres docs.
 */
export const CGV_FOOTER_TEMPLATE = `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 7.5pt; color: #6b7280; font-style: italic; width: 100%; padding: 0 16mm; text-align: center; line-height: 1.4;">
  <div>[%Nom de l'organisme%], [%Adresse de l'organisme%] , Numéro SIRET: [%SIRET de l'organisme%], Numéro de déclaration d'activité: [%NDA de l'organisme%]</div>
  <div>(auprès du préfet de région de: PACA)</div>
  <div style="margin-top: 2px;"><span class="pageNumber"></span></div>
</div>`;
