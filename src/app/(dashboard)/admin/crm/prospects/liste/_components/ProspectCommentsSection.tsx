"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { MessageSquare, Send, Trash2, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { cn, formatDate, getInitials } from "@/lib/utils";

interface Comment {
  id: string;
  text: string;
  created_at: string;
  comment_date: string | null;
  // In-app comments
  author_id: string | null;
  author_first_name: string | null;
  author_last_name: string | null;
  // Sellsy-imported comments
  sellsy_id: string | null;
  author_name: string | null;
  author_email: string | null;
}

interface ProspectCommentsSectionProps {
  prospectId: string;
}

export default function ProspectCommentsSection({ prospectId }: ProspectCommentsSectionProps) {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("crm_prospect_comments")
      .select(
        `id, text, comment_date, created_at, author_id, author_name, author_email, sellsy_id,
         profiles:author_id (first_name, last_name)`
      )
      .eq("prospect_id", prospectId)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const mapped: Comment[] = (data as Record<string, unknown>[]).map((c) => {
        const profile = c.profiles as { first_name?: string; last_name?: string } | null;
        return {
          id: c.id as string,
          text: c.text as string,
          created_at: c.created_at as string,
          comment_date: (c.comment_date as string | null) ?? null,
          author_id: (c.author_id as string | null) ?? null,
          author_first_name: profile?.first_name ?? null,
          author_last_name: profile?.last_name ?? null,
          sellsy_id: (c.sellsy_id as string | null) ?? null,
          author_name: (c.author_name as string | null) ?? null,
          author_email: (c.author_email as string | null) ?? null,
        };
      });
      setComments(mapped);
    } else if (error) {
      console.error("[ProspectCommentsSection] fetch failed", { error });
      toast({
        title: "Erreur",
        description: "Impossible de charger les commentaires",
        variant: "destructive",
      });
    }
    setLoading(false);
  }, [supabase, prospectId, entityId, toast]);

  useEffect(() => {
    fetchComments();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
  }, [fetchComments, supabase]);

  async function handleSend() {
    if (!newComment.trim() || !currentUserId || !entityId) return;
    setSending(true);
    try {
      const { error } = await supabase.from("crm_prospect_comments").insert({
        prospect_id: prospectId,
        entity_id: entityId,
        author_id: currentUserId,
        text: newComment.trim(),
      });
      if (error) throw error;
      setNewComment("");
      toast({ title: "Commentaire ajouté" });
      fetchComments();
    } catch (err: unknown) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Impossible d'ajouter le commentaire",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(commentId: string) {
    const { error } = await supabase.from("crm_prospect_comments").delete().eq("id", commentId);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      toast({ title: "Commentaire supprimé" });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Comment input */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ajouter un commentaire sur ce prospect..."
          rows={3}
          className="resize-none border-0 p-0 focus-visible:ring-0 shadow-none text-sm"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Ctrl+Entrée pour envoyer
          </span>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sending || !newComment.trim()}
            className="gap-1.5"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Envoyer
          </Button>
        </div>
      </div>

      {/* Comments list */}
      {comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="font-medium text-gray-700">Aucun commentaire</p>
          <p className="text-sm text-muted-foreground mt-1">
            Ajoutez des notes et remarques sur ce prospect.
          </p>
        </div>
      ) : (
        // 2026-05-19 : ScrollArea max-h-[500px] retiree — coupait les cartes
        // a la 6e note environ (rapporte par Wissam : note 16/09 visible
        // uniquement en header sans texte). La liste flow maintenant
        // naturellement avec le scroll de la page.
        <div>
          <div className="space-y-3">
            {comments.map((comment) => {
              const isSellsy = !!comment.sellsy_id;
              const isOwn = !isSellsy && comment.author_id === currentUserId;
              const displayDate = comment.comment_date ?? comment.created_at;
              const timeAgo = getRelativeTime(displayDate);

              // Display name : in-app (profile) > Sellsy author_name > Sellsy author_email > fallback
              let displayName: string;
              let initials: string;
              if (comment.author_first_name || comment.author_last_name) {
                displayName = `${comment.author_first_name ?? ""} ${comment.author_last_name ?? ""}`.trim();
                initials = getInitials(comment.author_first_name ?? "", comment.author_last_name ?? "");
              } else if (comment.author_name) {
                displayName = comment.author_name;
                const parts = comment.author_name.split(/\s+/);
                initials = getInitials(parts[0] ?? "", parts.slice(1).join(" "));
              } else if (comment.author_email) {
                displayName = comment.author_email;
                initials = comment.author_email.slice(0, 2).toUpperCase();
              } else {
                displayName = "Auteur inconnu";
                initials = "??";
              }

              return (
                <div
                  key={comment.id}
                  className="group rounded-lg border p-4 transition-shadow hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className={cn(
                        "text-xs font-semibold",
                        isOwn ? "bg-blue-100 text-blue-700" :
                        isSellsy ? "bg-amber-100 text-amber-700" :
                        "bg-violet-100 text-violet-700"
                      )}>
                        {initials || "??"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">
                            {displayName}
                          </span>
                          {isSellsy && (
                            <Badge variant="outline" className="h-5 gap-1 border-amber-200 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700">
                              <Download className="h-2.5 w-2.5" />
                              Sellsy
                            </Badge>
                          )}
                          <span className="text-[11px] text-muted-foreground" title={formatDate(displayDate, "dd/MM/yyyy HH:mm")}>
                            {timeAgo}
                          </span>
                        </div>
                        {isOwn && (
                          <button
                            onClick={() => handleDelete(comment.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                            aria-label="Supprimer ce commentaire"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap leading-relaxed">
                        {comment.text}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `il y a ${diffMin}min`;
  if (diffH < 24) return `il y a ${diffH}h`;
  if (diffD < 7) return `il y a ${diffD}j`;
  return formatDate(dateStr, "dd/MM/yyyy");
}
