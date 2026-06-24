"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ClipboardCheck, Loader2, Clock } from "lucide-react";

interface SessionAttendance {
  session_id: string;
  title: string;
  signed_slots: number;
  total_slots: number;
  rate_pct: number;
  signed_hours: number;
  total_hours: number;
}
interface AttendanceData {
  sessions: SessionAttendance[];
  overall_rate_pct: number;
  total_signed_hours: number;
}

function rateColor(pct: number): string {
  if (pct >= 75) return "text-green-700";
  if (pct >= 50) return "text-amber-700";
  return "text-red-600";
}

export function LearnerAttendanceSection() {
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/learner/attendance");
        const json = await res.json();
        if (res.ok) setData(json.data);
      } catch {
        /* silencieux — le bloc disparaît simplement */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement de l'assiduité…
        </CardContent>
      </Card>
    );
  }

  // Pas de session avec créneaux → rien à afficher (pas de bruit).
  if (!data || data.sessions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Mon assiduité
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className={`text-3xl font-bold ${rateColor(data.overall_rate_pct)}`}>
              {data.overall_rate_pct}%
            </p>
            <p className="text-xs text-muted-foreground">de présence aux créneaux émargés</p>
          </div>
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {data.total_signed_hours}h présentes
          </span>
        </div>
        <Progress value={data.overall_rate_pct} className="h-2" />

        <div className="space-y-3 pt-1">
          {data.sessions.map((s) => (
            <div key={s.session_id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-foreground">{s.title}</span>
                <span className={`shrink-0 font-medium ${rateColor(s.rate_pct)}`}>
                  {s.signed_slots}/{s.total_slots} créneaux · {s.rate_pct}%
                </span>
              </div>
              <Progress value={s.rate_pct} className="h-1.5" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
