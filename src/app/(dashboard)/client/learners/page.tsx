"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Users,
  Mail,
  Briefcase,
  Loader2,
  Search,
  GraduationCap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";

interface LearnerWithEnrollments {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  enrollments: { id: string; status: string }[];
}

export default function ClientLearnersPage() {
  const supabase = createClient();
  const [learners, setLearners] = useState<LearnerWithEnrollments[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Find the client linked to this profile
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    if (!client) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("learners")
      .select("id, first_name, last_name, email, phone, job_title, enrollments(id, status)")
      .eq("client_id", client.id)
      .order("last_name");

    setLearners((data as LearnerWithEnrollments[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = learners.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.first_name.toLowerCase().includes(q) ||
      l.last_name.toLowerCase().includes(q) ||
      (l.email?.toLowerCase().includes(q) ?? false) ||
      (l.job_title?.toLowerCase().includes(q) ?? false)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes Apprenants</h1>
          <p className="text-gray-500 text-sm mt-1">
            {learners.length} apprenant{learners.length !== 1 ? "s" : ""} rattaché{learners.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Rechercher par nom, email, poste..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Aucun apprenant</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((learner) => {
            const activeEnrollments = learner.enrollments.filter(
              (e) => e.status !== "cancelled"
            ).length;

            return (
              <div
                key={learner.id}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold text-sm">
                      {getInitials(learner.first_name, learner.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {learner.first_name} {learner.last_name}
                    </p>
                    {learner.job_title && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                        <Briefcase className="w-3 h-3 shrink-0" />
                        {learner.job_title}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  {learner.email && (
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                      <Mail className="w-3 h-3" />
                      {learner.email}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    <GraduationCap className="w-3 h-3" />
                    {activeEnrollments} formation{activeEnrollments !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
