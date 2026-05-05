/**
 * Nomenclature des Spécialités de Formation (NSF) — INSEE.
 * Liste officielle française à 3 chiffres utilisée pour la déclaration BPF.
 *
 * Source : Arrêté du 23/03/1994 — Journal Officiel.
 * https://www.insee.fr/fr/information/2408180
 *
 * Si le client a sa propre liste interne plus précise, on peut adapter ce
 * fichier. La sélection met à jour à la fois `nsf_code` et `nsf_label`
 * sur le programme/training.
 */

export interface NsfCode {
  code: string;
  label: string;
  /** Domaine principal (1 chiffre) pour grouper l'affichage */
  domain: string;
}

export const NSF_CODES: NsfCode[] = [
  // ── Domaine 1 — Formations générales ───────────────────────
  { code: "100", label: "Formations générales", domain: "1 — Formations générales" },

  // ── Domaine 11 — Mathématiques et sciences ─────────────────
  { code: "110", label: "Spécialités pluri-scientifiques", domain: "11 — Mathématiques et sciences" },
  { code: "111", label: "Physique-chimie", domain: "11 — Mathématiques et sciences" },
  { code: "112", label: "Chimie-biologie, biochimie", domain: "11 — Mathématiques et sciences" },
  { code: "113", label: "Sciences naturelles (biologie-géologie)", domain: "11 — Mathématiques et sciences" },
  { code: "114", label: "Mathématiques", domain: "11 — Mathématiques et sciences" },
  { code: "115", label: "Physique", domain: "11 — Mathématiques et sciences" },
  { code: "116", label: "Chimie", domain: "11 — Mathématiques et sciences" },
  { code: "117", label: "Sciences de la terre", domain: "11 — Mathématiques et sciences" },
  { code: "118", label: "Sciences de la vie", domain: "11 — Mathématiques et sciences" },

  // ── Domaine 12 — Sciences humaines et droit ────────────────
  { code: "120", label: "Spécialités pluridisciplinaires, sciences humaines et droit", domain: "12 — Sciences humaines et droit" },
  { code: "121", label: "Géographie", domain: "12 — Sciences humaines et droit" },
  { code: "122", label: "Économie", domain: "12 — Sciences humaines et droit" },
  { code: "123", label: "Sciences sociales (démographie, anthropologie)", domain: "12 — Sciences humaines et droit" },
  { code: "124", label: "Psychologie", domain: "12 — Sciences humaines et droit" },
  { code: "125", label: "Linguistique", domain: "12 — Sciences humaines et droit" },
  { code: "126", label: "Histoire", domain: "12 — Sciences humaines et droit" },
  { code: "127", label: "Philosophie, éthique et théologie", domain: "12 — Sciences humaines et droit" },
  { code: "128", label: "Droit, sciences politiques", domain: "12 — Sciences humaines et droit" },

  // ── Domaine 13 — Lettres et arts ────────────────────────────
  { code: "130", label: "Spécialités pluridisciplinaires, lettres et arts", domain: "13 — Lettres et arts" },
  { code: "131", label: "Français, littérature et civilisation française", domain: "13 — Lettres et arts" },
  { code: "132", label: "Arts plastiques", domain: "13 — Lettres et arts" },
  { code: "133", label: "Musique, arts du spectacle", domain: "13 — Lettres et arts" },
  { code: "134", label: "Autres disciplines artistiques et spécialités artistiques plurivalentes", domain: "13 — Lettres et arts" },
  { code: "135", label: "Langues vivantes, civilisations étrangères et régionales", domain: "13 — Lettres et arts" },
  { code: "136", label: "Langues et civilisations anciennes", domain: "13 — Lettres et arts" },

  // ── Domaine 20 — Technologies industrielles ────────────────
  { code: "200", label: "Technologies industrielles fondamentales", domain: "20 — Technologies industrielles" },
  { code: "201", label: "Technologies de commandes des transformations industrielles", domain: "20 — Technologies industrielles" },

  // ── Domaine 21 — Agriculture, pêche, forêt ────────────────
  { code: "210", label: "Spécialités plurivalentes de l'agronomie et de l'agriculture", domain: "21 — Agriculture, pêche, forêt" },
  { code: "211", label: "Productions végétales, cultures spécialisées", domain: "21 — Agriculture, pêche, forêt" },
  { code: "212", label: "Productions animales, élevage, soins aux animaux", domain: "21 — Agriculture, pêche, forêt" },
  { code: "213", label: "Forêts, espaces naturels, faune sauvage, pêche", domain: "21 — Agriculture, pêche, forêt" },
  { code: "214", label: "Aménagement paysager", domain: "21 — Agriculture, pêche, forêt" },

  // ── Domaine 22 — Transformations ──────────────────────────
  { code: "220", label: "Spécialités pluritechnologiques des transformations", domain: "22 — Transformations" },
  { code: "221", label: "Agro-alimentaire, alimentation, cuisine", domain: "22 — Transformations" },
  { code: "222", label: "Transformations chimiques et apparentées", domain: "22 — Transformations" },
  { code: "223", label: "Métallurgie", domain: "22 — Transformations" },
  { code: "224", label: "Matériaux de construction, verre, céramique", domain: "22 — Transformations" },
  { code: "225", label: "Plasturgie, matériaux composites", domain: "22 — Transformations" },
  { code: "226", label: "Papier, carton", domain: "22 — Transformations" },
  { code: "227", label: "Énergie, génie climatique", domain: "22 — Transformations" },

  // ── Domaine 23 — Génie civil, construction, bois ──────────
  { code: "230", label: "Spécialités pluritechnologiques du génie civil, de la construction et du bois", domain: "23 — Génie civil, construction, bois" },
  { code: "231", label: "Mines et carrières, génie civil, topographie", domain: "23 — Génie civil, construction, bois" },
  { code: "232", label: "Bâtiment : construction et couverture", domain: "23 — Génie civil, construction, bois" },
  { code: "233", label: "Bâtiment : finitions", domain: "23 — Génie civil, construction, bois" },
  { code: "234", label: "Travail du bois et de l'ameublement", domain: "23 — Génie civil, construction, bois" },

  // ── Domaine 24 — Matériaux souples ────────────────────────
  { code: "240", label: "Spécialités pluritechnologiques matériaux souples", domain: "24 — Matériaux souples" },
  { code: "241", label: "Textile", domain: "24 — Matériaux souples" },
  { code: "242", label: "Habillement (vêtement)", domain: "24 — Matériaux souples" },
  { code: "243", label: "Cuirs et peaux", domain: "24 — Matériaux souples" },

  // ── Domaine 25 — Mécanique, électricité, électronique ─────
  { code: "250", label: "Spécialités pluritechnologiques mécanique-électricité", domain: "25 — Mécanique, électricité, électronique" },
  { code: "251", label: "Mécanique générale et de précision, usinage", domain: "25 — Mécanique, électricité, électronique" },
  { code: "252", label: "Moteurs et mécanique auto", domain: "25 — Mécanique, électricité, électronique" },
  { code: "253", label: "Mécanique aéronautique et spatiale", domain: "25 — Mécanique, électricité, électronique" },
  { code: "254", label: "Structures métalliques", domain: "25 — Mécanique, électricité, électronique" },
  { code: "255", label: "Électricité, électronique", domain: "25 — Mécanique, électricité, électronique" },

  // ── Domaine 30 — Services généraux ────────────────────────
  { code: "300", label: "Spécialités plurivalentes des services", domain: "30 — Services généraux" },

  // ── Domaine 31 — Échanges et gestion ──────────────────────
  { code: "310", label: "Spécialités plurivalentes des échanges et de la gestion", domain: "31 — Échanges et gestion" },
  { code: "311", label: "Transports, manutention, magasinage", domain: "31 — Échanges et gestion" },
  { code: "312", label: "Commerce, vente", domain: "31 — Échanges et gestion" },
  { code: "313", label: "Finances, banque, assurances, immobilier", domain: "31 — Échanges et gestion" },
  { code: "314", label: "Comptabilité, gestion", domain: "31 — Échanges et gestion" },
  { code: "315", label: "Ressources humaines, gestion du personnel, gestion de l'emploi", domain: "31 — Échanges et gestion" },

  // ── Domaine 32 — Communication, information ───────────────
  { code: "320", label: "Spécialités plurivalentes de la communication", domain: "32 — Communication, information" },
  { code: "321", label: "Journalisme et communication (communication graphique, publicité)", domain: "32 — Communication, information" },
  { code: "322", label: "Techniques de l'imprimerie et de l'édition", domain: "32 — Communication, information" },
  { code: "323", label: "Techniques de l'image et du son, métiers connexes du spectacle", domain: "32 — Communication, information" },
  { code: "324", label: "Secrétariat, bureautique", domain: "32 — Communication, information" },
  { code: "325", label: "Documentation, bibliothèques, administration des données", domain: "32 — Communication, information" },
  { code: "326", label: "Informatique, traitement de l'information, réseaux de transmission", domain: "32 — Communication, information" },

  // ── Domaine 33 — Services aux personnes ──────────────────
  { code: "330", label: "Spécialités plurivalentes sanitaires et sociales", domain: "33 — Services aux personnes" },
  { code: "331", label: "Santé", domain: "33 — Services aux personnes" },
  { code: "332", label: "Travail social", domain: "33 — Services aux personnes" },
  { code: "333", label: "Enseignement, formation", domain: "33 — Services aux personnes" },
  { code: "334", label: "Accueil, hôtellerie, tourisme", domain: "33 — Services aux personnes" },
  { code: "335", label: "Animation culturelle, sportive et de loisirs", domain: "33 — Services aux personnes" },
  { code: "336", label: "Coiffure, esthétique et autres spécialités des services aux personnes", domain: "33 — Services aux personnes" },

  // ── Domaine 34 — Services à la collectivité ──────────────
  { code: "340", label: "Spécialités plurivalentes des services à la collectivité", domain: "34 — Services à la collectivité" },
  { code: "341", label: "Aménagement du territoire, urbanisme", domain: "34 — Services à la collectivité" },
  { code: "342", label: "Protection et développement du patrimoine", domain: "34 — Services à la collectivité" },
  { code: "343", label: "Nettoyage, assainissement, protection de l'environnement", domain: "34 — Services à la collectivité" },
  { code: "344", label: "Sécurité des biens et des personnes, police, surveillance (SST, sécurité incendie…)", domain: "34 — Services à la collectivité" },
  { code: "345", label: "Application des droits et statut des personnes", domain: "34 — Services à la collectivité" },
  { code: "346", label: "Spécialités militaires", domain: "34 — Services à la collectivité" },

  // ── Domaine 41 — Capacités individuelles et sociales ─────
  { code: "410", label: "Spécialités concernant plusieurs capacités", domain: "41 — Développement personnel" },
  { code: "411", label: "Pratiques sportives", domain: "41 — Développement personnel" },
  { code: "412", label: "Développement des capacités d'orientation, d'insertion ou de réinsertion sociales et professionnelles", domain: "41 — Développement personnel" },
  { code: "413", label: "Développement des capacités comportementales et relationnelles", domain: "41 — Développement personnel" },
  { code: "414", label: "Développement des capacités individuelles d'organisation", domain: "41 — Développement personnel" },
  { code: "415", label: "Développement des capacités individuelles à s'exprimer et à communiquer", domain: "41 — Développement personnel" },
  { code: "421", label: "Jeux et activités spécifiques de loisirs", domain: "41 — Développement personnel" },
  { code: "422", label: "Économie et activités domestiques", domain: "41 — Développement personnel" },
  { code: "423", label: "Vie familiale, vie sociale et autres formations au développement personnel", domain: "41 — Développement personnel" },
];

/** Lookup rapide par code */
const NSF_BY_CODE = new Map(NSF_CODES.map((n) => [n.code, n]));

export function getNsfByCode(code: string | null | undefined): NsfCode | null {
  if (!code) return null;
  return NSF_BY_CODE.get(code) ?? null;
}
