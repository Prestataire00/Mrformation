"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Loader2, Download, BookOpen } from "lucide-react";
import { getSharedSupportsForLearner, type SharedSupport } from "@/lib/services/trainer-course-sharing";

export function LearnerSupportsSection() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [supports, setSupports] = useState<SharedSupport[]>([]);

  const fetchSupports = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSupports([]); return; }

      const { data: learners } = await supabase
        .from("learners")
        .select("id")
        .eq("profile_id", user.id);
      const learnerIds = (learners ?? []).map((l) => l.id);
      if (learnerIds.length === 0) { setSupports([]); return; }

      const { data: enr } = await supabase
        .from("enrollments")
        .select("session_id")
        .in("learner_id", learnerIds);
      const sessionIds = [...new Set((enr ?? []).map((e) => e.session_id))];

      setSupports(await getSharedSupportsForLearner(supabase, sessionIds));
    } catch {
      toast({ title: "Erreur de chargement des supports", variant: "destructive" });
      setSupports([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => { fetchSupports(); }, [fetchSupports]);

  const download = async (courseId: string, path: string) => {
    try {
      const res = await fetch(
        `/api/learner/supports/${courseId}/file-url?path=${encodeURIComponent(path)}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Téléchargement impossible.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement des supports…
      </div>
    );
  }

  if (supports.length === 0) return null; // pas de bruit si rien partagé

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" /> Supports de cours
      </h2>
      <div className="grid gap-3">
        {supports.map((s) => (
          <Card key={s.link_id}>
            <CardContent className="pt-5 space-y-2">
              <p className="font-medium text-sm">{s.course.title}</p>
              {s.course.description && (
                <p className="text-sm text-muted-foreground">{s.course.description}</p>
              )}
              <div className="flex flex-col gap-1.5">
                {s.course.files.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Aucun fichier.</p>
                ) : (
                  s.course.files.map((f) => (
                    <button
                      key={f.path}
                      onClick={() => download(s.course.id, f.path)}
                      className="flex items-center gap-2 text-sm text-primary hover:underline text-left"
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <Download className="h-3.5 w-3.5 shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
