"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { formatDateTime } from "@/lib/utils";
import type { Session } from "@/lib/types";

interface Props {
  formation: Session;
  onRefresh: () => Promise<void>;
}

export function ResumeComments({ formation, onRefresh }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [newComment, setNewComment] = useState("");
  const [saving, setSaving] = useState(false);

  const comments = formation.formation_comments || [];

  const handleAdd = async () => {
    if (!newComment.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("formation_comments").insert({
      session_id: formation.id,
      author_id: user?.id || null,
      content: newComment.trim(),
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      toast({ title: "Commentaire ajouté" });
      setNewComment("");
      onRefresh();
    }
  };

  const handleDelete = async (commentId: string) => {
    const { error } = await supabase.from("formation_comments").delete().eq("id", commentId);
    if (error) {
      toast({ title: "Erreur", variant: "destructive" });
    } else {
      onRefresh();
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Commentaires</h3>
      <p className="text-xs text-muted-foreground">
        Les commentaires ne sont pas visibles aux apprenants.
      </p>
      <div className="space-y-3">
        {comments.map((c) => (
          <div key={c.id} className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium">
                {c.author?.first_name} {c.author?.last_name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(c.created_at)}
                </span>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <p className="text-sm whitespace-pre-wrap">{c.content}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Ajouter un commentaire..."
          rows={2}
        />
        <Button size="sm" onClick={handleAdd} disabled={saving || !newComment.trim()}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Ajouter
        </Button>
      </div>
    </div>
  );
}
