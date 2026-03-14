"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { MODE_LABELS } from "./constants";
import type { UpcomingSession } from "./types";

interface AdminUpcomingSessionsProps {
  upcoming: UpcomingSession[];
}

export function AdminUpcomingSessions({ upcoming }: AdminUpcomingSessionsProps) {
  return (
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold text-gray-700">
          Sessions à venir
        </CardTitle>
        <Link
          href="/admin/sessions"
          className="text-sm font-medium"
          style={{ color: "#3DB5C5" }}
        >
          Voir tout →
        </Link>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            Aucune session planifiée à venir.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase text-gray-400">
                  <th className="pb-2 pr-4">Session</th>
                  <th className="pb-2 pr-4">Formation</th>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Mode</th>
                  <th className="pb-2 pr-4">Formateur</th>
                  <th className="pb-2">Lieu</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                    <td className="py-2.5 pr-4 font-medium text-gray-800">{s.title}</td>
                    <td className="py-2.5 pr-4 text-gray-500">
                      {s.training_title ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">
                      {formatDate(s.start_date)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="rounded-full bg-[#e0f5f7] px-2.5 py-0.5 text-xs font-medium text-[#3DB5C5]">
                        {MODE_LABELS[s.mode] ?? s.mode}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500">
                      {s.trainer_first_name
                        ? `${s.trainer_first_name} ${s.trainer_last_name ?? ""}`.trim()
                        : "—"
                      }
                    </td>
                    <td className="py-2.5 text-gray-500">{s.location ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
