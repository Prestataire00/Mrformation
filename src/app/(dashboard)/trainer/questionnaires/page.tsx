"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Pencil, Trash2, Share2, BarChart3, Loader2, ClipboardList } from "lucide-react";
import { AssignQuestionnaireDialog } from "@/components/trainer/AssignQuestionnaireDialog";

interface TrainerQuestionnaire {
  id: string;
  title: string;
  description: string | null;
  type: string;
  is_active: boolean;
  quality_indicator_type: string | null;
  created_by_trainer_id: string | null;
  mine: boolean;
}

export default function TrainerQuestionnairesPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<TrainerQuestionnaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<TrainerQuestionnaire | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trainer/questionnaires");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setItems(json.data ?? []);
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Chargement impossible.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce questionnaire ? Action irréversible.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/trainer/questionnaires/${id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? "Erreur"); }
      setItems((p) => p.filter((q) => q.id !== id));
      toast({ title: "Questionnaire supprimé" });
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Suppression impossible.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const mine = items.filter((q) => q.mine);
  const library = items.filter((q) => !q.mine);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const renderCard = (q: TrainerQuestionnaire) => (
    <Card key={q.id}>
      <CardContent className="pt-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{q.title}</p>
            {q.quality_indicator_type && <Badge variant="outline" className="text-[10px]">Qualiopi</Badge>}
            {!q.mine && !q.quality_indicator_type && <Badge variant="secondary" className="text-[10px]">Bibliothèque</Badge>}
          </div>
          {q.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{q.description}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setAssigning(q)}>
            <Share2 className="h-3.5 w-3.5" /> Attribuer
          </Button>
          <Link href={`/trainer/questionnaires/${q.id}/results`}>
            <Button size="sm" variant="ghost" className="h-8"><BarChart3 className="h-4 w-4" /></Button>
          </Link>
          {q.mine && (
            <>
              <Link href={`/trainer/questionnaires/${q.id}/edit`}>
                <Button size="sm" variant="ghost" className="h-8"><Pencil className="h-4 w-4" /></Button>
              </Link>
              <Button size="sm" variant="ghost" className="h-8 text-red-600" disabled={deletingId === q.id} onClick={() => handleDelete(q.id)}>
                {deletingId === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Questionnaires</h1>
          <p className="text-sm text-muted-foreground">Créez vos questionnaires et attribuez-les à vos sessions.</p>
        </div>
        <Link href="/trainer/questionnaires/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> Nouveau</Button>
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mes questionnaires ({mine.length})</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucun questionnaire créé.</p>
        ) : (
          <div className="grid gap-3">{mine.map(renderCard)}</div>
        )}
      </section>

      {library.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bibliothèque d'entité ({library.length})</h2>
          <div className="grid gap-3">{library.map(renderCard)}</div>
        </section>
      )}

      {assigning && (
        <AssignQuestionnaireDialog
          questionnaireId={assigning.id}
          open={!!assigning}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}
