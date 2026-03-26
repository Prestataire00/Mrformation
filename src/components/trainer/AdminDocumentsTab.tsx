"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  FileText,
  Award,
  ShieldCheck,
} from "lucide-react";
import { FileUploader } from "./FileUploader";
import { FileItem } from "./FileItem";
import type {
  UploadedFile,
  TrainerDocument,
  AdminDocType,
} from "./types";
import {
  ADMIN_DOC_TYPE_LABELS,
  ADMIN_DOC_TYPE_COLORS,
} from "./types";

// ─── Upload Dialog ───────────────────────────────────────────────────────────

function UploadDialog({
  open,
  onClose,
  onSaved,
  trainerId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (doc: TrainerDocument) => void;
  trainerId: string;
}) {
  const [docType, setDocType] = useState<AdminDocType>("cv");
  const [notes, setNotes] = useState("");
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setDocType("cv");
      setNotes("");
      setUploadedFile(null);
    }
  }, [open]);

  const handleSave = async () => {
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
          scope: "admin",
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un document administratif</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Type de document *</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as AdminDocType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(ADMIN_DOC_TYPE_LABELS) as [AdminDocType, string][]).map(
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
              placeholder="Notes optionnelles (ex: date d'expiration, organisme certificateur…)"
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
                storagePrefix="trainer-documents/admin"
                onFileAdded={setUploadedFile}
                acceptExts={["pdf", "docx", "doc", "jpg", "jpeg", "png", "zip"]}
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving || !uploadedFile}>
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

export function AdminDocumentsTab({ trainerId }: { trainerId: string }) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<TrainerDocument[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trainer/documents?scope=admin");
      const json = await res.json();
      setDocuments(json.data ?? []);
    } catch {
      toast({ title: "Erreur de chargement", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

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

  // Stats by type
  const byType = documents.reduce<Record<string, number>>((acc, d) => {
    acc[d.doc_type] = (acc[d.doc_type] || 0) + 1;
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
          CV, diplômes, certifications et habilitations liés à votre profil
        </p>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
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
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{documents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Award className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Certifications</p>
                <p className="text-2xl font-bold">{(byType.certification || 0) + (byType.diplome || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <ShieldCheck className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Habilitations</p>
                <p className="text-2xl font-bold">{byType.habilitation || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents list */}
      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">Aucun document administratif</p>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Uploadez vos CV, diplômes, certifications et habilitations pour les transmettre à l&apos;organisme de formation.
            </p>
            <Button onClick={() => setDialogOpen(true)} className="gap-2 mt-2">
              <Plus className="h-4 w-4" />
              Ajouter mon premier document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id} className="transition-shadow hover:shadow-sm">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <Badge
                    className={cn(
                      "text-[11px] shrink-0",
                      ADMIN_DOC_TYPE_COLORS[doc.doc_type as AdminDocType] ?? "bg-gray-100 text-gray-800"
                    )}
                  >
                    {ADMIN_DOC_TYPE_LABELS[doc.doc_type as AdminDocType] ?? doc.doc_type}
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
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground">
                      {formatDate(doc.created_at)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
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
                </div>
                {doc.notes && (
                  <p className="text-xs text-muted-foreground mt-1.5 ml-1">{doc.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      {dialogOpen && (
        <UploadDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={handleSaved}
          trainerId={trainerId}
        />
      )}
    </div>
  );
}
