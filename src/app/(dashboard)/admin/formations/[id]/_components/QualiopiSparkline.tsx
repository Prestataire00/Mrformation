"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

interface Snapshot {
  snapshot_date: string;
  global_score: number;
}

interface Props {
  sessionId: string;
}

export function QualiopiSparkline({ sessionId }: Props) {
  const [points, setPoints] = useState<Snapshot[]>([]);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/qualiopi/snapshots?session_id=${sessionId}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = await res.json();
        // Inverse l'ordre pour l'affichage chronologique (gauche → droite).
        const snaps = (data.snapshots ?? []).slice(0, 30).reverse() as Snapshot[];
        setPoints(snaps);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    })();
    return () => ctrl.abort();
  }, [sessionId]);

  if (points.length < 2) {
    // Sparkline non significative en dessous de 2 points
    return null;
  }

  return (
    <div style={{ width: 80, height: 24 }} aria-label="Évolution du score Qualiopi sur 30 jours">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis domain={[0, 100]} hide />
          <Line
            type="monotone"
            dataKey="global_score"
            stroke="#374151"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
