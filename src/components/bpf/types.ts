// ─── BPF Shared Types ───────────────────────────────

export interface BPFData {
  // Section E
  personnesInternes: { nombre: number; heures: number };
  personnesExternes: { nombre: number; heures: number };
  // Section F-1
  f1: { label: string; stagiaires: number; heures: number; indent?: boolean }[];
  f1DistanceCount: number;
  // Section F-2
  f2: { stagiaires: number; heures: number };
  // Section F-3
  f3: { label: string; stagiaires: number; heures: number; indent?: boolean }[];
  // Section F-4
  f4: { code: string; label: string; stagiaires: number; heures: number }[];
  // Section G
  g: { stagiaires: number; heures: number };
}

export interface FinancialLine {
  key: string;
  label: string;
  indent?: number;
  bold?: boolean;
  isTotal?: boolean;
  sumKeys?: string[];
}

export interface ChargeLine {
  key: string;
  label: string;
  indent?: boolean;
}

export const FINANCIAL_LINES: FinancialLine[] = [
  { key: "line_1", label: "1. des entreprises pour la formation de leurs salariés", indent: 0 },
  { key: "line_2", label: "2. des organismes gestionnaires des fonds de la formation professionnelle pour des actions dispensées dans le cadre :", indent: 0, bold: true },
  { key: "line_2a", label: "a. des contrats d'apprentissage", indent: 1 },
  { key: "line_2b", label: "b. des contrats de professionnalisation", indent: 1 },
  { key: "line_2c", label: "c. de la promotion ou de la reconversion par alternance", indent: 1 },
  { key: "line_2d", label: "d. des congés individuels de formation et des projets de transition professionnelle", indent: 1 },
  { key: "line_2e", label: "e. du compte personnel de formation", indent: 1 },
  { key: "line_2f", label: "f. des dispositifs spécifiques pour les personnes en recherche d'emploi", indent: 1 },
  { key: "line_2g", label: "g. des dispositifs spécifiques pour les travailleurs non-salariés", indent: 1 },
  { key: "line_2h", label: "h. du plan de développement des compétences ou d'autres dispositifs", indent: 1 },
  { key: "line_2_total", label: "Total des produits provenant des organismes gestionnaires des fonds de la formation", indent: 1, bold: true, isTotal: true, sumKeys: ["line_2a", "line_2b", "line_2c", "line_2d", "line_2e", "line_2f", "line_2g", "line_2h"] },
  { key: "line_3", label: "3. des pouvoirs publics pour la formation de leurs agents (État, collectivités territoriales, établissements publics à caractère administratif)", indent: 0 },
  { key: "line_4", label: "4. Instances européennes", indent: 1 },
  { key: "line_5", label: "5. Etat", indent: 1 },
  { key: "line_6", label: "6. Conseils régionaux", indent: 1 },
  { key: "line_7", label: "7. Pôle emploi", indent: 1 },
  { key: "line_8", label: "8. Autres ressources publiques", indent: 1 },
  { key: "line_9", label: "9. de contrats conclus avec des personnes à titre individuel et à leurs frais", indent: 0 },
  { key: "line_10", label: "10. de contrats conclus avec d'autres organismes de formation (y compris CFA)", indent: 0 },
  { key: "line_11", label: "11. Autres produits au titre de la formation professionnelle", indent: 0 },
];

export const CHARGE_LINES: ChargeLine[] = [
  { key: "total_charges", label: "Total des charges de l'organisme liées à l'activité de formation" },
  { key: "salaires_formateurs", label: "dont Salaires des formateurs", indent: true },
  { key: "achats_prestation", label: "dont Achats de prestation de formation et honoraires de formation", indent: true },
];

export const defaultBPF: BPFData = {
  personnesInternes: { nombre: 0, heures: 0 },
  personnesExternes: { nombre: 0, heures: 0 },
  f1: [
    { label: "a. Salariés d'employeurs privés hors apprentis", stagiaires: 0, heures: 0 },
    { label: "b. Apprentis", stagiaires: 0, heures: 0 },
    { label: "c. Personnes en recherche d'emploi formées par votre organisme de formation", stagiaires: 0, heures: 0 },
    { label: "d. Particuliers à leurs propres frais formés par votre organisme de formation", stagiaires: 0, heures: 0 },
    { label: "e. Autres stagiaires", stagiaires: 0, heures: 0 },
    { label: "Total", stagiaires: 0, heures: 0 },
  ],
  f1DistanceCount: 0,
  f2: { stagiaires: 0, heures: 0 },
  f3: [
    { label: "a. Formations visant un diplôme, un titre à finalité professionnelle ou un certificat de qualification professionnelle enregistré au Répertoire national des certifications professionnelles (RNCP)", stagiaires: 0, heures: 0 },
    { label: "dont de niveau 6 à 8 (Licence, Master, diplôme d'ingénieur, Doctorat...)", stagiaires: 0, heures: 0, indent: true },
    { label: "dont de niveau 5 (BTS, DUT, écoles de formation sanitaire et sociale ...)", stagiaires: 0, heures: 0, indent: true },
    { label: "dont de niveau 4 (BAC professionnel, BT, BP, BM...)", stagiaires: 0, heures: 0, indent: true },
    { label: "dont de niveau 3 (BEP, CAP...)", stagiaires: 0, heures: 0, indent: true },
    { label: "dont de niveau 2", stagiaires: 0, heures: 0, indent: true },
    { label: "dont certificat de qualification professionnelle (CQP) sans niveau de qualification", stagiaires: 0, heures: 0, indent: true },
    { label: "b. Formations visant une certification (dont CQP) ou une habilitation enregistrée au répertoire spécifique (RS)", stagiaires: 0, heures: 0 },
    { label: "c. Formations visant un CQP non enregistré au RNCP ou au RS", stagiaires: 0, heures: 0 },
    { label: "d. Autres formations professionnelles", stagiaires: 0, heures: 0 },
    { label: "e. Bilans de compétences", stagiaires: 0, heures: 0 },
    { label: "f. Actions d'accompagnement à la validation des acquis de l'expérience", stagiaires: 0, heures: 0 },
    { label: "Total", stagiaires: 0, heures: 0 },
  ],
  f4: [],
  g: { stagiaires: 0, heures: 0 },
};
