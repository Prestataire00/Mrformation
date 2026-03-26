"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageSquare, Send, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { cn, formatDate, getInitials } from "@/lib/utils";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  author_first_name: string | null;
  author_last_name: string | null;
}

interface CommentsSectionProps {
  clientId: string;
}

export default function CommentsSection({ clientId }: CommentsSectionProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_comments")
      .select(`id, content, created_at, author_id, profiles:profiles!client_comments_author_id_fkey (first_name, last_name)`)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const mapped: Comment[] = (data as Record<string, unknown>[]).map((c) => {
        const profile = c.profiles as { first_name?: string; last_name?: string } | null;
        return {
          id: c.id as string,
          content: c.content as string,
          created_at: c.created_at as string,
          author_id: c.author_id as string,
          author_first_name: profile?.first_name ?? null,
          author_last_name: profile?.last_name ?? null,
        };
      });
      setComments(mapped);
    }
    setLoading(false);
  }, [supabase, clientId]);

  useEffect(() => {
    fetchComments();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
  }, [fetchComments, supabase]);

  async function handleSend() {
    if (!newComment.trim() || !currentUserId) return;
    setSending(true);
    try {
      const { error } = await supabase.from("client_comments").insert({
        client_id: clientId,
        author_id: currentUserId,
        content: newComment.trim(),
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
    const { error } = await supabase.from("client_comments").delete().eq("id", commentId);
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
          placeholder="Ajouter un commentaire sur ce client..."
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
            Ajoutez des notes et remarques sur ce client.
          </p>
        </div>
      ) : (
        <ScrollArea className="max-h-[500px]">
          <div className="space-y-3">
            {comments.map((comment) => {
              const isOwn = comment.author_id === currentUserId;
              const timeAgo = getRelativeTime(comment.created_at);
              return (
                <div
                  key={comment.id}
                  className="group rounded-lg border p-4 transition-shadow hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className={cn(
                        "text-xs font-semibold",
                        isOwn ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"
                      )}>
                        {getInitials(comment.author_first_name ?? "", comment.author_last_name ?? "")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {comment.author_first_name} {comment.author_last_name}
                          </span>
                          <span className="text-[11px] text-muted-foreground" title={formatDate(comment.created_at, "dd/MM/yyyy HH:mm")}>
                            {timeAgo}
                          </span>
                        </div>
                        {isOwn && (
                          <button
                            onClick={() => handleDelete(comment.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap leading-relaxed">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
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
