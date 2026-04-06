// ═══════════════════════════════════════════════════════
// Fonctions métier pures — Module Formation
// Extraites des composants pour être testables unitairement
// ═══════════════════════════════════════════════════════

export function computeSessionStatus(
  currentStatus: string,
  startDate: string,
  endDate: string,
  now: Date = new Date()
): string {
  if (currentStatus === "cancelled") return "cancelled";
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (now >= end) return "completed";
  if (now >= start) return "in_progress";
  return "upcoming";
}

export function computeAttendanceRate(
  totalSlots: number,
  enrollmentsCount: number,
  trainersCount: number,
  totalSigned: number
): { totalExpected: number; completionPct: number } {
  const totalExpected = totalSlots * (enrollmentsCount + trainersCount);
  const completionPct =
    totalExpected > 0
      ? Math.round((totalSigned / totalExpected) * 100)
      : 0;
  return { totalExpected, completionPct };
}

export interface MinimalSignature {
  id: string;
  signer_id: string | null;
  signer_type: "learner" | "trainer";
  time_slot_id: string | null;
  signed_at: string;
}

export interface MinimalTimeSlot {
  id: string;
  start_time: string;
  end_time: string;
}

export function getSignaturesForSlot(
  slot: MinimalTimeSlot,
  allSignatures: MinimalSignature[]
): MinimalSignature[] {
  const directMatch = allSignatures.filter((s) => s.time_slot_id === slot.id);
  if (directMatch.length > 0) return directMatch;
  const slotDate = new Date(slot.start_time).toDateString();
  return allSignatures.filter(
    (s) => !s.time_slot_id && new Date(s.signed_at).toDateString() === slotDate
  );
}

export type QuestionStatsResult =
  | { type: "rating"; avg: number; distribution: number[]; count: number }
  | { type: "choice"; counts: Record<string, number>; total: number }
  | { type: "text"; texts: string[]; count: number };

export function getQuestionStats(
  questionId: string,
  questionType: string,
  responses: Array<{ responses: Record<string, unknown> }>
): QuestionStatsResult | null {
  const values = responses
    .map((r) => r.responses?.[questionId])
    .filter((v) => v !== undefined && v !== null && v !== "");
  if (values.length === 0) return null;

  if (questionType === "rating") {
    const nums = values.map(Number).filter((n) => !isNaN(n));
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    const distribution = [1, 2, 3, 4, 5].map(
      (n) => nums.filter((v) => v === n).length
    );
    return { type: "rating", avg, distribution, count: nums.length };
  }

  if (questionType === "multiple_choice" || questionType === "yes_no") {
    const counts: Record<string, number> = {};
    values.forEach((v) => {
      const key = String(v);
      counts[key] = (counts[key] || 0) + 1;
    });
    return { type: "choice", counts, total: values.length };
  }

  return { type: "text", texts: values.map(String), count: values.length };
}

export interface FilterableSession {
  title: string;
  status: string;
  mode: string;
  training_id: string | null;
  location: string | null;
  training?: { title: string; classification: string | null } | null;
  trainer?: { first_name: string; last_name: string } | null;
}

export function filterSessions(
  sessions: FilterableSession[],
  search: string,
  statusFilter: string,
  modeFilter: string,
  trainingFilter: string = "all",
  classificationFilter: string = "all"
): FilterableSession[] {
  return sessions.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      s.title.toLowerCase().includes(q) ||
      s.training?.title.toLowerCase().includes(q) ||
      s.location?.toLowerCase().includes(q) ||
      `${s.trainer?.first_name ?? ""} ${s.trainer?.last_name ?? ""}`
        .toLowerCase()
        .includes(q);
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    const matchMode = modeFilter === "all" || s.mode === modeFilter;
    const matchTraining =
      trainingFilter === "all" || s.training_id === trainingFilter;
    const matchClassification =
      classificationFilter === "all" ||
      s.training?.classification === classificationFilter;
    return matchSearch && matchStatus && matchMode && matchTraining && matchClassification;
  });
}
