import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DevisLine {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface DevisData {
  reference: string;
  date_creation: string; // YYYY-MM-DD
  date_echeance: string;
  training_start?: string;
  training_end?: string;
  training_title?: string;
  tva: number; // e.g. 20
  effectifs?: number;
  duration?: string;
  notes?: string;
  mention?: string;
  signer_name?: string;
  validity_days?: number;
  lines: DevisLine[];
  // Signature data (after electronic signature)
  signature_data?: string; // SVG string
  signed_at?: string; // ISO date
  signer_ip?: string;
  // Prospect info
  prospect_name: string;
  prospect_address?: string;
  prospect_email?: string;
  prospect_phone?: string;
  prospect_siret?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

function getCompanyInfo(entityName?: string) {
  if (entityName?.toLowerCase().includes("c3v")) {
    return {
      name: "C3V FORMATION",
      address: "24/26 Boulevard Gay Lussac 13014 Marseille",
      email: "contact@c3vformation.fr",
      tel: "0750461245",
      website: "http://www.c3vformation.fr",
      siret: "à compléter",
      nda: "à compléter",
      region: "PACA",
      logo: "/logo-c3v-formation.png",
    };
  }
  return {
    name: "MR FORMATION",
    address: "24/26 Boulevard Gay Lussac 13014 Marseille",
    email: "contact@mrformation.fr",
    tel: "0750461245",
    website: "http://www.mrformation.fr",
    siret: "91311329600036",
    nda: "93132013113",
    region: "PACA",
    logo: "/logo-mr-formation.png",
  };
}

const DARK = "#1a1a1a";
const GRAY = "#666666";
const LIGHT_GRAY = "#f5f5f5";
const HEADER_GRAY = "#b0b0b0";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateFR(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatEUR(amount: number): string {
  const fixed = amount.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  // Add space as thousands separator
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${withSep}.${decPart} EUR`;
}

// ── CGV Text (17 sections matching reference) ───────────────────────────────

const CGV_SECTIONS = [
  {
    title: "D\u00e9finitions",
    content: `Client : co-contractant de MR FORMATION

Contrat : convention de formation professionnelle conclue entre MR FORMATION et le Client. Cette convention peut prendre la forme d'un contrat en bonne et due forme, d'un bon de commande \u00e9mis par le Client et valid\u00e9 par MR FORMATION ou une facture \u00e9tablie pour la r\u00e9alisation des actions de formation professionnelle.

Formation interentreprises : Formation r\u00e9alis\u00e9e dans les locaux de MR FORMATION ou dans des locaux mis \u00e0 sa disposition par tout tiers et/ou \u00e0 distance.

Formation intra-entreprise : Formation r\u00e9alis\u00e9e sur mesure pour le compte du Client, r\u00e9alis\u00e9e dans les locaux du Client, de tout tiers et/ou \u00e0 distance.`,
  },
  {
    title: "1. Objet et champ d'application",
    content:
      "Tout Contrat implique l'acceptation sans r\u00e9serve par le Client et son adh\u00e9sion pleine et enti\u00e8re aux pr\u00e9sentes Conditions G\u00e9n\u00e9rales de Vente qui pr\u00e9valent sur tout autre document du Client, et notamment sur toutes conditions g\u00e9n\u00e9rales d'achat. Aucune d\u00e9rogation aux pr\u00e9sentes Conditions G\u00e9n\u00e9rales n'est opposable \u00e0 MR FORMATION si elle n'a pas \u00e9t\u00e9 express\u00e9ment accept\u00e9e par \u00e9crit par celle-ci.",
  },
  {
    title: "2. Documents contractuels",
    content:
      "Le Contrat pr\u00e9cisera l'intitul\u00e9 de la formation, sa nature, sa dur\u00e9e, ses effectifs, les modalit\u00e9s de son d\u00e9roulement et la sanction de la formation ainsi que son prix et les contributions financi\u00e8res \u00e9ventuelles de personnes publiques. Tout Contrat sera \u00e9tabli selon les dispositions l\u00e9gales et r\u00e9glementaires en vigueur et plus pr\u00e9cis\u00e9ment suivant les articles L6353-1 et L6353-2 du Code du travail.",
  },
  {
    title: "3. Report / annulation d'une formation par MR FORMATION",
    content:
      "MR FORMATION se r\u00e9serve la possibilit\u00e9 d'annuler ou de reporter des formations planifi\u00e9es, sans indemnit\u00e9s, sous r\u00e9serve d'en informer le Client avec un pr\u00e9avis raisonnable.",
  },
  {
    title: "4. Annulation d'une formation par le Client",
    content: `Toute formation ou cycle commenc\u00e9 est d\u00fb en totalit\u00e9, sauf accord contraire expr\u00e8s de MR FORMATION. Toute annulation d'une formation \u00e0 l'initiative du Client devra \u00eatre communiqu\u00e9e par \u00e9crit dans les conditions qui suivent :

-Pour les formations Inter et intra entreprises (hors Cycles et Parcours) :
La demande devra \u00eatre communiqu\u00e9e au moins quinze (10) jours calendaires avant le d\u00e9but de la formation. A d\u00e9faut, 100% du montant de la formation restera imm\u00e9diatement exigible \u00e0 titre d'indemnit\u00e9 forfaitaire.

- Pour les Cycles et Parcours :
La demande devra \u00eatre communiqu\u00e9e au moins quinze (15) jours calendaires avant le d\u00e9but de la formation. A d\u00e9faut, 50% du montant de la formation restera imm\u00e9diatement exigible \u00e0 titre d'indemnit\u00e9 forfaitaire.`,
  },
  {
    title: "5. Replacement d'un participant",
    content:
      "Quel que soit le type de la formation, sur demande \u00e9crite avant le d\u00e9but de la formation, le Client a la possibilit\u00e9 de remplacer un participant sans facturation suppl\u00e9mentaire.",
  },
  {
    title: "6. D\u00e9mat\u00e9rialisation des supports",
    content:
      "Dans le cadre d'un engagement environnemental, toute la documentation relative \u00e0 la formation est remise sur des supports d\u00e9mat\u00e9rialis\u00e9s.",
  },
  {
    title: "7. Refus de former",
    content:
      "Dans le cas o\u00f9 un Contrat serait conclu entre le Client et MR FORMATION sans avoir proc\u00e9d\u00e9 au paiement de la (des) formation(s) pr\u00e9c\u00e9dente(s), MR FORMATION pourra, sans autre motif et sans engager sa responsabilit\u00e9, refuser d'honorer le Contrat et de d\u00e9livrer les formations concern\u00e9es, sans que le Client puisse pr\u00e9tendre \u00e0 une quelconque indemnit\u00e9, pour quelque raison que ce soit.",
  },
  {
    title: "8. Prix et r\u00e8glements",
    content: `Les prix couvrent les frais p\u00e9dagogiques. Les frais de repas, h\u00e9bergement, transport, etc ne sont pas compris dans le prix des formations. Ils restent \u00e0 la charge du client ou seront factur\u00e9s en sus.

Pour les formations interentreprises les factures sont \u00e9mises et payables \u00e0 l'inscription.

Pour les formations intra-entreprises, un acompte minimum de 50% devra \u00eatre vers\u00e9 par le Client \u00e0 la conclusion du Contrat.

Tous les prix sont indiqu\u00e9s en euros et nets de taxes. S'ils venaient \u00e0 \u00eatre soumis \u00e0 la TVA, les prix seront major\u00e9s de la TVA au taux en vigueur au jour de l'\u00e9mission de la facture correspondante. Dans le cadre d'un engagement environnemental les factures sont transmises par voie d\u00e9mat\u00e9rialis\u00e9e et payables \u00e0 r\u00e9ception par virement aux coordonn\u00e9es bancaires de MR FORMATION, sans escompte pour r\u00e8glement anticip\u00e9. Toute somme non pay\u00e9e \u00e0 l'\u00e9ch\u00e9ance donnera lieu au paiement par le Client de p\u00e9nalit\u00e9s de retard \u00e9gales au taux d'int\u00e9r\u00eat l\u00e9gal assorti du taux d'int\u00e9r\u00eat appliqu\u00e9 par la BCE \u00e0 son op\u00e9ration de refinancement la plus r\u00e9cente major\u00e9 de 10 points de pourcentage.

Ces p\u00e9nalit\u00e9s sont exigibles de plein droit, sans mise en demeure pr\u00e9alable, d\u00e8s le premier jour de retard de paiement par rapport \u00e0 la date d'exigibilit\u00e9 du paiement.

En outre, conform\u00e9ment aux dispositions l\u00e9gislatives et r\u00e9glementaires en vigueur, toute somme non pay\u00e9e \u00e0 l'\u00e9ch\u00e9ance donnera lieu au paiement par le Client d'une indemnit\u00e9 forfaitaire pour frais de recouvrement d'un montant de quarante euros (40\u20ac). Cette indemnit\u00e9 est due de plein droit, sans mise en demeure pr\u00e9alable d\u00e8s le premier jour de retard de paiement et pour chaque facture impay\u00e9e \u00e0 son \u00e9ch\u00e9ance.`,
  },
  {
    title: "9. R\u00e8glement par un Op\u00e9rateur de Comp\u00e9tences",
    content: `Si le Client souhaite que le r\u00e8glement soit effectu\u00e9 par l'Op\u00e9rateur de Comp\u00e9tences dont il d\u00e9pend, il lui appartient :
- de faire une demande de prise en charge avant le d\u00e9but de la formation et de s'assurer de la bonne fin de cette demande ;
- de l'indiquer explicitement sur son bon de commande ;
- de s'assurer de la bonne fin du paiement par l'Op\u00e9rateur de Comp\u00e9tences qu'il aura d\u00e9sign\u00e9.

Si l'Op\u00e9rateur de Comp\u00e9tences ne prend en charge que partiellement le co\u00fbt de la formation, le reliquat sera factur\u00e9 au Client.

Si MR FORMATION n'a pas re\u00e7u la prise en charge de l'Op\u00e9rateur de Comp\u00e9tences au 1er jour de la formation, le Client sera factur\u00e9 de l'int\u00e9gralit\u00e9 du co\u00fbt de la formation concern\u00e9e par ce financement.

En cas de non-paiement par l'Op\u00e9rateur de Comp\u00e9tences, pour quelque motif que ce soit, le Client sera redevable de l'int\u00e9gralit\u00e9 du co\u00fbt de la formation et sera factur\u00e9 du montant correspondant.`,
  },
  {
    title: "10. Obligations et Responsabilit\u00e9 de MR FORMATION",
    content: `MR FORMATION s'engage \u00e0 fournir la formation avec diligence et soin raisonnables. S'agissant d'une prestation intellectuelle, MR FORMATION n'est tenu qu'\u00e0 une obligation de moyens.

En cons\u00e9quence, MR FORMATION sera responsable uniquement des dommages directs r\u00e9sultant d'une mauvaise ex\u00e9cution de ses prestations de formation, \u00e0 l'exclusion de tout dommage immat\u00e9riel ou indirect cons\u00e9cutifs ou non.

En toutes hypoth\u00e8ses, la responsabilit\u00e9 globale de MR FORMATION, au titre ou \u00e0 l'occasion de la formation, sera limit\u00e9e au prix total de la formation.`,
  },
  {
    title: "11. Obligations du Client",
    content: `Le Client s'engage \u00e0 :
- payer le prix de la formation ;
- n'effectuer aucune reproduction de mat\u00e9riel ou documents dont les droits d'auteur appartiennent \u00e0 MR FORMATION, sans l'accord \u00e9crit et pr\u00e9alable de ce dernier ; et
- ne pas utiliser de mat\u00e9riel d'enregistrement audio ou vid\u00e9o lors des formations, sans l'accord \u00e9crit et pr\u00e9alable de MR FORMATION.`,
  },
  {
    title: "12. Formations en distanciel",
    content:
      "Les r\u00e8gles ci-dessus s'appliquent aux formations en distanciel. Les participants doivent disposer d'un ordinateur \u00e9quip\u00e9 d'une carte son et de hauts parleurs, d'un \u00e9cran, d'une connexion internet stable, d'un navigateur web, avant la signature de la commande.",
  },
  {
    title: "13. Confidentialit\u00e9 et Propri\u00e9t\u00e9 Intellectuelle",
    content: `Il est express\u00e9ment convenu que toute information divulgu\u00e9e par MR FORMATION au titre ou \u00e0 l'occasion de la formation doit \u00eatre consid\u00e9r\u00e9e comme confidentielle (ci-apr\u00e8s \u00ab Informations \u00bb) et ne peut \u00eatre communiqu\u00e9e \u00e0 des tiers ou utilis\u00e9e pour un objet diff\u00e9rent de celui de la formation, sans l'accord pr\u00e9alable \u00e9crit de MR FORMATION. Le droit de propri\u00e9t\u00e9 sur toutes les Informations que MR FORMATION divulgue, quel qu'en soit la nature, le support et le mode de communication, dans le cadre ou \u00e0 l'occasion de la formation, appartient exclusivement \u00e0 MR FORMATION. En cons\u00e9quence, le Client s'engage \u00e0 conserver les Informations en lieu s\u00fbr et \u00e0 y apporter au minimum, les m\u00eames mesures de protection que celles qu'il applique habituellement \u00e0 ses propres informations. Le Client se porte fort du respect de ces stipulations de confidentialit\u00e9 et de conservation par les apprenants.

La divulgation d'Informations par MR FORMATION ne peut en aucun cas \u00eatre interpr\u00e9t\u00e9e comme conf\u00e9rant de mani\u00e8re expresse ou implicite un droit quelconque (aux termes d'une licence ou par tout autre moyen) sur les Informations ou autres droits attach\u00e9s \u00e0 la propri\u00e9t\u00e9 intellectuelle et industrielle, propri\u00e9t\u00e9 litt\u00e9raire et artistique (copyright), les marques ou le secret des affaires. Le paiement du prix n'op\u00e8re aucun transfert de droit de propri\u00e9t\u00e9 intellectuelle sur les Informations.

Par d\u00e9rogation, MR FORMATION accorde \u00e0 l'apprenant, sous r\u00e9serve des droits des tiers, une licence d'utilisation non exclusive, non-cessible et strictement personnelle du support de formation fourni, et ce quel que soit le support. L'apprenant a le droit d'effectuer une photocopie de ce support pour son usage personnel \u00e0 des fins d'\u00e9tude, \u00e0 condition que la mention des droits d'auteur de MR FORMATION ou toute autre mention de propri\u00e9t\u00e9 intellectuelle soient reproduites sur chaque copie du support de formation. L'apprenant et le Client n'ont pas le droit, sauf accord pr\u00e9alable de MR FORMATION :
- d'utiliser, copier, modifier, cr\u00e9er une oeuvre d\u00e9riv\u00e9e et/ou distribuer le support de formation \u00e0 l'exception de ce qui est pr\u00e9vu aux pr\u00e9sentes Conditions G\u00e9n\u00e9rales ;
- de d\u00e9sassembler, d\u00e9compiler et/ou traduire le support de formation, sauf dispositions l\u00e9gales contraires et sans possibilit\u00e9 de renonciation contractuelle ;
- de sous licencier, louer et/ou pr\u00eater le support de formation ;
- d'utiliser \u00e0 d'autres fins que la formation le support associ\u00e9.`,
  },
  {
    title: "14. Responsabilit\u00e9",
    content:
      "La responsabilit\u00e9 de MR FORMATION ne saurait \u00eatre engag\u00e9e dans le cas o\u00f9 des d\u00e9gradations ou des dommages seraient caus\u00e9s \u00e0 des tiers, aux locaux et mat\u00e9riels mis \u00e0 disposition de MR FORMATION mais utilis\u00e9s par les stagiaires, salari\u00e9s des entreprises clientes pendant la dur\u00e9e des sessions de formation. Dans le cadre d'un stage r\u00e9alis\u00e9 en intra-entreprise, et sauf dispositions particuli\u00e8res, l'entreprise d'accueil se charge de toute la partie logistique (restauration, r\u00e9servation de la salle de cours, mise \u00e0 disposition des mat\u00e9riels et \u00e9quipements p\u00e9dagogiques, etc.). L'entreprise d'accueil est garante du bon fonctionnement de ses \u00e9quipements. En cas de d\u00e9faillance de l'un d'entre eux, elle prendra toutes les dispositions n\u00e9cessaires pour les remplacer dans un d\u00e9lai compatible avec la poursuite de la session. A d\u00e9faut, MR FORMATION ne pourra \u00eatre tenu responsable des dysfonctionnements susceptibles de conduire \u00e0 l'annulation de la session. Si une annulation intervenait pour ce motif, l'entreprise paiera \u00e0 MR FORMATION le montant total de la prestation tel que d\u00e9fini contractuellement.",
  },
  {
    title: "15. Protection des donn\u00e9es personnelles",
    content: `Dans le cadre de la r\u00e9alisation des formations, MR FORMATION est amen\u00e9 \u00e0 collecter des donn\u00e9es \u00e0 caract\u00e8re personnel. L'acc\u00e8s \u00e0 ces donn\u00e9es est strictement limit\u00e9 aux employ\u00e9s et pr\u00e9pos\u00e9s de MR FORMATION, habilit\u00e9s \u00e0 les traiter en raison de leurs fonctions. Les informations recueillies peuvent \u00eatre partag\u00e9es avec des tiers li\u00e9s par contrat pour l'ex\u00e9cution de t\u00e2ches sous-trait\u00e9es n\u00e9cessaires pour le strict besoin des formations, sans qu'une autorisation du client et/ou stagiaire ne soit n\u00e9cessaire.

En outre les personnes concern\u00e9es disposent sur les donn\u00e9es personnelles les concernant d'un droit d'acc\u00e8s, de rectification, d'effacement, de limitation, de portabilit\u00e9, et d'apposition et peuvent \u00e0 tout moment r\u00e9voquer les consentements aux traitements. Les personnes concern\u00e9es seront susceptibles de faire valoir leurs droits directement aupr\u00e8s de MR FORMATION ou de l'\u00e9ventuel prestataire ou sous-traitant, qui s'engage \u00e0 y faire droit dans les d\u00e9lais r\u00e8glementaires et \u00e0 en informer par \u00e9crit MR FORMATION.

Conform\u00e9ment \u00e0 l'exigence essentielle de s\u00e9curit\u00e9 des donn\u00e9es personnelles, MR FORMATION s'engage dans le cadre de l'ex\u00e9cution de ses formations \u00e0 prendre toutes mesures techniques et organisationnelles utiles afin de pr\u00e9server la s\u00e9curit\u00e9 et la confidentialit\u00e9 des donn\u00e9es \u00e0 caract\u00e8re personnel et notamment d'emp\u00eacher qu'elles ne soient d\u00e9form\u00e9es, endommag\u00e9es, perdues, d\u00e9tourn\u00e9es, corrompues, divulgu\u00e9es, transmises et/ou communiqu\u00e9es \u00e0 des personnes non autoris\u00e9es. Par cons\u00e9quent, MR FORMATION s'engage \u00e0 :
- Ne traiter les donn\u00e9es personnelles que pour le strict besoin des formations et en toute neutralit\u00e9 ;
- Conserver les donn\u00e9es personnelles pendant trois (3) ans ou une dur\u00e9e sup\u00e9rieure pour se conformer aux obligations l\u00e9gales, r\u00e9soudre d'\u00e9ventuels litiges et faire respecter les engagements contractuels ;
- En cas de sous-traitance, MR FORMATION se porte fort du respect par ses sous-traitants de tous ses engagements en mati\u00e8re de s\u00e9curit\u00e9 et de protection des donn\u00e9es personnelles.
- Enfin, dans le cas o\u00f9 les donn\u00e9es \u00e0 caract\u00e8re personnel seraient amen\u00e9es \u00e0 \u00eatre transf\u00e9r\u00e9es hors de l'union europ\u00e9enne, il est rappel\u00e9 que cela ne pourra se faire sans l'accord du Client et/ou de la personne physique concern\u00e9e.`,
  },
  {
    title: "16. Communication",
    content:
      "Le Client autorise express\u00e9ment MR FORMATION \u00e0 mentionner son nom, son logo et \u00e0 faire mention \u00e0 titre de r\u00e9f\u00e9rences de la conclusion d'un Contrat et de toute op\u00e9ration d\u00e9coulant de son application dans l'ensemble de leurs documents commerciaux.",
  },
  {
    title: "17. Loi applicable et juridiction",
    content:
      "Les Contrats et tous les rapports entre MR FORMATION et son Client rel\u00e8vent de la Loi fran\u00e7aise. Tous litiges qui ne pourraient \u00eatre r\u00e9gl\u00e9s \u00e0 l'amiable dans un d\u00e9lai de soixante (60) jours compt\u00e9 \u00e0 partir de la date de la premi\u00e8re pr\u00e9sentation de la lettre recommand\u00e9e avec accus\u00e9 de r\u00e9ception, que la partie qui soul\u00e8ve le diff\u00e9rend devra avoir adress\u00e9e \u00e0 l'autre, seront de la comp\u00e9tence exclusive du tribunal de commerce de Marseille quel que soit le si\u00e8ge du Client, nonobstant pluralit\u00e9 de d\u00e9fendeurs ou appel en garantie.",
  },
];

// ── Main export ──────────────────────────────────────────────────────────────

export async function generateDevisPDF(data: DevisData, entityName?: string): Promise<jsPDF> {
  const COMPANY = getCompanyInfo(entityName);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Try to load logo
  let logoImg: string | null = null;
  try {
    const response = await fetch(COMPANY.logo);
    const blob = await response.blob();
    logoImg = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    // Logo not available, skip
  }

  let y = margin;

  // ── Page 1: Devis ──────────────────────────────────────────────────────────

  // Logo (top right)
  if (logoImg) {
    doc.addImage(logoImg, "PNG", pageWidth - margin - 35, y, 35, 30);
  }

  // Company info (left side)
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  doc.text(COMPANY.name, margin, y + 6);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY);
  doc.text(COMPANY.address, margin, y + 12);
  doc.text(`Email: ${COMPANY.email}`, margin, y + 16);
  doc.text(`Tel: ${COMPANY.tel}`, margin, y + 20);
  doc.text(COMPANY.website, margin, y + 24);

  y += 35;

  y += 5;

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  doc.text("Devis de formation professionnelle", pageWidth / 2, y, {
    align: "center",
  });
  y += 12;

  // ── Info block ─────────────────────────────────────────────────────────────

  doc.setFontSize(9);
  doc.setTextColor(DARK);

  // Reference + date
  doc.setFont("helvetica", "bold");
  doc.text(`DEVIS No. ${data.reference}`, margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Date du devis: ${formatDateFR(data.date_creation)}`,
    pageWidth - margin,
    y,
    { align: "right" }
  );
  y += 7;

  // Destinataire
  doc.setFont("helvetica", "bold");
  doc.text(`Destinataire: ${data.prospect_name}`, margin, y);
  y += 5;

  if (data.prospect_address) {
    doc.setFont("helvetica", "normal");
    doc.text(`Situ\u00e9: ${data.prospect_address}`, margin, y);
    y += 5;
  }

  // Organisateur
  doc.setFont("helvetica", "bold");
  doc.text(`Organisateur de la formation: ${COMPANY.name}`, margin, y);
  y += 7;

  // Training title
  if (data.training_title) {
    doc.setFont("helvetica", "normal");
    doc.text("Intitul\u00e9 de la formation: ", margin, y);
    doc.setFont("helvetica", "bold");
    const titleX = margin + doc.getTextWidth("Intitul\u00e9 de la formation: ");
    const titleLines = doc.splitTextToSize(data.training_title, contentWidth - (titleX - margin));
    doc.text(titleLines, titleX, y);
    y += titleLines.length * 4 + 2;
  }

  // Duration
  if (data.duration) {
    doc.setFont("helvetica", "normal");
    doc.text(`Dur\u00e9e de la formation: ${data.duration}`, margin, y);
    y += 5;
  }

  // Effectifs
  if (data.effectifs) {
    doc.setFont("helvetica", "normal");
    doc.text(`Effectifs form\u00e9s : ${data.effectifs}`, margin, y);
    y += 5;
  }

  // Training dates
  if (data.training_start) {
    doc.setFont("helvetica", "normal");
    let dateText = `Date de d\u00e9but: ${formatDateFR(data.training_start)}`;
    if (data.training_end) {
      dateText += ` au ${formatDateFR(data.training_end)}`;
    }
    doc.text(dateText, margin, y);
    y += 5;
  }

  y += 5;

  // ── Section title ──────────────────────────────────────────────────────────

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  doc.text("2. Prix de la formation", margin, y);
  y += 8;

  // ── Line items table ───────────────────────────────────────────────────────

  let subtotal = 0;
  const tableBody = data.lines.map((line) => {
    const lineTotal = line.quantity * line.unit_price;
    subtotal += lineTotal;
    return [
      line.description,
      line.quantity.toFixed(2),
      formatEUR(line.unit_price),
      formatEUR(lineTotal),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["D\u00e9signation", "Quantit\u00e9", "Prix unitaire HT", "Total HT"]],
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: HEADER_GRAY,
      textColor: "#ffffff",
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 3,
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.5, fontSize: 8 },
      1: { cellWidth: contentWidth * 0.12, halign: "center", fontSize: 8 },
      2: { cellWidth: contentWidth * 0.19, halign: "right", fontSize: 8 },
      3: { cellWidth: contentWidth * 0.19, halign: "right", fontSize: 8 },
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: DARK,
    },
    alternateRowStyles: {
      fillColor: LIGHT_GRAY,
    },
    styles: {
      lineColor: "#dddddd",
      lineWidth: 0.3,
    },
  });

  // Get Y after the table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 2;

  // ── Totals table ───────────────────────────────────────────────────────────

  const tvaAmount = subtotal * (data.tva / 100);
  const totalTTC = subtotal + tvaAmount;

  autoTable(doc, {
    startY: y,
    margin: { left: margin + contentWidth * 0.5, right: margin },
    body: [
      ["Total HT", formatEUR(subtotal)],
      [`TVA (${data.tva.toFixed(2)} %)`, formatEUR(tvaAmount)],
      ["TOTAL TTC", formatEUR(totalTTC)],
    ],
    theme: "plain",
    columnStyles: {
      0: {
        cellWidth: contentWidth * 0.25,
        halign: "center",
        fontStyle: "bold",
        fontSize: 9,
      },
      1: { cellWidth: contentWidth * 0.25, halign: "right", fontSize: 9 },
    },
    bodyStyles: {
      cellPadding: 2.5,
      textColor: DARK,
    },
    didParseCell: (hookData) => {
      const rowIndex = hookData.row.index;
      // Total HT row - light gray bg
      if (rowIndex === 0) {
        hookData.cell.styles.fillColor = "#e8e8e8";
        hookData.cell.styles.fontStyle = "bold";
      }
      // TVA row - lighter gray
      if (rowIndex === 1) {
        hookData.cell.styles.fillColor = "#f0f0f0";
      }
      // TOTAL TTC row - gray bg, bold
      if (rowIndex === 2) {
        hookData.cell.styles.fillColor = HEADER_GRAY;
        hookData.cell.styles.textColor = "#ffffff";
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.fontSize = 10;
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 12;

  // ── Notes ──────────────────────────────────────────────────────────────────

  doc.setTextColor(DARK);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  if (data.notes) {
    doc.text(data.notes, margin, y, { maxWidth: contentWidth });
    y += Math.ceil(data.notes.length / 90) * 4 + 4;
  }

  // Validity
  doc.setFont("helvetica", "italic");
  const validityDays = data.validity_days ?? 30;
  doc.text(
    `Ce devis sera valable pour une dur\u00e9e de ${validityDays} jours.`,
    margin,
    y
  );
  y += 20;

  // ── Signatures ─────────────────────────────────────────────────────────────

  // Check if we need more space for signatures (at least 30mm before footer)
  if (y > 250) {
    addFooter(doc, pageWidth, contentWidth, COMPANY);
    doc.addPage();
    y = margin + 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(DARK);
  doc.text(`${COMPANY.name},`, margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    `Tampon et signature : ${data.prospect_name}`,
    pageWidth / 2,
    y
  );

  // Signer name under MR FORMATION
  if (data.signer_name) {
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.text(data.signer_name, margin, y);
  }

  // ── Footer ─────────────────────────────────────────────────────────────────

  addFooter(doc, pageWidth, contentWidth, COMPANY);

  // ── Pages 2+: CGV ─────────────────────────────────────────────────────────

  doc.addPage();
  y = margin;

  // Logo stamp at top with company info
  if (logoImg) {
    doc.addImage(logoImg, "PNG", margin, y, 25, 22);
  }

  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY);
  doc.text(COMPANY.name, margin + 28, y + 6);
  doc.text(COMPANY.address, margin + 28, y + 9);
  doc.text(`SIRET : ${COMPANY.siret}`, margin + 28, y + 12);
  doc.text(`NDA : ${COMPANY.nda}`, margin + 28, y + 15);

  y += 28;

  // Separator
  doc.setDrawColor("#cccccc");
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // CGV Title
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK);
  doc.text("Conditions G\u00e9n\u00e9rales de Vente", pageWidth / 2, y, {
    align: "center",
  });
  y += 10;

  for (const section of CGV_SECTIONS) {
    // Check if we need a new page
    if (y > 265) {
      addFooter(doc, pageWidth, contentWidth, COMPANY);
      doc.addPage();
      y = margin;
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(DARK);
    doc.text(section.title, margin, y);
    y += 4;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(GRAY);
    doc.setFontSize(7);
    const lines = doc.splitTextToSize(section.content, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 3.2 + 4;
  }

  // Add mention/penalties if provided
  if (data.mention) {
    if (y > 250) {
      addFooter(doc, pageWidth, contentWidth, COMPANY);
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(GRAY);
    const mentionLines = doc.splitTextToSize(data.mention, contentWidth);
    doc.text(mentionLines, margin, y);
  }

  // ── Signature page (if signed) ──
  if (data.signature_data) {
    doc.addPage();

    let sigY = 20;

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(DARK);
    doc.text("BON POUR ACCORD", pageWidth / 2, sigY, { align: "center" });
    sigY += 12;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(GRAY);
    doc.text(`Devis ${data.reference}`, pageWidth / 2, sigY, { align: "center" });
    sigY += 15;

    // Signer info
    doc.setFontSize(11);
    doc.setTextColor(DARK);
    if (data.signer_name) {
      doc.text(`Signataire : ${data.signer_name}`, margin, sigY);
      sigY += 7;
    }
    if (data.signed_at) {
      doc.text(`Date de signature : ${new Date(data.signed_at).toLocaleString("fr-FR")}`, margin, sigY);
      sigY += 7;
    }
    if (data.signer_ip) {
      doc.setFontSize(8);
      doc.setTextColor(GRAY);
      doc.text(`Adresse IP : ${data.signer_ip}`, margin, sigY);
      sigY += 10;
    }

    // Render SVG signature as image
    try {
      // Convert SVG to data URL via canvas
      const svgBlob = new Blob([data.signature_data], { type: "image/svg+xml" });
      const svgUrl = URL.createObjectURL(svgBlob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load signature SVG"));
        img.src = svgUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, 400, 128);
        const pngData = canvas.toDataURL("image/png");
        doc.addImage(pngData, "PNG", margin, sigY, 80, 25);
        sigY += 30;
      }
      URL.revokeObjectURL(svgUrl);
    } catch {
      // Fallback: just show text
      doc.setFontSize(9);
      doc.setTextColor(GRAY);
      doc.text("[Signature électronique enregistrée]", margin, sigY);
      sigY += 10;
    }

    // Legal text
    doc.setFontSize(8);
    doc.setTextColor(GRAY);
    doc.setFont("helvetica", "italic");
    const legalText = "Ce document a été signé électroniquement. La signature électronique a la même valeur juridique qu'une signature manuscrite conformément au règlement eIDAS et à l'article 1367 du Code civil.";
    const legalLines = doc.splitTextToSize(legalText, contentWidth);
    doc.text(legalLines, margin, sigY);
  }

  // Footer on last page
  addFooter(doc, pageWidth, contentWidth, COMPANY);

  return doc;
}

function addFooter(doc: jsPDF, pageWidth: number, contentWidth: number, company: ReturnType<typeof getCompanyInfo>) {
  doc.setFontSize(6);
  doc.setTextColor(GRAY);
  doc.setFont("helvetica", "italic");
  doc.text(
    `${company.name}, ${company.address} , Num\u00e9ro SIRET: ${company.siret}, Num\u00e9ro de d\u00e9claration d'activit\u00e9: ${company.nda}`,
    pageWidth / 2,
    282,
    { align: "center", maxWidth: contentWidth }
  );
  doc.text(
    `(aupr\u00e8s du pr\u00e9fet de r\u00e9gion de: ${company.region})`,
    pageWidth / 2,
    286,
    { align: "center" }
  );

  // Page number
  const currentPage = doc.getCurrentPageInfo().pageNumber;
  doc.setFont("helvetica", "normal");
  doc.text(String(currentPage), pageWidth / 2, 290, { align: "center" });
}

// ── Convenience: download directly ──────────────────────────────────────────

export async function downloadDevisPDF(data: DevisData, entityName?: string): Promise<void> {
  const doc = await generateDevisPDF(data, entityName);
  doc.save(`Devis_${data.reference}.pdf`);
}

export async function generateDevisPDFBase64(data: DevisData, entityName?: string): Promise<string> {
  const doc = await generateDevisPDF(data, entityName);
  const arrayBuffer = doc.output("arraybuffer");
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
