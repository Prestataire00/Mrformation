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
              <SelectItem key={k} value={k}>{periodLabel[k]}</SelectItem>
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
