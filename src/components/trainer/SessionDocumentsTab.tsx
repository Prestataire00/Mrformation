"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Loader2,
  Calendar,
  FileText,
  FolderOpen,
} from "lucide-react";
import { FileUploader } from "./FileUploader";
import { FileItem } from "./FileItem";
import type {
  UploadedFile,
  TrainerDocument,
  SessionDocType,
} from "./types";
import {
  SESSION_DOC_TYPE_LABELS,
  SESSION_DOC_TYPE_COLORS,
} from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrainerSession {
  id: string;
  start_date: string;
  end_date: string | null;
  status: string;
  trainings: { title: string }[] | { title: string } | null;
}

function getTrainingTitle(s: TrainerSession): string {
  if (!s.trainings) return "Session";
  if (Array.isArray(s.trainings)) return s.trainings[0]?.title ?? "Session";
  return s.trainings.title;
}

// ─── Upload Dialog ───────────────────────────────────────────────────────────

function UploadDialog({
  open,
  onClose,
  onSaved,
  trainerId,
  sessions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (doc: TrainerDocument) => void;
  trainerId: string;
  sessions: TrainerSession[];
}) {
  const [sessionId, setSessionId] = useState("");
  const [docType, setDocType] = useState<SessionDocType>("feuille_emargement");
  const [notes, setNotes] = useState("");
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setSessionId("");
      setDocType("feuille_emargement");
      setNotes("");
      setUploadedFile(null);
    }
  }, [open]);

  const handleSave = async () => {
    if (!sessionId) {
      toast({ title: "Sélectionnez une session", variant: "destructive" });
      return;
    }
    if (!uploadedFile) {
      toast({ title: "Uploadez un fichier", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/trainer/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "session",
          session_id: sessionId,
          doc_type: docType,
          file_name: uploadedFile.name,
          file_type: uploadedFile.type,
          file_size: uploadedFile.size,
          file_path: uploadedFile.path,
          notes,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");

      toast({ title: "Document ajouté" });
      onSaved(json.data);
      onClose();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un document de session</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Session *</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez une session" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {getTrainingTitle(s)} — {formatDate(s.start_date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Type de document *</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as SessionDocType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(SESSION_DOC_TYPE_LABELS) as [SessionDocType, string][]).map(
                  ([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes optionnelles..."
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>Fichier *</Label>
            {uploadedFile ? (
              <FileItem
                file={uploadedFile}
                onRemove={() => setUploadedFile(null)}
              />
            ) : (
              <FileUploader
                trainerId={trainerId}
                storagePrefix="trainer-documents/session"
                onFileAdded={setUploadedFile}
                acceptExts={["pdf", "docx", "doc", "xlsx", "xls", "jpg", "jpeg", "png", "zip"]}
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving || !uploadedFile || !sessionId}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Ajouter
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function SessionDocumentsTab({ trainerId }: { trainerId: string }) {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<TrainerDocument[]>([]);
  const [sessions, setSessions] = useState<TrainerSession[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch sessions
      const { data: sessionsData } = await supabase
        .from("sessions")
        .select("id, start_date, end_date, status, trainings(title)")
        .eq("trainer_id", trainerId)
        .order("start_date", { ascending: false });

      setSessions((sessionsData as unknown as TrainerSession[]) ?? []);

      // Fetch documents
      const res = await fetch("/api/trainer/documents?scope=session");
      const json = await res.json();
      setDocuments(json.data ?? []);
    } catch {
      toast({ title: "Erreur de chargement", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supabase, trainerId, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (docId: string) => {
    if (!confirm("Supprimer ce document ? Cette action est irréversible.")) return;
    setDeletingId(docId);
    try {
      const res = await fetch(`/api/trainer/documents/${docId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur lors de la suppression");
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      toast({ title: "Document supprimé" });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (docId: string) => {
    const res = await fetch(`/api/trainer/documents/${docId}/file-url`);
    if (!res.ok) throw new Error("Impossible de générer le lien");
    const { url } = await res.json();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleSaved = (doc: TrainerDocument) => {
    setDocuments((prev) => [doc, ...prev]);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

  // Group documents by session
  const grouped = documents.reduce<Record<string, TrainerDocument[]>>((acc, doc) => {
    const key = doc.session_id ?? "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(doc);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Feuilles d&apos;émargement, évaluations, comptes-rendus… liés à vos sessions
        </p>
        <Button onClick={() => setDialogOpen(true)} className="gap-2" disabled={sessions.length === 0}>
          <Plus className="h-4 w-4" />
          Ajouter un document
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Documents</p>
                <p className="text-2xl font-bold">{documents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sessions</p>
                <p className="text-2xl font-bold">{Object.keys(grouped).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <FolderOpen className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mes sessions</p>
                <p className="text-2xl font-bold">{sessions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents grouped by session */}
      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">Aucun document de session</p>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Uploadez vos feuilles d&apos;émargement, évaluations et comptes-rendus liés à vos sessions de formation.
            </p>
            {sessions.length > 0 && (
              <Button onClick={() => setDialogOpen(true)} className="gap-2 mt-2">
                <Plus className="h-4 w-4" />
                Ajouter mon premier document
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([sessionId, docs]) => {
            const session = sessions.find((s) => s.id === sessionId);
            return (
              <Card key={sessionId}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm">
                      {session ? getTrainingTitle(session) : "Session"}{" "}
                      {session ? `— ${formatDate(session.start_date)}` : ""}
                    </CardTitle>
                    <Badge variant="secondary" className="text-[11px]">
                      {docs.length} doc{docs.length > 1 ? "s" : ""}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {docs.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2">
                      <Badge
                        className={cn(
                          "text-[11px] shrink-0",
                          SESSION_DOC_TYPE_COLORS[doc.doc_type as SessionDocType] ?? "bg-gray-100 text-gray-800"
                        )}
                      >
                        {SESSION_DOC_TYPE_LABELS[doc.doc_type as SessionDocType] ?? doc.doc_type}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <FileItem
                          file={{
                            name: doc.file_name,
                            type: doc.file_type,
                            size: doc.file_size,
                            path: doc.file_path,
                          }}
                          onDownload={() => handleDownload(doc.id)}
                          onRemove={undefined}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 shrink-0"
                        onClick={() => handleDelete(doc.id)}
                        disabled={deletingId === doc.id}
                      >
                        {deletingId === doc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      {dialogOpen && (
        <UploadDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={handleSaved}
          trainerId={trainerId}
          sessions={sessions}
        />
      )}
    </div>
  );
}
