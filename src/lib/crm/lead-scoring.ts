import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Scoring Configuration ──────────────────────────────────────────────────

const SOURCE_SCORES: Record<string, number> = {
  "Partenaire": 20,
  "Bouche à oreille": 20,
  "Site web": 15,
  "Réseaux sociaux": 10,
  "Événement": 10,
  "Email": 5,
  "Téléphone": 5,
  "Autre": 5,
};

// ─── Calculate Lead Score ───────────────────────────────────────────────────

interface ScoreInput {
  source: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Calculate lead score for a prospect based on multiple factors.
 * Max ~120 points.
 */
export async function calculateLeadScore(
  supabase: SupabaseClient,
  prospectId: string,
  prospect: ScoreInput
): Promise<number> {
  let score = 0;

  // 1. Source scoring (max 20)
  score += SOURCE_SCORES[prospect.source ?? ""] ?? 5;

  // 2. Quote amount scoring (max 20)
  const { data: quotes } = await supabase
    .from("crm_quotes")
    .select("amount, status")
    .eq("prospect_id", prospectId);

  if (quotes && quotes.length > 0) {
    const totalAmount = quotes.reduce((sum, q) => sum + Number(q.amount ?? 0), 0);
    if (totalAmount > 5000) score += 20;
    else if (totalAmount > 2000) score += 10;
    else if (totalAmount > 0) score += 5;

    // Quote activity scoring (max 30)
    const sentQuotes = quotes.filter((q) => q.status === "sent" || q.status === "accepted").length;
    score += Math.min(sentQuotes * 10, 30);
  }

  // 3. Task activity scoring (max 25)
  const { data: tasks } = await supabase
    .from("crm_tasks")
    .select("status, created_at")
    .eq("prospect_id", prospectId);

  if (tasks && tasks.length > 0) {
    const completedTasks = tasks.filter((t) => t.status === "completed").length;
    score += Math.min(completedTasks * 5, 25);

    // 4. Response time scoring (max 15)
    const firstCompleted = tasks
      .filter((t) => t.status === "completed")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

    if (firstCompleted) {
      const prospectDate = new Date(prospect.created_at).getTime();
      const taskDate = new Date(firstCompleted.created_at).getTime();
      const daysDiff = (taskDate - prospectDate) / (1000 * 60 * 60 * 24);
      if (daysDiff <= 2) score += 15;
      else if (daysDiff <= 5) score += 8;
    }
  }

  // 5. Recency scoring (max 10)
  const updatedAt = new Date(prospect.updated_at).getTime();
  const now = Date.now();
  const daysSinceUpdate = (now - updatedAt) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate <= 7) score += 10;
  else if (daysSinceUpdate <= 30) score += 5;

  return Math.min(score, 120);
}

/**
 * Recalculate and persist score for a prospect.
 */
export async function updateProspectScore(
  supabase: SupabaseClient,
  prospectId: string
): Promise<number> {
  const { data: prospect } = await supabase
    .from("crm_prospects")
    .select("source, created_at, updated_at")
    .eq("id", prospectId)
    .single();

  if (!prospect) return 0;

  const score = await calculateLeadScore(supabase, prospectId, prospect);

  await supabase
    .from("crm_prospects")
    .update({ score })
    .eq("id", prospectId);

  return score;
}

/**
 * Recalculate scores for all active prospects of an entity.
 */
export async function recalculateAllScores(
  supabase: SupabaseClient,
  entityId: string
): Promise<number> {
  const { data: prospects } = await supabase
    .from("crm_prospects")
    .select("id, source, created_at, updated_at")
    .eq("entity_id", entityId)
    .not("status", "in", '("won","lost")');

  if (!prospects) return 0;

  let updated = 0;
  for (const p of prospects) {
    const score = await calculateLeadScore(supabase, p.id, p);
    await supabase.from("crm_prospects").update({ score }).eq("id", p.id);
    updated++;
  }
  return updated;
}
