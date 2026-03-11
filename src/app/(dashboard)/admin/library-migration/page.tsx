"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Clock,
  Target,
  ChevronDown,
  ChevronRight,
  Download,
  RotateCcw,
  Link2,
  X,
  Check,
  PlayCircle,
  Library,
  Search,
} from "lucide-react";

interface ParsedModule {
  id: number;
  title: string;
  duration_hours: number;
  objectives: string[];
  topics: string[];
}

interface ParsedProgram {
  title: string;
  description: string;
  objectives: string;
  days: { label: string; modules: { title: string; duration_hours: number; topics: string[] }[] }[];
  duration_hours: number;
  duration_days: number;
  target_audience: string;
  prerequisites: string;
  evaluation_methods: string[];
  pedagogical_resources: string[];
  content: {
    modules?: ParsedModule[];
    [key: string]: unknown;
  };
}

interface ProgramMatch {
  id: string;
  title: string;
  score: number;
  version: number;
}

interface ProgramOption {
  id: string;
  title: string;
}

type MigrationStatus = "migrated" | "partial" | "empty";

interface ProgramMigrationInfo {
  id: string;
  title: string;
  status: MigrationStatus;
  module_count: number;
  has_objectives: boolean;
  has_description: boolean;
  has_content: boolean;
  is_active: boolean;
  updated_at: string;
}

interface MigrationStats {
  total: number;
  migrated: number;
  partial: number;
  empty: number;
}

type FileStatus = "pending" | "extracting" | "ready" | "applying" | "done" | "error";

interface FileEntry {
  id: string;
  file: File;
  status: FileStatus;
  error?: string;
  extracted_text?: string;
  parsed?: ParsedProgram;
  match?: ProgramMatch | null;
  programs?: ProgramOption[];
  selectedProgramId: string;
  // Editable
  editTitle: string;
  editObjectives: string;
  editContent: string;
}

function ProgramSearchSelect({
  programs,
  selectedId,
  matchId,
  onSelect,
}: {
  programs: ProgramOption[];
  selectedId: string;
  matchId?: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedTitle = programs.find((p) => p.id === selectedId)?.title || "";

  const filtered = programs.filter((p) =>
    !query || p.title.toLowerCase().includes(query.toLowerCase())
  );

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <Input
          value={open ? query : selectedTitle}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          placeholder="Rechercher un programme..."
          className="pl-9 pr-8 text-sm"
        />
        {selectedId && !open && (
          <button
            onClick={() => { onSelect(""); setQuery(""); setOpen(true); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200"
          >
            <X className="h-3.5 w-3.5 text-gray-400" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-400 text-center">
              Aucun programme trouvé
            </div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onSelect(p.id);
                  setQuery("");
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2",
                  p.id === selectedId && "bg-blue-50 font-medium text-blue-700",
                )}
              >
                <span className="flex-1 truncate">{p.title}</span>
                {p.id === matchId && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-green-300 text-green-600">
                    auto
                  </Badge>
                )}
                {p.id === selectedId && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function LibraryMigrationPage() {
  const { toast } = useToast();

  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [showSqlDialog, setShowSqlDialog] = useState(false);
  const [sqlContent, setSqlContent] = useState("");

  // Program migration status
  const [programsList, setProgramsList] = useState<ProgramMigrationInfo[]>([]);
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | MigrationStatus>("all");
  const [programSearch, setProgramSearch] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  const fetchPrograms = useCallback(async () => {
    setLoadingPrograms(true);
    try {
      const res = await fetch("/api/library-migration");
      const data = await res.json();
      if (res.ok) {
        setProgramsList(data.programs);
        setStats(data.stats);
      }
    } catch {
      // silent
    } finally {
      setLoadingPrograms(false);
    }
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const updateFile = useCallback((id: string, updates: Partial<FileEntry>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  const extractFile = useCallback(async (entry: FileEntry) => {
    updateFile(entry.id, { status: "extracting" });

    try {
      const formData = new FormData();
      formData.append("file", entry.file);

      const res = await fetch("/api/library-migration", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'extraction");
      }

      updateFile(entry.id, {
        status: "ready",
        extracted_text: data.extracted_text,
        parsed: data.parsed,
        match: data.match,
        programs: data.programs,
        selectedProgramId: data.match?.id || "",
        editTitle: data.parsed.title || "",
        editObjectives: data.parsed.objectives || "",
        editContent: JSON.stringify(data.parsed.content, null, 2),
      });
    } catch (err) {
      updateFile(entry.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }, [updateFile]);

  const handleFiles = useCallback(async (fileList: FileList) => {
    const pdfFiles = Array.from(fileList).filter((f) =>
      f.name.toLowerCase().endsWith(".pdf")
    );

    if (pdfFiles.length === 0) {
      toast({ title: "Aucun PDF", description: "Seuls les fichiers PDF sont acceptés.", variant: "destructive" });
      return;
    }

    const newEntries: FileEntry[] = pdfFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      status: "pending" as const,
      selectedProgramId: "",
      editTitle: "",
      editObjectives: "",
      editContent: "",
    }));

    setFiles((prev) => [...prev, ...newEntries]);

    // Extract all in parallel
    for (const entry of newEntries) {
      extractFile(entry);
    }
  }, [toast, extractFile]);

  const applyFile = useCallback(async (entry: FileEntry) => {
    if (!entry.selectedProgramId || !entry.parsed) return false;

    updateFile(entry.id, { status: "applying" });

    try {
      let contentParsed;
      try {
        contentParsed = JSON.parse(entry.editContent);
      } catch {
        updateFile(entry.id, { status: "ready", error: "JSON invalide" });
        return false;
      }

      const res = await fetch("/api/library-migration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program_id: entry.selectedProgramId,
          title: entry.editTitle,
          description: "",
          objectives: entry.editObjectives,
          content: contentParsed,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      updateFile(entry.id, { status: "done" });
      fetchPrograms(); // Refresh migration status
      return true;
    } catch (err) {
      updateFile(entry.id, {
        status: "ready",
        error: err instanceof Error ? err.message : "Erreur",
      });
      return false;
    }
  }, [updateFile, fetchPrograms]);

  const handleApplyAll = async () => {
    const readyFiles = files.filter((f) => f.status === "ready" && f.selectedProgramId);
    if (readyFiles.length === 0) return;

    setApplyingAll(true);
    let success = 0;

    for (const entry of readyFiles) {
      const ok = await applyFile(entry);
      if (ok) success++;
    }

    toast({
      title: `${success}/${readyFiles.length} programmes mis à jour`,
      description: success === readyFiles.length ? "Migration terminée !" : "Certains fichiers ont échoué.",
      variant: success === readyFiles.length ? "default" : "destructive",
    });

    setApplyingAll(false);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const clearDone = () => {
    setFiles((prev) => prev.filter((f) => f.status !== "done"));
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  };

  const readyCount = files.filter((f) => f.status === "ready" && f.selectedProgramId).length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const extractingCount = files.filter((f) => f.status === "extracting").length;
  const pendingFiles = files.filter((f) => f.status !== "done");

  const getStatusIcon = (status: FileStatus) => {
    switch (status) {
      case "pending":
      case "extracting":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "ready":
        return <FileText className="h-4 w-4 text-blue-500" />;
      case "applying":
        return <Loader2 className="h-4 w-4 text-orange-500 animate-spin" />;
      case "done":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusLabel = (entry: FileEntry) => {
    switch (entry.status) {
      case "pending": return "En attente...";
      case "extracting": return "Extraction...";
      case "ready":
        if (entry.match && entry.match.score >= 0.5) return entry.match.title;
        if (entry.selectedProgramId && entry.programs) {
          const p = entry.programs.find((p) => p.id === entry.selectedProgramId);
          return p ? p.title : "Sélectionnez un programme";
        }
        return "Sélectionnez un programme";
      case "applying": return "Application...";
      case "done": return "Migré !";
      case "error": return entry.error || "Erreur";
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Migration Bibliothèque PDF
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Glissez vos PDFs pour extraire et associer leur contenu aux programmes existants.
          </p>
        </div>
        {files.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {doneCount > 0 && (
              <Badge className="bg-green-100 text-green-700 border-green-200">
                {doneCount} migré{doneCount > 1 ? "s" : ""}
              </Badge>
            )}
            {extractingCount > 0 && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                {extractingCount} en cours
              </Badge>
            )}
            {readyCount > 0 && (
              <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                {readyCount} prêt{readyCount > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Drop Zone - always visible */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-200",
          files.length > 0 ? "p-6" : "p-12",
          isDragging
            ? "border-blue-500 bg-blue-50 scale-[1.01]"
            : "border-gray-300 hover:border-blue-400 hover:bg-gray-50",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={onFileChange}
          className="hidden"
        />
        <div className={cn("space-y-2", files.length > 0 && "flex items-center gap-3 space-y-0")}>
          <Upload className={cn("text-gray-400 mx-auto", files.length > 0 ? "h-6 w-6 mx-0" : "h-12 w-12")} />
          <div>
            <p className={cn("font-medium text-gray-700", files.length > 0 ? "text-sm" : "text-base")}>
              {files.length > 0 ? "Ajouter d'autres PDFs" : "Glissez vos PDFs de la bibliothèque ici"}
            </p>
            {files.length === 0 && (
              <p className="text-sm text-gray-400 mt-1">
                ou cliquez pour sélectionner — plusieurs fichiers acceptés
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action bar */}
      {pendingFiles.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              {pendingFiles.length} fichier{pendingFiles.length > 1 ? "s" : ""}
            </span>
            {doneCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearDone} className="text-xs gap-1">
                <X className="h-3 w-3" />
                Retirer les migrés
              </Button>
            )}
          </div>
          <Button
            onClick={handleApplyAll}
            disabled={readyCount === 0 || applyingAll}
            className="gap-2"
          >
            {applyingAll ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Application...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" />
                Tout appliquer ({readyCount})
              </>
            )}
          </Button>
        </div>
      )}

      {/* Migration Status Overview */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-gray-50 rounded-lg border text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-center">
            <p className="text-2xl font-bold text-green-700">{stats.migrated}</p>
            <p className="text-xs text-green-600">Migrés</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-center">
            <p className="text-2xl font-bold text-amber-700">{stats.partial}</p>
            <p className="text-xs text-amber-600">Partiels</p>
          </div>
          <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-center">
            <p className="text-2xl font-bold text-red-700">{stats.empty}</p>
            <p className="text-xs text-red-600">Vides</p>
          </div>
        </div>
      )}

      {/* File list */}
      <div className="space-y-2">
        {files.map((entry) => (
          <div key={entry.id} className="border rounded-lg overflow-hidden">
            {/* File row */}
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors",
                entry.status === "done" && "bg-green-50/50",
                entry.status === "error" && "bg-red-50/50",
              )}
              onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
            >
              {getStatusIcon(entry.status)}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {entry.file.name}
                  </span>
                  {entry.parsed && (
                    <span className="text-xs text-gray-400 shrink-0">
                      {entry.parsed.duration_days}j / {entry.parsed.duration_hours}h / {entry.parsed.content.modules?.length || 0} mod.
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-xs",
                    entry.status === "done" ? "text-green-600" :
                    entry.status === "error" ? "text-red-600" :
                    entry.match && entry.match.score >= 0.5 ? "text-green-600" :
                    "text-gray-500"
                  )}>
                    {getStatusLabel(entry)}
                  </span>
                  {entry.match && entry.status === "ready" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {Math.round(entry.match.score * 100)}%
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {entry.status === "ready" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={(e) => { e.stopPropagation(); applyFile(entry); }}
                    disabled={!entry.selectedProgramId}
                  >
                    <Check className="h-3 w-3" />
                    Appliquer
                  </Button>
                )}
                {entry.status !== "applying" && entry.status !== "extracting" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); removeFile(entry.id); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
                {expandedId === entry.id ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </div>

            {/* Expanded details */}
            {expandedId === entry.id && entry.status === "ready" && entry.parsed && (
              <div className="border-t bg-gray-50/50 p-4 space-y-4">
                {/* Program selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Programme cible</Label>
                  <ProgramSearchSelect
                    programs={entry.programs || []}
                    selectedId={entry.selectedProgramId}
                    matchId={entry.match?.id}
                    onSelect={(id) => updateFile(entry.id, { selectedProgramId: id })}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Title */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Titre</Label>
                    <Input
                      value={entry.editTitle}
                      onChange={(e) => updateFile(entry.id, { editTitle: e.target.value })}
                      className="text-sm"
                    />
                  </div>
                  {/* Duration info */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Durée</Label>
                    <div className="flex items-center gap-4 text-sm text-gray-700 h-9 px-3">
                      <span>{entry.parsed.duration_days} jour{entry.parsed.duration_days > 1 ? "s" : ""}</span>
                      <span>{entry.parsed.duration_hours}h total</span>
                      <span>{entry.parsed.content.modules?.length || 0} modules</span>
                    </div>
                  </div>
                </div>

                {/* Objectives */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Objectifs pédagogiques</Label>
                  <Textarea
                    value={entry.editObjectives}
                    onChange={(e) => updateFile(entry.id, { editObjectives: e.target.value })}
                    rows={3}
                    className="text-sm"
                  />
                </div>

                {/* Modules preview */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Modules extraits ({entry.parsed.content.modules?.length || 0})</Label>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {entry.parsed.content.modules?.map((mod: ParsedModule, idx: number) => (
                      <div key={idx} className="p-2 bg-white rounded border text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">
                            {mod.id}. {mod.title}
                          </span>
                          {mod.duration_hours > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {mod.duration_hours}h
                            </Badge>
                          )}
                        </div>
                        {mod.topics.length > 0 && (
                          <ul className="mt-1 text-gray-500">
                            {mod.topics.slice(0, 3).map((t: string, ti: number) => (
                              <li key={ti}>• {t}</li>
                            ))}
                            {mod.topics.length > 3 && (
                              <li className="text-gray-400">+ {mod.topics.length - 3} autres...</li>
                            )}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* JSON editor (collapsed) */}
                <details>
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                    Contenu JSON (éditable)
                  </summary>
                  <Textarea
                    value={entry.editContent}
                    onChange={(e) => updateFile(entry.id, { editContent: e.target.value })}
                    rows={12}
                    className="mt-2 font-mono text-xs"
                  />
                </details>

                {/* Raw text */}
                {entry.extracted_text && (
                  <details>
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                      Texte brut extrait
                    </summary>
                    <pre className="mt-2 p-3 bg-white rounded border text-xs text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {entry.extracted_text}
                    </pre>
                  </details>
                )}

                {entry.error && (
                  <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                    {entry.error}
                  </div>
                )}
              </div>
            )}

            {/* Error details when expanded */}
            {expandedId === entry.id && entry.status === "error" && (
              <div className="border-t bg-red-50/50 p-4">
                <p className="text-sm text-red-700">{entry.error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1.5"
                  onClick={() => extractFile(entry)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Réessayer
                </Button>
              </div>
            )}

            {/* Done details */}
            {expandedId === entry.id && entry.status === "done" && (
              <div className="border-t bg-green-50/50 p-4">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Programme mis à jour avec succès
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Programs migration status list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Library className="h-5 w-5" />
              État des programmes
            </CardTitle>
            <div className="flex gap-1 border rounded-lg p-0.5 bg-gray-50">
              {([
                { key: "all" as const, label: "Tous" },
                { key: "empty" as const, label: "Vides" },
                { key: "partial" as const, label: "Partiels" },
                { key: "migrated" as const, label: "Migrés" },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-md transition-colors",
                    statusFilter === key
                      ? "bg-white shadow-sm text-gray-900 font-medium"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Rechercher un programme..."
              value={programSearch}
              onChange={(e) => setProgramSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loadingPrograms ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Chargement...
            </div>
          ) : (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {programsList
                .filter((p) => statusFilter === "all" || p.status === statusFilter)
                .filter((p) => !programSearch || p.title.toLowerCase().includes(programSearch.toLowerCase()))
                .map((program) => (
                  <div
                    key={program.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm",
                      program.status === "migrated" && "bg-green-50/50",
                      program.status === "partial" && "bg-amber-50/50",
                      program.status === "empty" && "bg-red-50/30",
                    )}
                  >
                    {program.status === "migrated" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : program.status === "partial" ? (
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-red-400 shrink-0" />
                    )}

                    <span className="flex-1 truncate text-gray-900">
                      {program.title}
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      {program.module_count > 0 && (
                        <span className="text-xs text-gray-400">
                          {program.module_count} mod.
                        </span>
                      )}
                      {!program.has_objectives && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-600">
                          pas d&apos;objectifs
                        </Badge>
                      )}
                      {!program.has_content && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-300 text-red-600">
                          pas de contenu
                        </Badge>
                      )}
                      <Badge
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          program.status === "migrated" && "bg-green-100 text-green-700 border-green-200",
                          program.status === "partial" && "bg-amber-100 text-amber-700 border-amber-200",
                          program.status === "empty" && "bg-red-100 text-red-700 border-red-200",
                        )}
                      >
                        {program.status === "migrated" ? "Migré" : program.status === "partial" ? "Partiel" : "Vide"}
                      </Badge>
                    </div>
                  </div>
                ))}
              {programsList
                .filter((p) => statusFilter === "all" || p.status === statusFilter)
                .filter((p) => !programSearch || p.title.toLowerCase().includes(programSearch.toLowerCase()))
                .length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">
                  Aucun programme trouvé
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
