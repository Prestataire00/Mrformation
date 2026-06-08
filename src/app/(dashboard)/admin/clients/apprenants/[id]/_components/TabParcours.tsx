"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BookOpen, Clock, ExternalLink } from "lucide-react";

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

interface TabParcoursProps {
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

export default function TabParcours({ sessions, elearning }: TabParcoursProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            Sessions de formation
            <span className="text-xs font-normal text-gray-400">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucune session de formation.</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((enrollment) => (
                <div key={enrollment.id} className="border rounded-lg p-3 hover:bg-gray-50 transition">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {enrollment.session?.training?.title || enrollment.session?.title || "Session inconnue"}
                        </p>
                        {enrollment.session?.id && (
                          <Link href={`/admin/formations/${enrollment.session.id}`} className="text-gray-400 hover:text-gray-600 shrink-0">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(enrollment.session?.start_date)} &mdash; {formatDate(enrollment.session?.end_date)}
                      </p>
                    </div>
                    <Badge className={statusColor(enrollment.status)}>{statusLabel(enrollment.status)}</Badge>
                  </div>
                  {enrollment.completion_rate > 0 && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-400">Progression</span>
                        <span className="text-[10px] text-gray-500 font-medium">{enrollment.completion_rate}%</span>
                      </div>
                      <div className="bg-gray-100 rounded-full h-1.5">
                        <div className="bg-[#374151] h-1.5 rounded-full transition-all" style={{ width: `${enrollment.completion_rate}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            E-Learning
            <span className="text-xs font-normal text-gray-400">{elearning.length} cours</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {elearning.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun cours e-learning inscrit.</p>
          ) : (
            <div className="space-y-3">
              {elearning.map((e) => (
                <div key={e.id} className="border rounded-lg p-3 hover:bg-gray-50 transition">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <BookOpen className="h-4 w-4 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{e.elearning_courses?.title ?? "Cours inconnu"}</p>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {e.elearning_courses?.estimated_duration_minutes ?? 0} min
                        </p>
                      </div>
                    </div>
                    <Badge className={cn("text-xs shrink-0", statusColor(e.status))}>{statusLabel(e.status)}</Badge>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-400">Progression</span>
                      <span className="text-[10px] text-gray-500 font-medium">{e.completion_rate ?? 0}%</span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-1.5">
                      <div className="bg-[#374151] h-1.5 rounded-full transition-all" style={{ width: `${e.completion_rate ?? 0}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
