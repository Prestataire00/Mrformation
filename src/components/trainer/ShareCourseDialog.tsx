"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, CalendarDays } from "lucide-react";

interface SessionRow {
  id: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  training: { title: string | null } | null;
  linked: boolean;
}

export function ShareCourseDialog({
  courseId,
  open,
  onClose,
  onChanged,
}: {
  courseId: string;
  open: boolean;
  onClose: () => void;
  onChanged?: (courseId: string, linkedCount: number) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trainer/courses/${courseId}/sessions`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setRows(json.data ?? []);
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Chargement impossible.",
        variant: "destructive",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [courseId, toast]);

  useEffect(() => {
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  const toggle = async (row: SessionRow) => {
    setBusyId(row.id);
    const willLink = !row.linked;
    try {
      const res = willLink
        ? await fetch(`/api/trainer/courses/${courseId}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: row.id }),
          })
        : await fetch(`/api/trainer/courses/${courseId}/sessions/${row.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      const next = rows.map((r) => (r.id === row.id ? { ...r, linked: willLink } : r));
      setRows(next);
      onChanged?.(courseId, next.filter((r) => r.linked).length);
      toast({ title: willLink ? "Partagé avec la session" : "Partage retiré" });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Action impossible.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Partager avec mes sessions</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Aucune session ne vous est assignée pour le moment.
          </p>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {row.training?.title || row.title || "Session"}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {row.start_date ? new Date(row.start_date).toLocaleDateString("fr-FR") : "?"}
                    {" → "}
                    {row.end_date ? new Date(row.end_date).toLocaleDateString("fr-FR") : "?"}
                  </p>
                </div>
                {busyId === row.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Switch checked={row.linked} onCheckedChange={() => toggle(row)} />
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
