"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface Snapshot {
  snapshot_date: string;
  global_score: number;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  formationTitle: string;
  currentScore: number;
}

export function QualiopiHistoryDetail({ open, onOpenChange, sessionId, formationTitle, currentScore }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/qualiopi/snapshots?session_id=${sessionId}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = await res.json();
        setSnapshots(data.snapshots ?? []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [open, sessionId]);

  // Inversé pour l'axe X chronologique
  const chartData = [...snapshots].reverse();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Historique du score Qualiopi</SheetTitle>
          <SheetDescription>
            {formationTitle} — score actuel : <strong>{currentScore}%</strong>
          </SheetDescription>
        </SheetHeader>

        {loading && <p className="text-sm text-muted-foreground py-4">Chargement…</p>}

        {!loading && snapshots.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <p>Aucun snapshot disponible pour le moment.</p>
            <p className="mt-2">Le premier snapshot sera créé demain à 3h UTC par le cron quotidien.</p>
          </div>
        )}

        {!loading && snapshots.length > 0 && (
          <>
            <div className="h-64 mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="snapshot_date" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value: number | undefined) => [`${value ?? 0}%`, "Score"]}
                    labelStyle={{ color: "#374151" }}
                  />
                  <Line type="monotone" dataKey="global_score" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6">
              <h4 className="text-sm font-semibold mb-2">Détail des snapshots</h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-right px-3 py-2">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {snapshots.slice(0, 30).map((s, i) => (
                      <tr key={`${s.snapshot_date}-${i}`}>
                        <td className="px-3 py-2">{s.snapshot_date}</td>
                        <td className="px-3 py-2 text-right font-medium">{s.global_score}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
