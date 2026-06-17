const OPEN_STATUSES = new Set(["new", "contacted", "qualified", "proposal"]);

export interface ActionLite { author_id: string; action_type: string; created_at: string; }
export interface ProspectLite { assigned_to: string | null; status: string; amount: number | null; updated_at: string; }
export interface Period { start: Date; end: Date; prevStart: Date; prevEnd: Date; }

export interface Kpis {
  actions: number; actionsTrend: number | null;
  caGagne: number; caGagneTrend: number | null;
  pipeline: number; actionsPerDay: number;
}
export interface WeekPoint { weekStart: string; call: number; email: number; relance: number; }
export interface CommercialRow { profileId: string; name: string; actions: number; pipeline: number; caGagne: number; }

function inRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function trend(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

function workingDays(start: Date, end: Date): number {
  let n = 0;
  const cur = new Date(start.getTime());
  cur.setUTCHours(0, 0, 0, 0);
  while (cur.getTime() <= end.getTime()) {
    const d = cur.getUTCDay();
    if (d !== 0 && d !== 6) n++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return Math.max(1, n);
}

export function computeKpis(actions: ActionLite[], prospects: ProspectLite[], p: Period): Kpis {
  const cur = actions.filter((a) => inRange(a.created_at, p.start, p.end)).length;
  const prev = actions.filter((a) => inRange(a.created_at, p.prevStart, p.prevEnd)).length;
  const wonCur = prospects.filter((x) => x.status === "won" && inRange(x.updated_at, p.start, p.end));
  const wonPrev = prospects.filter((x) => x.status === "won" && inRange(x.updated_at, p.prevStart, p.prevEnd));
  const sum = (xs: ProspectLite[]) => xs.reduce((s, x) => s + (x.amount ?? 0), 0);
  const caGagne = sum(wonCur);
  const pipeline = sum(prospects.filter((x) => OPEN_STATUSES.has(x.status)));
  return {
    actions: cur,
    actionsTrend: trend(cur, prev),
    caGagne,
    caGagneTrend: trend(caGagne, sum(wonPrev)),
    pipeline,
    actionsPerDay: Math.round((cur / workingDays(p.start, p.end)) * 10) / 10,
  };
}

function weekStartUTC(d: Date): Date {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
  const day = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}

export function computeActivitySeries(actions: ActionLite[], weeks: number, now: Date): WeekPoint[] {
  const thisWeek = weekStartUTC(now);
  const points: WeekPoint[] = [];
  const index = new Map<string, WeekPoint>();
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(thisWeek.getTime());
    ws.setUTCDate(ws.getUTCDate() - i * 7);
    const key = ws.toISOString().slice(0, 10);
    const pt: WeekPoint = { weekStart: key, call: 0, email: 0, relance: 0 };
    points.push(pt);
    index.set(key, pt);
  }
  for (const a of actions) {
    const key = weekStartUTC(new Date(a.created_at)).toISOString().slice(0, 10);
    const pt = index.get(key);
    if (!pt) continue;
    if (a.action_type === "call") pt.call++;
    else if (a.action_type === "email") pt.email++;
    else if (a.action_type === "relance") pt.relance++;
  }
  return points;
}

export function computeByCommercial(
  actions: ActionLite[], prospects: ProspectLite[], names: Map<string, string>, p: Period,
): CommercialRow[] {
  const rows = new Map<string, CommercialRow>();
  const get = (id: string): CommercialRow => {
    let r = rows.get(id);
    if (!r) { r = { profileId: id, name: names.get(id) ?? "—", actions: 0, pipeline: 0, caGagne: 0 }; rows.set(id, r); }
    return r;
  };
  for (const a of actions) {
    if (inRange(a.created_at, p.start, p.end)) get(a.author_id).actions++;
  }
  for (const x of prospects) {
    if (!x.assigned_to) continue;
    if (OPEN_STATUSES.has(x.status)) get(x.assigned_to).pipeline += x.amount ?? 0;
    if (x.status === "won" && inRange(x.updated_at, p.start, p.end)) get(x.assigned_to).caGagne += x.amount ?? 0;
  }
  return Array.from(rows.values()).sort((a, b) => b.actions - a.actions);
}
