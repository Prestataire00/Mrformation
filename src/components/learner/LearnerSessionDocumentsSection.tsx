"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Loader2, Download, FolderOpen } from "lucide-react";
import {
  getSessionDocumentsForLearner,
  type LearnerSessionDocument,
} from "@/lib/services/learner-session-documents";

const DOC_TYPE_LABELS: Record<string, string> = {
  feuille_emargement: "Émargement",
  evaluation: "Évaluation",
  compte_rendu: "Compte-rendu",
  bilan_pedagogique: "Bilan pédagogique",
  autre: "Document",
};

export function LearnerSessionDocumentsSection() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<LearnerSessionDocument[]>([]);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setDocs([]); return; }

      const { data: learners } = await supabase
        .from("learners")
        .select("id")
        .eq("profile_id", user.id);
      const learnerIds = (learners ?? []).map((l) => l.id);
      if (learnerIds.length === 0) { setDocs([]); return; }

      const { data: enr } = await supabase
        .from("enrollments")
        .select("session_id")
        .in("learner_id", learnerIds);
      const sessionIds = [...new Set((enr ?? []).map((e) => e.session_id))];

      setDocs(await getSessionDocumentsForLearner(supabase, sessionIds));
    } catch {
      toast({ title: "Erreur de chargement des documents", variant: "destructive" });
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const download = async (docId: string) => {
    try {
      const res = await fetch(`/api/learner/session-documents/${docId}/file-url`);
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
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement des documents…
      </div>
    );
  }

  if (docs.length === 0) return null; // pas de bruit si rien partagé

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <FolderOpen className="h-5 w-5 text-primary" /> Documents de session
      </h2>
      <Card>
        <CardContent className="pt-5 flex flex-col gap-1.5">
          {docs.map((d) => (
            <button
              key={d.id}
              onClick={() => download(d.id)}
              className="flex items-center gap-2 text-sm text-primary hover:underline text-left"
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">{d.file_name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                · {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}
              </span>
              <Download className="h-3.5 w-3.5 shrink-0" />
            </button>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
