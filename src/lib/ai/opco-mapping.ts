/**
 * Mapping code NAF → OPCO probable
 * Basé sur les conventions collectives et les branches professionnelles
 */

const NAF_TO_OPCO: Record<string, { opco: string; code: string }> = {
  // ═══ ATLAS (Services financiers, conseil, ingénierie, numérique) ═══
  "6419Z": { opco: "ATLAS", code: "ATLAS" },
  "6430Z": { opco: "ATLAS", code: "ATLAS" },
  "6611Z": { opco: "ATLAS", code: "ATLAS" },
  "6612Z": { opco: "ATLAS", code: "ATLAS" },
  "6619A": { opco: "ATLAS", code: "ATLAS" },
  "6619B": { opco: "ATLAS", code: "ATLAS" },
  "6622Z": { opco: "ATLAS", code: "ATLAS" },
  "6629Z": { opco: "ATLAS", code: "ATLAS" },
  "6630Z": { opco: "ATLAS", code: "ATLAS" },
  "6920Z": { opco: "ATLAS", code: "ATLAS" },
  "7010Z": { opco: "ATLAS", code: "ATLAS" },
  "7021Z": { opco: "ATLAS", code: "ATLAS" },
  "7022Z": { opco: "ATLAS", code: "ATLAS" },
  "7111Z": { opco: "ATLAS", code: "ATLAS" },
  "7112B": { opco: "ATLAS", code: "ATLAS" },
  "7120A": { opco: "ATLAS", code: "ATLAS" },
  "7120B": { opco: "ATLAS", code: "ATLAS" },
  "6201Z": { opco: "ATLAS", code: "ATLAS" },
  "6202A": { opco: "ATLAS", code: "ATLAS" },
  "6202B": { opco: "ATLAS", code: "ATLAS" },
  "6203Z": { opco: "ATLAS", code: "ATLAS" },
  "6209Z": { opco: "ATLAS", code: "ATLAS" },
  "6311Z": { opco: "ATLAS", code: "ATLAS" },
  "6312Z": { opco: "ATLAS", code: "ATLAS" },

  // ═══ OPCOMMERCE (Commerce, distribution) ═══
  "4711A": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "4711B": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "4711C": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "4711D": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "4719A": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "4719B": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "4721Z": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "4751Z": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "4752A": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "4759A": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "4759B": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "4771Z": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "4772A": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "4778C": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },

  // ═══ OPCO Santé (Santé, médico-social) ═══
  "8610Z": { opco: "OPCO Santé", code: "SANTE" },
  "8621Z": { opco: "OPCO Santé", code: "SANTE" },
  "8622A": { opco: "OPCO Santé", code: "SANTE" },
  "8622B": { opco: "OPCO Santé", code: "SANTE" },
  "8622C": { opco: "OPCO Santé", code: "SANTE" },
  "8623Z": { opco: "OPCO Santé", code: "SANTE" },
  "8690A": { opco: "OPCO Santé", code: "SANTE" },
  "8690B": { opco: "OPCO Santé", code: "SANTE" },
  "8690D": { opco: "OPCO Santé", code: "SANTE" },
  "8690E": { opco: "OPCO Santé", code: "SANTE" },
  "8710A": { opco: "OPCO Santé", code: "SANTE" },
  "8710B": { opco: "OPCO Santé", code: "SANTE" },
  "8710C": { opco: "OPCO Santé", code: "SANTE" },
  "8720A": { opco: "OPCO Santé", code: "SANTE" },
  "8720B": { opco: "OPCO Santé", code: "SANTE" },
  "8730A": { opco: "OPCO Santé", code: "SANTE" },
  "8730B": { opco: "OPCO Santé", code: "SANTE" },
  "8790A": { opco: "OPCO Santé", code: "SANTE" },
  "8810A": { opco: "OPCO Santé", code: "SANTE" },
  "8810B": { opco: "OPCO Santé", code: "SANTE" },
  "8810C": { opco: "OPCO Santé", code: "SANTE" },
  "8891A": { opco: "OPCO Santé", code: "SANTE" },
  "8891B": { opco: "OPCO Santé", code: "SANTE" },
  "8899A": { opco: "OPCO Santé", code: "SANTE" },
  "8899B": { opco: "OPCO Santé", code: "SANTE" },

  // ═══ Constructys (BTP, construction) ═══
  "4110A": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4110B": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4110C": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4110D": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4120A": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4120B": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4211Z": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4212Z": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4221Z": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4222Z": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4312A": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4312B": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4321A": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4321B": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4322A": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4322B": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4329A": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4329B": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4331Z": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4332A": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4332B": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4332C": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4333Z": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4334Z": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4339Z": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4391A": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4391B": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4399A": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4399B": { opco: "Constructys", code: "CONSTRUCTYS" },
  "4399C": { opco: "Constructys", code: "CONSTRUCTYS" },

  // ═══ OPCO 2i (Industrie) ═══
  "2511Z": { opco: "OPCO 2i", code: "OPCO2I" },
  "2562A": { opco: "OPCO 2i", code: "OPCO2I" },
  "2562B": { opco: "OPCO 2i", code: "OPCO2I" },
  "2573A": { opco: "OPCO 2i", code: "OPCO2I" },
  "2573B": { opco: "OPCO 2i", code: "OPCO2I" },
  "2811Z": { opco: "OPCO 2i", code: "OPCO2I" },
  "2812Z": { opco: "OPCO 2i", code: "OPCO2I" },
  "2899A": { opco: "OPCO 2i", code: "OPCO2I" },
  "2899B": { opco: "OPCO 2i", code: "OPCO2I" },
  "2932Z": { opco: "OPCO 2i", code: "OPCO2I" },

  // ═══ AKTO (Hôtellerie, restauration, tourisme, intérim, propreté) ═══
  "5510Z": { opco: "AKTO", code: "AKTO" },
  "5520Z": { opco: "AKTO", code: "AKTO" },
  "5530Z": { opco: "AKTO", code: "AKTO" },
  "5590Z": { opco: "AKTO", code: "AKTO" },
  "5610A": { opco: "AKTO", code: "AKTO" },
  "5610C": { opco: "AKTO", code: "AKTO" },
  "5621Z": { opco: "AKTO", code: "AKTO" },
  "5629A": { opco: "AKTO", code: "AKTO" },
  "5629B": { opco: "AKTO", code: "AKTO" },
  "5630Z": { opco: "AKTO", code: "AKTO" },
  "7810Z": { opco: "AKTO", code: "AKTO" },
  "7820Z": { opco: "AKTO", code: "AKTO" },
  "7830Z": { opco: "AKTO", code: "AKTO" },
  "8121Z": { opco: "AKTO", code: "AKTO" },
  "8122Z": { opco: "AKTO", code: "AKTO" },
  "8129A": { opco: "AKTO", code: "AKTO" },
  "8129B": { opco: "AKTO", code: "AKTO" },

  // ═══ AFDAS (Culture, médias, communication, sport, loisirs) ═══
  "9001Z": { opco: "AFDAS", code: "AFDAS" },
  "9002Z": { opco: "AFDAS", code: "AFDAS" },
  "9003A": { opco: "AFDAS", code: "AFDAS" },
  "9003B": { opco: "AFDAS", code: "AFDAS" },
  "9004Z": { opco: "AFDAS", code: "AFDAS" },
  "5811Z": { opco: "AFDAS", code: "AFDAS" },
  "5812Z": { opco: "AFDAS", code: "AFDAS" },
  "5813Z": { opco: "AFDAS", code: "AFDAS" },
  "5821Z": { opco: "AFDAS", code: "AFDAS" },
  "5911A": { opco: "AFDAS", code: "AFDAS" },
  "5911B": { opco: "AFDAS", code: "AFDAS" },
  "5911C": { opco: "AFDAS", code: "AFDAS" },
  "5912Z": { opco: "AFDAS", code: "AFDAS" },
  "5920Z": { opco: "AFDAS", code: "AFDAS" },
  "6010Z": { opco: "AFDAS", code: "AFDAS" },
  "6020A": { opco: "AFDAS", code: "AFDAS" },
  "6020B": { opco: "AFDAS", code: "AFDAS" },
  "7311Z": { opco: "AFDAS", code: "AFDAS" },
  "7312Z": { opco: "AFDAS", code: "AFDAS" },
  "9311Z": { opco: "AFDAS", code: "AFDAS" },
  "9312Z": { opco: "AFDAS", code: "AFDAS" },
  "9313Z": { opco: "AFDAS", code: "AFDAS" },
  "9319Z": { opco: "AFDAS", code: "AFDAS" },
  "9321Z": { opco: "AFDAS", code: "AFDAS" },
  "9329Z": { opco: "AFDAS", code: "AFDAS" },

  // ═══ OCAPIAT (Agriculture, agroalimentaire, pêche) ═══
  "0111Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "0112Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "0113Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "0119Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "0121Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "0122Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "0141Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "0142Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "0311Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "0312Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1011Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1012Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1013A": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1013B": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1020Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1039A": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1039B": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1041A": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1041B": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1051A": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1051B": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1051C": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1052Z": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1061A": { opco: "OCAPIAT", code: "OCAPIAT" },
  "1061B": { opco: "OCAPIAT", code: "OCAPIAT" },

  // ═══ OPCO Mobilités (Transport, logistique) ═══
  "4910Z": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "4920Z": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "4931Z": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "4932Z": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "4939A": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "4939B": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "4939C": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "4941A": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "4941B": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "4941C": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "4942Z": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "4950Z": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "5010Z": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "5020Z": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "5110Z": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "5121Z": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "5210A": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "5210B": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "5221Z": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "5222Z": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "5223Z": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "5224A": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "5224B": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "5229A": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "5229B": { opco: "OPCO Mobilités", code: "MOBILITES" },

  // ═══ OPCO EP (Entreprises de proximité, artisanat, professions libérales) ═══
  "8559A": { opco: "OPCO EP", code: "EP" },
  "8559B": { opco: "OPCO EP", code: "EP" },
  "8551Z": { opco: "OPCO EP", code: "EP" },
  "8552Z": { opco: "OPCO EP", code: "EP" },
  "9601A": { opco: "OPCO EP", code: "EP" },
  "9601B": { opco: "OPCO EP", code: "EP" },
  "9602A": { opco: "OPCO EP", code: "EP" },
  "9602B": { opco: "OPCO EP", code: "EP" },
  "9604Z": { opco: "OPCO EP", code: "EP" },
  "6910Z": { opco: "OPCO EP", code: "EP" },
  "7500Z": { opco: "OPCO EP", code: "EP" },

  // ═══ Uniformation (Cohésion sociale, emploi, insertion) ═══
  "8411Z": { opco: "Uniformation", code: "UNIFORMATION" },
  "8412Z": { opco: "Uniformation", code: "UNIFORMATION" },
  "8413Z": { opco: "Uniformation", code: "UNIFORMATION" },
  "8520Z": { opco: "Uniformation", code: "UNIFORMATION" },
  "8531Z": { opco: "Uniformation", code: "UNIFORMATION" },
  "8532Z": { opco: "Uniformation", code: "UNIFORMATION" },
  "8541Z": { opco: "Uniformation", code: "UNIFORMATION" },
  "8542Z": { opco: "Uniformation", code: "UNIFORMATION" },
  "9411Z": { opco: "Uniformation", code: "UNIFORMATION" },
  "9412Z": { opco: "Uniformation", code: "UNIFORMATION" },
  "9420Z": { opco: "Uniformation", code: "UNIFORMATION" },
  "9491Z": { opco: "Uniformation", code: "UNIFORMATION" },
  "9499Z": { opco: "Uniformation", code: "UNIFORMATION" },
};

// Fallback par préfixe NAF (2 premiers caractères)
const PREFIX_TO_OPCO: Record<string, { opco: string; code: string }> = {
  "01": { opco: "OCAPIAT", code: "OCAPIAT" },
  "02": { opco: "OCAPIAT", code: "OCAPIAT" },
  "03": { opco: "OCAPIAT", code: "OCAPIAT" },
  "10": { opco: "OCAPIAT", code: "OCAPIAT" },
  "11": { opco: "OCAPIAT", code: "OCAPIAT" },
  "25": { opco: "OPCO 2i", code: "OPCO2I" },
  "26": { opco: "OPCO 2i", code: "OPCO2I" },
  "27": { opco: "OPCO 2i", code: "OPCO2I" },
  "28": { opco: "OPCO 2i", code: "OPCO2I" },
  "29": { opco: "OPCO 2i", code: "OPCO2I" },
  "30": { opco: "OPCO 2i", code: "OPCO2I" },
  "41": { opco: "Constructys", code: "CONSTRUCTYS" },
  "42": { opco: "Constructys", code: "CONSTRUCTYS" },
  "43": { opco: "Constructys", code: "CONSTRUCTYS" },
  "47": { opco: "OPCOMMERCE", code: "OPCOMMERCE" },
  "49": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "50": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "51": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "52": { opco: "OPCO Mobilités", code: "MOBILITES" },
  "55": { opco: "AKTO", code: "AKTO" },
  "56": { opco: "AKTO", code: "AKTO" },
  "58": { opco: "AFDAS", code: "AFDAS" },
  "59": { opco: "AFDAS", code: "AFDAS" },
  "60": { opco: "AFDAS", code: "AFDAS" },
  "62": { opco: "ATLAS", code: "ATLAS" },
  "63": { opco: "ATLAS", code: "ATLAS" },
  "64": { opco: "ATLAS", code: "ATLAS" },
  "65": { opco: "ATLAS", code: "ATLAS" },
  "66": { opco: "ATLAS", code: "ATLAS" },
  "69": { opco: "ATLAS", code: "ATLAS" },
  "70": { opco: "ATLAS", code: "ATLAS" },
  "71": { opco: "ATLAS", code: "ATLAS" },
  "78": { opco: "AKTO", code: "AKTO" },
  "81": { opco: "AKTO", code: "AKTO" },
  "84": { opco: "Uniformation", code: "UNIFORMATION" },
  "85": { opco: "OPCO EP", code: "EP" },
  "86": { opco: "OPCO Santé", code: "SANTE" },
  "87": { opco: "OPCO Santé", code: "SANTE" },
  "88": { opco: "OPCO Santé", code: "SANTE" },
  "90": { opco: "AFDAS", code: "AFDAS" },
  "93": { opco: "AFDAS", code: "AFDAS" },
  "94": { opco: "Uniformation", code: "UNIFORMATION" },
  "96": { opco: "OPCO EP", code: "EP" },
};

/**
 * Détecte l'OPCO probable à partir du code NAF.
 * Cherche d'abord le code exact, puis les 4 premiers chars, puis le préfixe (2 chars).
 */
export function detectOPCO(nafCode: string | null): { opco: string; code: string; confidence: "exact" | "prefix" | "guess" } | null {
  if (!nafCode) return null;

  const clean = nafCode.trim().toUpperCase();

  // 1. Exact match
  if (NAF_TO_OPCO[clean]) {
    return { ...NAF_TO_OPCO[clean], confidence: "exact" };
  }

  // 2. Match on first 4 chars (without trailing letter)
  const fourChars = clean.slice(0, 4);
  for (const [key, value] of Object.entries(NAF_TO_OPCO)) {
    if (key.startsWith(fourChars)) {
      return { ...value, confidence: "prefix" };
    }
  }

  // 3. Match on 2-char prefix
  const prefix = clean.slice(0, 2);
  if (PREFIX_TO_OPCO[prefix]) {
    return { ...PREFIX_TO_OPCO[prefix], confidence: "guess" };
  }

  return null;
}

/**
 * Liste de tous les OPCOs pour les dropdowns
 */
export const OPCO_LIST = [
  { code: "ATLAS", name: "ATLAS" },
  { code: "OPCOMMERCE", name: "OPCOMMERCE" },
  { code: "SANTE", name: "OPCO Santé" },
  { code: "CONSTRUCTYS", name: "Constructys" },
  { code: "OPCO2I", name: "OPCO 2i" },
  { code: "AKTO", name: "AKTO" },
  { code: "AFDAS", name: "AFDAS" },
  { code: "OCAPIAT", name: "OCAPIAT" },
  { code: "MOBILITES", name: "OPCO Mobilités" },
  { code: "EP", name: "OPCO EP" },
  { code: "UNIFORMATION", name: "Uniformation" },
];
