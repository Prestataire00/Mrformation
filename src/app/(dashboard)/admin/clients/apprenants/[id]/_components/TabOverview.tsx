"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BookOpen, Clock, GraduationCap, Monitor } from "lucide-react";

interface LearnerFull {
  id: string;
  entity_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  client_id: string | null;
  profile_id: string | null;
  job_title: string | null;
  birth_date: string | null;
  birth_city: string | null;
  gender: "M" | "F" | "autre" | null;
  nationality: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  social_security_number: string | null;
  education_level: string | null;
  learner_type: string | null;
  loris_metadata: Record<string, string | number | null> | null;
  loris_external_id: string | null;
  created_at: string;
  avatar_url: string | null;
  clients: { company_name: string } | null;
  welcome_email_sent_at: string | null;
}

interface SessionEnrollment {
  id: string;
  status: string;
  completion_rate: number;
  session: {
    id: string;
    title: string;
    start_date: string;
    end_date: string;
    training: { title: string } | null;
  } | null;
}

interface ElearningEnrollment {
  id: string;
  status: string;
  completion_rate: number;
  elearning_courses: {
    id: string;
    title: string;
    estimated_duration_minutes: number;
  } | null;
}

interface TabOverviewProps {
  learner: LearnerFull;
  sessions: SessionEnrollment[];
  elearning: ElearningEnrollment[];
}

const formatDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR") : "\u2014";

function statusLabel(status: string): string {
  switch (status) {
    case "completed": return "Terminee";
    case "confirmed": return "Confirme";
    case "in_progress": return "En cours";
    default: return "Inscrit";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "completed": return "bg-green-100 text-green-700";
    case "confirmed": return "bg-blue-100 text-blue-700";
    case "in_progress": return "bg-blue-100 text-blue-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

export default function TabOverview({ learner, sessions, elearning }: TabOverviewProps) {
  const completedSessions = sessions.filter(s => s.status === "completed").length;
  const totalHours = elearning.reduce((acc, e) => acc + (e.elearning_courses?.estimated_duration_minutes ?? 0), 0) / 60;

  const stats = [
    { label: "Formations", value: sessions.length, icon: GraduationCap, color: "text-gray-700" },
    { label: "E-learning", value: elearning.length, icon: Monitor, color: "text-blue-600" },
    { label: "Terminees", value: completedSessions, icon: BookOpen, color: "text-green-600" },
    { label: "Heures totales", value: `${totalHours.toFixed(1)}h`, icon: Clock, color: "text-amber-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={cn("h-5 w-5", s.color)} />
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Sessions de formation ({sessions.length})
        </h3>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune session de formation.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((enrollment) => (
              <div key={enrollment.id} className="border rounded-lg p-3 hover:bg-gray-50 transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {enrollment.session?.training?.title || enrollment.session?.title || "Session inconnue"}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(enrollment.session?.start_date)} &mdash; {formatDate(enrollment.session?.end_date)}
                    </p>
                  </div>
                  <Badge className={statusColor(enrollment.status)}>{statusLabel(enrollment.status)}</Badge>
                </div>
                {enrollment.completion_rate > 0 && (
                  <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                    <div className="bg-[#374151] h-1.5 rounded-full" style={{ width: `${enrollment.completion_rate}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          E-Learning ({elearning.length})
        </h3>
        {elearning.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun cours inscrit.</p>
        ) : (
          <div className="space-y-2">
            {elearning.map((e) => (
              <div key={e.id} className="border rounded-lg p-3 hover:bg-gray-50 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">{e.elearning_courses?.title ?? "Cours inconnu"}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {e.elearning_courses?.estimated_duration_minutes ?? 0} min
                      </p>
                    </div>
                  </div>
                  <Badge className={cn("text-xs", statusColor(e.status))}>{statusLabel(e.status)}</Badge>
                </div>
                <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                  <div className="bg-[#374151] h-1.5 rounded-full transition-all" style={{ width: `${e.completion_rate ?? 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
