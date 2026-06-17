# Bandeau d'indicateurs Suivi Commercial — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans. Étapes en checkbox `- [ ]`. TDD sur le cœur (Task 1). Branche : `feat/dashboard-commercial`. Commits ciblés (`git add <fichiers>`, jamais `git add -A`).

**Goal:** Remplacer les 4 cartes KPI brutes du Suivi Commercial par un bandeau d'indicateurs (KPI à tendance + courbe d'activité + comparatif par commercial), 100 % données existantes.

**Architecture:** Fonctions pures d'agrégation (`src/lib/crm/commercial-dashboard.ts`, TDD) → route API entity-scopée (`/api/crm/suivi/dashboard`) → composant client (`CommercialDashboardBanner.tsx`) inséré en tête de `crm/suivi/page.tsx`. La liste d'actions reste inchangée.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Vitest, Zod, Supabase, Recharts, shadcn/ui.

**Référence spec :** `docs/superpowers/specs/2026-06-17-dashboard-commercial-design.md`

---

## File Structure
| Fichier | Rôle | Action |
|---------|------|--------|
| `src/lib/crm/commercial-dashboard.ts` | Fonctions pures d'agrégation | Créer |
| `src/lib/crm/__tests__/commercial-dashboard.test.ts` | Tests TDD | Créer |
| `src/app/api/crm/suivi/dashboard/route.ts` | Route GET (auth+entity, charge data, appelle service) | Créer |
| `src/app/(dashboard)/admin/crm/suivi/_components/CommercialDashboardBanner.tsx` | Bandeau UI (KPI + courbe + tableau) | Créer |
| `src/app/(dashboard)/admin/crm/suivi/page.tsx` | Insérer le bandeau, retirer les 4 cartes + `fetchKpis` | Modifier |

---

## Task 1 : Service d'agrégation (fonctions pures, TDD)

**Files:** Create `src/lib/crm/commercial-dashboard.ts`, Test `src/lib/crm/__tests__/commercial-dashboard.test.ts`

- [ ] **Step 1 : Écrire les tests d'abord**

```ts
import { describe, it, expect } from "vitest";
import {
  computeKpis, computeActivitySeries, computeByCommercial,
  type ActionLite, type ProspectLite, type Period,
} from "../commercial-dashboard";

const period: Period = {
  start: new Date("2026-06-01T00:00:00Z"), end: new Date("2026-06-30T23:59:59Z"),
  prevStart: new Date("2026-05-02T00:00:00Z"), prevEnd: new Date("2026-05-31T23:59:59Z"),
};

describe("computeKpis", () => {
  it("compte les actions de la période et calcule la tendance vs période précédente", () => {
    const actions: ActionLite[] = [
      { author_id: "a", action_type: "call", created_at: "2026-06-10T09:00:00Z" },
      { author_id: "a", action_type: "email", created_at: "2026-06-12T09:00:00Z" },
      { author_id: "b", action_type: "call", created_at: "2026-05-15T09:00:00Z" }, // période préc.
    ];
    const k = computeKpis(actions, [], period);
    expect(k.actions).toBe(2);
    expect(k.actionsTrend).toBe(100); // 2 vs 1 → +100%
  });

  it("somme le CA gagné (won) sur la période et le pipeline ouvert (toutes dates)", () => {
    const prospects: ProspectLite[] = [
      { assigned_to: "a", status: "won", amount: 1000, updated_at: "2026-06-20T09:00:00Z" },
      { assigned_to: "a", status: "won", amount: 500, updated_at: "2026-04-01T09:00:00Z" }, // hors période
      { assigned_to: "b", status: "qualified", amount: 800, updated_at: "2026-06-01T09:00:00Z" },
      { assigned_to: "b", status: "lost", amount: 999, updated_at: "2026-06-01T09:00:00Z" }, // ni won ni ouvert
    ];
    const k = computeKpis([], prospects, period);
    expect(k.caGagne).toBe(1000);
    expect(k.pipeline).toBe(800); // qualified ouvert ; won/lost/dormant exclus du pipeline
  });

  it("tendance nulle quand la période précédente est vide (pas de division par zéro)", () => {
    const actions: ActionLite[] = [{ author_id: "a", action_type: "call", created_at: "2026-06-10T09:00:00Z" }];
    const k = computeKpis(actions, [], period);
    expect(k.actionsTrend).toBeNull();
  });
});

describe("computeActivitySeries", () => {
  it("groupe par semaine et par type, semaines vides à 0", () => {
    const now = new Date("2026-06-30T12:00:00Z");
    const actions: ActionLite[] = [
      { author_id: "a", action_type: "call", created_at: "2026-06-29T09:00:00Z" },
      { author_id: "a", action_type: "email", created_at: "2026-06-29T10:00:00Z" },
      { author_id: "a", action_type: "relance", created_at: "2026-06-23T09:00:00Z" },
    ];
    const series = computeActivitySeries(actions, 4, now);
    expect(series).toHaveLength(4);
    const last = series[series.length - 1];
    expect(last.call).toBe(1);
    expect(last.email).toBe(1);
    expect(series[series.length - 2].relance).toBe(1);
    expect(series[0].call).toBe(0); // semaine la plus ancienne, vide
  });
});

describe("computeByCommercial", () => {
  it("fusionne actions (author_id) et pipeline/CA (assigned_to), trie par actions desc", () => {
    const actions: ActionLite[] = [
      { author_id: "a", action_type: "call", created_at: "2026-06-10T09:00:00Z" },
      { author_id: "a", action_type: "email", created_at: "2026-06-11T09:00:00Z" },
      { author_id: "b", action_type: "call", created_at: "2026-06-10T09:00:00Z" },
    ];
    const prospects: ProspectLite[] = [
      { assigned_to: "a", status: "qualified", amount: 1000, updated_at: "2026-06-10T09:00:00Z" },
      { assigned_to: "b", status: "won", amount: 2000, updated_at: "2026-06-10T09:00:00Z" },
    ];
    const names = new Map([["a", "Marie"], ["b", "Paul"]]);
    const rows = computeByCommercial(actions, prospects, names, period);
    expect(rows[0]).toEqual({ profileId: "a", name: "Marie", actions: 2, pipeline: 1000, caGagne: 0 });
    expect(rows[1]).toEqual({ profileId: "b", name: "Paul", actions: 1, pipeline: 0, caGagne: 2000 });
  });

  it("nom de repli quand le profil est inconnu", () => {
    const actions: ActionLite[] = [{ author_id: "z", action_type: "call", created_at: "2026-06-10T09:00:00Z" }];
    const rows = computeByCommercial(actions, [], new Map(), period);
    expect(rows[0].name).toBe("—");
  });
});
```

- [ ] **Step 2 : Lancer → échec**
Run: `npx vitest run src/lib/crm/__tests__/commercial-dashboard.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `src/lib/crm/commercial-dashboard.ts`**

```ts
// Statuts prospects considérés comme "pipeline ouvert" (cf. CHECK crm_prospects).
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

// Jours ouvrés (lun-ven) inclus dans [start, end]. (Fériés non déduits — estimation d'intensité.)
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
  const day = (x.getUTCDay() + 6) % 7; // lundi = 0
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
```

- [ ] **Step 4 : Lancer → vert**
Run: `npx vitest run src/lib/crm/__tests__/commercial-dashboard.test.ts` → 7 PASS. Puis `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 5 : Commit**
```bash
git add src/lib/crm/commercial-dashboard.ts src/lib/crm/__tests__/commercial-dashboard.test.ts
git commit -m "feat(crm): service pur d'agrégation indicateurs commerciaux (TDD)"
```

---

## Task 2 : Route API `GET /api/crm/suivi/dashboard`

**Files:** Create `src/app/api/crm/suivi/dashboard/route.ts`

- [ ] **Step 1 : Lire le pattern auth/entity existant** — ouvrir `src/app/api/crm/suivi/route.ts` (GET) : recopier le bloc d'auth (createClient server + getUser + lecture profile entity_id/role) et l'usage de `resolveActiveEntityId` (`@/lib/crm/active-entity`) pour qu'un super_admin voie l'entité active sélectionnée.

- [ ] **Step 2 : Implémenter la route**
```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveEntityId } from "@/lib/crm/active-entity";
import {
  computeKpis, computeActivitySeries, computeByCommercial, type Period,
} from "@/lib/crm/commercial-dashboard";

const querySchema = z.object({ period: z.enum(["month", "30d", "quarter"]).default("month") });

function buildPeriod(kind: "month" | "30d" | "quarter", now: Date): Period {
  const end = now;
  const start = new Date(now);
  if (kind === "month") start.setUTCDate(1), start.setUTCHours(0, 0, 0, 0);
  else if (kind === "30d") start.setUTCDate(start.getUTCDate() - 30);
  else start.setUTCMonth(start.getUTCMonth() - 3);
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return { start, end, prevStart, prevEnd };
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("entity_id, role").eq("id", user.id).single();
  if (!profile || !["super_admin", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const entityId = await resolveActiveEntityId(request, profile);
  if (!entityId) return NextResponse.json({ error: "Entité introuvable" }, { status: 400 });

  const parsed = querySchema.safeParse({ period: request.nextUrl.searchParams.get("period") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Paramètre period invalide" }, { status: 400 });

  const now = new Date();
  const period = buildPeriod(parsed.data.period, now);

  // Charger sur une fenêtre couvrant la période précédente aussi (pour la tendance) + 8 semaines de courbe.
  const sinceCurve = new Date(now); sinceCurve.setUTCDate(sinceCurve.getUTCDate() - 8 * 7);
  const since = new Date(Math.min(period.prevStart.getTime(), sinceCurve.getTime())).toISOString();

  const [{ data: actions }, { data: prospects }, { data: profiles }] = await Promise.all([
    supabase.from("crm_commercial_actions").select("author_id, action_type, created_at")
      .eq("entity_id", entityId).gte("created_at", since),
    supabase.from("crm_prospects").select("assigned_to, status, amount, updated_at").eq("entity_id", entityId),
    supabase.from("profiles").select("id, first_name, last_name").eq("entity_id", entityId),
  ]);

  const names = new Map<string, string>();
  for (const p of profiles ?? []) {
    names.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—");
  }

  const a = actions ?? [];
  const pr = prospects ?? [];
  return NextResponse.json({
    kpis: computeKpis(a, pr, period),
    activitySeries: computeActivitySeries(a, 8, now),
    byCommercial: computeByCommercial(a, pr, names, period),
  });
}
```
> ⚠️ Vérifier la signature réelle de `resolveActiveEntityId` (args) en lisant `@/lib/crm/active-entity` et l'usage dans `suivi/route.ts` ; adapter l'appel si nécessaire (sans changer la sémantique : entité active du super_admin, sinon entité du profil).

- [ ] **Step 3 : Vérifier** — `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 4 : Commit**
```bash
git add src/app/api/crm/suivi/dashboard/route.ts
git commit -m "feat(crm): route GET /api/crm/suivi/dashboard (entity-scopée)"
```

---

## Task 3 : Composant `CommercialDashboardBanner`

**Files:** Create `src/app/(dashboard)/admin/crm/suivi/_components/CommercialDashboardBanner.tsx`

- [ ] **Step 1 : Lire un graphe Recharts existant** comme modèle d'import/usage : `src/app/(dashboard)/admin/formations/[id]/_components/QualiopiHistoryDetail.tsx` (imports `recharts`, conteneur responsive).

- [ ] **Step 2 : Implémenter le composant** (client). Il :
  - a un state `period` (`"month" | "30d" | "quarter"`, défaut `"month"`) + un `<Select>` shadcn pour le changer ;
  - `fetch('/api/crm/suivi/dashboard?period=' + period)` dans un `useEffect` sur `period`, avec `loading`/`error` ;
  - **loading** → skeleton (placeholders gris) ; **erreur** → petit encart d'erreur (n'empêche pas la suite) ; **empty** (kpis.actions===0 && byCommercial.length===0) → message « Aucune activité sur cette période » ;
  - rend : (a) rangée de 4 KPI cards shadcn avec valeur + badge tendance (↑ vert / ↓ rouge / « — » si null) pour Actions et CA gagné ; (b) un `BarChart` Recharts empilé (call/email/relance) sur `activitySeries` (axe X = `weekStart`) dans un `ResponsiveContainer` ; (c) un tableau shadcn `byCommercial` (colonnes : Commercial, Actions, Pipeline géré, CA gagné), formaté en € via `formatCurrency` de `@/lib/utils`.

```tsx
"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, Phone, Euro, Briefcase, Activity } from "lucide-react";

interface Kpis { actions: number; actionsTrend: number | null; caGagne: number; caGagneTrend: number | null; pipeline: number; actionsPerDay: number; }
interface WeekPoint { weekStart: string; call: number; email: number; relance: number; }
interface CommercialRow { profileId: string; name: string; actions: number; pipeline: number; caGagne: number; }
interface DashboardData { kpis: Kpis; activitySeries: WeekPoint[]; byCommercial: CommercialRow[]; }
type PeriodKey = "month" | "30d" | "quarter";

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) return <Badge variant="outline" className="text-gray-400">—</Badge>;
  const up = value >= 0;
  return (
    <Badge className={up ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
      {up ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
      {up ? "+" : ""}{value}%
    </Badge>
  );
}

export default function CommercialDashboardBanner() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`/api/crm/suivi/dashboard?period=${period}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || `Erreur ${r.status}`); return r.json(); })
      .then((d: DashboardData) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Erreur"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  const periodLabel: Record<PeriodKey, string> = { month: "Ce mois", "30d": "30 jours", quarter: "Trimestre" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Indicateurs commerciaux</h2>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(periodLabel) as PeriodKey[]).map((k) => (
              <SelectItem key={k} value={k}>{periodLabel[k]} <span className="text-gray-400">vs préc.</span></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <div className="h-40 rounded-lg bg-gray-100 animate-pulse" />}
      {!loading && error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!loading && !error && data && (
        data.kpis.actions === 0 && data.byCommercial.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">Aucune activité sur cette période.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-4">
                <div className="flex items-center justify-between"><Activity className="h-4 w-4 text-gray-400" /><TrendBadge value={data.kpis.actionsTrend} /></div>
                <div className="mt-2 text-2xl font-bold">{data.kpis.actions}</div><div className="text-xs text-gray-500">Actions menées</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="flex items-center justify-between"><Euro className="h-4 w-4 text-gray-400" /><TrendBadge value={data.kpis.caGagneTrend} /></div>
                <div className="mt-2 text-2xl font-bold">{formatCurrency(data.kpis.caGagne)}</div><div className="text-xs text-gray-500">CA gagné</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <Briefcase className="h-4 w-4 text-gray-400" />
                <div className="mt-2 text-2xl font-bold">{formatCurrency(data.kpis.pipeline)}</div><div className="text-xs text-gray-500">Pipeline en cours</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <Phone className="h-4 w-4 text-gray-400" />
                <div className="mt-2 text-2xl font-bold">{data.kpis.actionsPerDay}</div><div className="text-xs text-gray-500">Actions / jour ouvré</div>
              </CardContent></Card>
            </div>

            <Card><CardContent className="p-4">
              <div className="text-xs text-gray-500 mb-2">Activité (8 dernières semaines)</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.activitySeries}>
                  <XAxis dataKey="weekStart" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip /><Legend />
                  <Bar dataKey="call" stackId="a" fill="#2563EB" name="Appels" />
                  <Bar dataKey="email" stackId="a" fill="#10B981" name="Emails" />
                  <Bar dataKey="relance" stackId="a" fill="#F59E0B" name="Relances" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>

            <Card><CardContent className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500"><tr>
                  <th className="text-left px-4 py-2">Commercial</th><th className="text-right px-4 py-2">Actions</th>
                  <th className="text-right px-4 py-2">Pipeline géré</th><th className="text-right px-4 py-2">CA gagné</th>
                </tr></thead>
                <tbody>{data.byCommercial.map((r) => (
                  <tr key={r.profileId} className="border-t"><td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 text-right">{r.actions}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(r.pipeline)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(r.caGagne)}</td></tr>
                ))}</tbody>
              </table>
            </CardContent></Card>
          </>
        )
      )}
    </div>
  );
}
```
> Vérifier que `formatCurrency` est bien exporté par `@/lib/utils` (utilisé ailleurs, ex. trainers/page.tsx). Sinon, formater avec `new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })`.

- [ ] **Step 3 : Vérifier** — `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 4 : Commit**
```bash
git add "src/app/(dashboard)/admin/crm/suivi/_components/CommercialDashboardBanner.tsx"
git commit -m "feat(crm): composant bandeau indicateurs commerciaux (KPI + courbe + comparatif)"
```

---

## Task 4 : Intégration dans la page Suivi

**Files:** Modify `src/app/(dashboard)/admin/crm/suivi/page.tsx`

- [ ] **Step 1 : Lire** le bloc des 4 cartes KPI (≈l.317-339) et le `fetchKpis` + le state `kpis` (≈l.83, l.120-135) pour les retirer proprement.

- [ ] **Step 2 : Remplacer** le bloc des 4 `Card` KPI par le bandeau :
  - Ajouter en import : `import CommercialDashboardBanner from "./_components/CommercialDashboardBanner";`
  - Supprimer le JSX des 4 cartes (le `.map` sur le tableau `[total/calls/emails/relances]`) et insérer `<CommercialDashboardBanner />` au même endroit (au-dessus des Tabs/liste).
  - Supprimer le state `kpis`, `setKpis`, et la fonction `fetchKpis` + son appel dans le `useEffect` (devenus redondants — le bandeau porte ses propres KPI). Ne PAS toucher au reste (liste, filtres, dialog d'ajout, teamStats).

- [ ] **Step 3 : Vérifier** — `npx tsc --noEmit` → 0 erreur. Lancer toute la suite : `npx vitest run` → vert.

- [ ] **Step 4 : Commit**
```bash
git add "src/app/(dashboard)/admin/crm/suivi/page.tsx"
git commit -m "feat(crm): branche le bandeau d'indicateurs, retire les cartes KPI brutes"
```

---

## Notes d'exécution
- **TDD** strict sur Task 1 (cœur testable). Tasks 2-4 : tsc + suite verte.
- **Isolation `entity_id`** : ne jamais retirer le filtre entité de la route.
- **Ne pas toucher** : liste d'actions, filtres, dialog d'ajout (hors périmètre).
- **Build vert** avant merge. PR sur `main` à la fin.

## Self-Review (fait)
- Couverture spec : KPI+tendance (Task1 computeKpis + Task3 UI) ✓ · courbe activité (computeActivitySeries + BarChart) ✓ · comparatif par commercial (computeByCommercial + table) ✓ · période+comparaison (buildPeriod + Select) ✓ · entity_id (route) ✓ · états loading/empty/erreur (Task3) ✓ · objectifs = phase 2 (non inclus) ✓.
- Placeholders : aucun — code réel fourni ; les 2 points « vérifier » (signature resolveActiveEntityId, export formatCurrency) renvoient à une lecture ciblée avec fallback explicite.
- Cohérence types : `Period`, `ActionLite`, `ProspectLite`, `Kpis`, `WeekPoint`, `CommercialRow` identiques entre service (Task1), route (Task2) et composant (Task3).
