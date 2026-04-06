/**
 * Scoring automatique des prospects
 * Score 0-100 basé sur des règles pondérées
 */

interface ScoringData {
  // Prospect data
  siret: string | null;
  email: string | null;
  phone: string | null;
  naf_code: string | null;
  source: string | null;
  amount: number | null;
  employees: string | null;

  // Interactions
  emailsSentCount: number;
  actionsCount: number;
  lastContactDate: string | null;

  // Business
  quoteSent: boolean;
  quoteAccepted: boolean;
}

interface ScoreDetail {
  label: string;
  points: number;
  maxPoints: number;
}

const HIGH_NEED_SECTORS = ["86", "87", "88", "41", "42", "43", "25", "26", "27", "28", "29", "55", "56"];

export function calculateProspectScore(data: ScoringData): {
  score: number;
  details: ScoreDetail[];
} {
  const details: ScoreDetail[] = [];

  // 1. Taille entreprise (max 20)
  const empStr = data.employees || "";
  const empNum = parseInt(empStr.replace(/[^0-9]/g, "")) || 0;
  let empPoints = 0;
  if (empNum >= 50) empPoints = 20;
  else if (empNum >= 10) empPoints = 15;
  else if (empNum > 0) empPoints = 10;
  details.push({ label: "Taille entreprise", points: empPoints, maxPoints: 20 });

  // 2. Secteur à fort besoin (max 15)
  const nafPrefix = data.naf_code?.slice(0, 2) || "";
  const sectorPoints = HIGH_NEED_SECTORS.includes(nafPrefix) ? 15 : 0;
  details.push({ label: "Secteur porteur", points: sectorPoints, maxPoints: 15 });

  // 3. Qualification (max 15)
  let qualPoints = 0;
  if (data.siret) qualPoints += 5;
  if (data.email) qualPoints += 5;
  if (data.phone) qualPoints += 5;
  details.push({ label: "Qualification (SIRET/email/tél)", points: qualPoints, maxPoints: 15 });

  // 4. Interactions (max 15)
  const interactionCount = data.emailsSentCount + data.actionsCount;
  const interactionPoints = Math.min(15, interactionCount * 3);
  details.push({ label: "Interactions commerciales", points: interactionPoints, maxPoints: 15 });

  // 5. Devis (max 15)
  let quotePoints = 0;
  if (data.quoteAccepted) quotePoints = 15;
  else if (data.quoteSent) quotePoints = 10;
  details.push({ label: "Devis", points: quotePoints, maxPoints: 15 });

  // 6. Source (max 10)
  const sourcePoints = (data.source === "recommandation" || data.source === "bouche_a_oreille" || data.source === "parrainage") ? 10 : 0;
  details.push({ label: "Source (recommandation)", points: sourcePoints, maxPoints: 10 });

  // 7. Récence (max 5)
  let recencyPoints = 0;
  if (data.lastContactDate) {
    const daysSince = Math.floor((Date.now() - new Date(data.lastContactDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince <= 7) recencyPoints = 5;
    else if (daysSince <= 30) recencyPoints = 3;
  }
  details.push({ label: "Dernier contact récent", points: recencyPoints, maxPoints: 5 });

  // 8. Montant estimé (max 5)
  const amountPoints = (data.amount && data.amount > 5000) ? 5 : 0;
  details.push({ label: "Montant estimé > 5k€", points: amountPoints, maxPoints: 5 });

  const score = Math.min(100, details.reduce((s, d) => s + d.points, 0));

  return { score, details };
}

/**
 * Catégorise le score en température
 */
export function getScoreCategory(score: number): {
  label: string;
  color: string;
  emoji: string;
} {
  if (score >= 60) return { label: "Chaud", color: "bg-red-100 text-red-700", emoji: "🔥" };
  if (score >= 30) return { label: "Tiède", color: "bg-amber-100 text-amber-700", emoji: "🌡️" };
  return { label: "Froid", color: "bg-blue-100 text-blue-700", emoji: "❄️" };
}
