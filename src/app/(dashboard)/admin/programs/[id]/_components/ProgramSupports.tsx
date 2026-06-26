"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, Trash2, FileText, Loader2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { fetchSignedDocUrl } from "@/lib/storage/fetch-signed-doc-url";
import {
  listProgramDocuments,
  createProgramDocument,
  deleteProgramDocument,
} from "@/lib/services/program-documents";
import type { ProgramDocument } from "@/lib/types";

interface Props {
  programId: string;
  entityId: string;
}

/**
 * Supports de cours attachés au programme (source unique). Upload dans le
 * bucket public `formation-docs` (chemin `programs/{id}/…`), métadonnées en
 * base via le service. Ces supports sont ensuite publiés par jointure dans
 * l'onglet Docs partagés des sessions liées et le portail apprenant.
 */
export function ProgramSupports({ programId, entityId }: Props) {
  const { toast } = useToast();
  const supabase = createClient();
  const [documents, setDocuments] = useState<ProgramDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await listProgramDocuments(supabase, programId, entityId);
    if (!result.ok) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les supports du programme.",
        variant: "destructive",
      });
      setDocuments([]);
    } else {
      setDocuments(result.documents);
    }
    setLoading(false);
  }, [supabase, programId, entityId, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const filePath = `programs/${programId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("formation-docs")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("formation-docs")
        .getPublicUrl(filePath);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const result = await createProgramDocument(supabase, {
        programId,
        entityId,
        fileName: file.name,
        fileUrl: urlData.publicUrl,
        uploadedBy: user?.id ?? null,
      });
      if (!result.ok) throw new Error(result.error.message);

      toast({ title: "Support ajouté" });
      await refresh();
    } catch (error) {
      console.error("[ProgramSupports] handleUpload failed:", error);
      const message =
        error instanceof Error ? error.message : "Impossible d'uploader le support";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: ProgramDocument) => {
    setDeleting(doc.id);

    // Suppression Storage (non-bloquante).
    try {
      const urlParts = doc.file_url.split("/formation-docs/");
      if (urlParts[1]) {
        await supabase.storage.from("formation-docs").remove([urlParts[1]]);
      }
    } catch (storageError) {
      console.warn("[ProgramSupports] Storage deletion failed (non-blocking):", storageError);
    }

    try {
      const result = await deleteProgramDocument(supabase, doc.id, entityId);
      if (!result.ok) throw new Error(result.error.message);
      toast({ title: "Support supprimé" });
      await refresh();
    } catch (error) {
      console.error("[ProgramSupports] handleDelete failed:", error);
      const message =
        error instanceof Error ? error.message : "Impossible de supprimer le support";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  const handleOpenDoc = async (doc: ProgramDocument) => {
    try {
      const url = await fetchSignedDocUrl("program_documents", doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Téléchargement impossible.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="max-w-[1200px] mx-auto">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FolderOpen className="h-4 w-4" />
          Supports de cours
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Fichiers automatiquement publiés aux stagiaires (onglet Docs partagés) de
          toutes les sessions de ce programme.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-2 bg-muted/30 rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => handleOpenDoc(doc)}
                  className="flex items-center gap-2 text-sm hover:underline flex-1 min-w-0 text-left"
                >
                  <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                  <span className="truncate">{doc.file_name}</span>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-red-500 hover:text-red-700 shrink-0"
                  onClick={() => handleDelete(doc)}
                  disabled={deleting === doc.id}
                >
                  {deleting === doc.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
            {documents.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Aucun support</p>
            )}
          </div>
        )}

        <div>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            Ajouter un support
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
