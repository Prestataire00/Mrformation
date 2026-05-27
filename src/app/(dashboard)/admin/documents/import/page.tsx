"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEntity } from "@/contexts/EntityContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { DOC_TYPE_OPTIONS } from "@/lib/templates/doc-type-options";
import { DocumentsTabsNav } from "../_components/DocumentsTabsNav";

interface TemplateUpload {
  file: File;
  name: string;
  docType: string;
  defaultForDocType: boolean;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

export default function DocumentsImportPage() {
  const router = useRouter();
  const { entityId } = useEntity();
  const { toast } = useToast();
  const [uploads, setUploads] = useState<TemplateUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newUploads: TemplateUpload[] = Array.from(files)
      .filter((f) => /\.(docx|doc|pdf)$/i.test(f.name))
      .map((f) => ({
        file: f,
        name: f.name.replace(/\.(docx|doc|pdf)$/i, ""),
        docType: "",
        defaultForDocType: false,
        status: "pending",
      }));
    setUploads((prev) => [...prev, ...newUploads]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
        // Reset l'input pour permettre de re-sélectionner le même fichier
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [addFiles],
  );

  const updateUpload = useCallback(
    (index: number, patch: Partial<TemplateUpload>) => {
      setUploads((prev) =>
        prev.map((u, i) => (i === index ? { ...u, ...patch } : u)),
      );
    },
    [],
  );

  const removeUpload = useCallback((index: number) => {
    setUploads((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!entityId) {
      toast({
        title: "Erreur",
        description: "Aucune entité sélectionnée.",
        variant: "destructive",
      });
      return;
    }

    // Validation : tous les uploads doivent avoir un docType et un nom
    const invalid = uploads.filter(
      (u) => !u.docType || !u.name.trim(),
    );
    if (invalid.length > 0) {
      toast({
        title: "Validation",
        description: `${invalid.length} template(s) sans type ou nom. Complète avant l'import.`,
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < uploads.length; i++) {
      if (uploads[i].status === "done") continue;
      updateUpload(i, { status: "uploading" });

      try {
        const formData = new FormData();
        formData.append("file", uploads[i].file);
        formData.append("name", uploads[i].name.trim());
        formData.append("docType", uploads[i].docType);
        formData.append(
          "defaultForDocType",
          uploads[i].defaultForDocType ? "true" : "false",
        );

        const res = await fetch("/api/documents/templates/import", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Échec");

        updateUpload(i, { status: "done" });
        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateUpload(i, { status: "error", error: message });
        errorCount++;
      }
    }

    setIsUploading(false);
    toast({
      title: `Import terminé`,
      description: `${successCount} succès, ${errorCount} erreur(s)`,
      variant: errorCount > 0 ? "destructive" : "default",
    });

    if (errorCount === 0) {
      setTimeout(() => router.push("/admin/documents"), 1500);
    }
  }, [entityId, uploads, updateUpload, toast, router]);

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <DocumentsTabsNav />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Import de templates de documents</h1>
        <p className="text-sm text-muted-foreground">
          Importe en lot tes modèles Word (.docx) ou PDF. Chaque template
          devient disponible immédiatement pour la génération depuis les fiches
          formation. Cf{" "}
          <a
            href="/admin/documents/how-to"
            className="text-blue-600 underline"
            target="_blank"
          >
            guide d&apos;utilisation
          </a>{" "}
          pour la création d&apos;un template Word avec variables{" "}
          <code>{`{{xxx}}`}</code>.
        </p>
      </div>

      {/* Drop zone */}
      <Card>
        <CardContent
          className={cn(
            "border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors",
            isDragOver
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400 hover:bg-gray-50",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
          <p className="text-sm font-medium text-gray-700">
            Glisse-dépose tes fichiers ici ou clique pour les sélectionner
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Formats acceptés : .docx, .doc, .pdf — Max 5 MB par fichier
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".docx,.doc,.pdf"
            className="hidden"
            onChange={handleFileInput}
          />
        </CardContent>
      </Card>

      {/* Liste des fichiers en attente d'import */}
      {uploads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {uploads.length} template(s) à importer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {uploads.map((u, i) => (
              <div
                key={i}
                className={cn(
                  "border rounded-lg p-4 space-y-3",
                  u.status === "done" && "border-green-300 bg-green-50/50",
                  u.status === "error" && "border-red-300 bg-red-50/50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-600 truncate">
                      {u.file.name}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      ({(u.file.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.status === "done" && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                    {u.status === "error" && (
                      <AlertCircle className="h-4 w-4 text-red-600" />
                    )}
                    {u.status === "uploading" && (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    )}
                    {u.status === "pending" && (
                      <button
                        onClick={() => removeUpload(i)}
                        className="text-gray-400 hover:text-red-600"
                        aria-label="Retirer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {u.status === "error" && (
                  <p className="text-xs text-red-600">{u.error}</p>
                )}

                {u.status !== "done" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor={`name-${i}`} className="text-xs">
                        Nom du template
                      </Label>
                      <Input
                        id={`name-${i}`}
                        value={u.name}
                        onChange={(e) =>
                          updateUpload(i, { name: e.target.value })
                        }
                        placeholder="Ex : Convention DPC OPCO 2026"
                        className="h-9 text-sm"
                        disabled={u.status === "uploading"}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`type-${i}`} className="text-xs">
                        Type de document
                      </Label>
                      <Select
                        value={u.docType}
                        onValueChange={(v) =>
                          updateUpload(i, { docType: v })
                        }
                        disabled={u.status === "uploading"}
                      >
                        <SelectTrigger className="h-9 text-sm" id={`type-${i}`}>
                          <SelectValue placeholder="Choisir un type…" />
                        </SelectTrigger>
                        <SelectContent>
                          {DOC_TYPE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={u.defaultForDocType}
                          onCheckedChange={(v) =>
                            updateUpload(i, {
                              defaultForDocType: v === true,
                            })
                          }
                          disabled={u.status === "uploading"}
                        />
                        Template par défaut pour ce type
                      </label>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setUploads([])}
                disabled={isUploading}
              >
                Vider la liste
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isUploading || uploads.length === 0}
                className="gap-2"
              >
                {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                Importer {uploads.length} template(s)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
