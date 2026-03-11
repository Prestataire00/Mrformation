"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Upload,
  FileText,
  X,
  Loader2,
  Globe,
  Lock,
  Download,
  Eye,
  EyeOff,
  FilePlus,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CourseFile {
  name: string;
  type: string;
  size: number;
  path: string;
}

interface TrainerCourse {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: "draft" | "published";
  files: CourseFile[];
  created_at: string;
  updated_at: string;
}

// ─── File Upload Component ────────────────────────────────────────────────────

function FileUploader({
  trainerId,
  onFileAdded,
}: {
  trainerId: string;
  onFileAdded: (file: CourseFile) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleUpload = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const validExts = ["pdf", "pptx", "ppt", "docx", "doc", "mp4", "mp3", "zip"];
      if (!validExts.includes(ext)) {
        setError("Format non supporté. Acceptés : PDF, PPTX, DOCX, MP4, MP3, ZIP");
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        setError("Fichier trop volumineux (max 100 Mo)");
        return;
      }

      setError(null);
      setUploading(true);
      setProgress(20);

      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `trainer-courses/${trainerId}/${Date.now()}_${safeName}`;

        setProgress(40);

        const { data, error: uploadError } = await supabase.storage
          .from("elearning-documents")
          .upload(storagePath, file, { cacheControl: "3600", upsert: false });

        if (uploadError) throw new Error(uploadError.message);

        setProgress(100);
        setUploading(false);

        onFileAdded({
          name: file.name,
          type: ext,
          size: file.size,
          path: data.path,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur lors de l'upload");
        setUploading(false);
        setProgress(0);
      }
    },
    [trainerId, supabase, onFileAdded]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary hover:bg-muted/30",
          uploading && "pointer-events-none opacity-60"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.pptx,.ppt,.docx,.doc,.mp4,.mp3,.zip"
          onChange={onFileChange}
          className="hidden"
        />
        {uploading ? (
          <div className="space-y-2">
            <Loader2 className="h-7 w-7 text-primary animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground">Upload en cours... {progress}%</p>
            <div className="h-1.5 bg-muted rounded-full max-w-[160px] mx-auto overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <FilePlus className="h-7 w-7 text-muted-foreground mx-auto" />
            <p className="text-xs font-medium">Glissez un fichier ou cliquez</p>
            <p className="text-[11px] text-muted-foreground">PDF, PPTX, DOCX, MP4, MP3, ZIP — 100 Mo max</p>
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>
      )}
    </div>
  );
}

// ─── File List Item ───────────────────────────────────────────────────────────

function FileItem({
  file,
  courseId,
  onRemove,
}: {
  file: CourseFile;
  courseId?: string;
  onRemove?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/trainer/courses/${courseId}/file-url?path=${encodeURIComponent(file.path)}`
      );
      if (!res.ok) throw new Error("Impossible de générer le lien");
      const { url } = await res.json();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      alert("Impossible d'ouvrir le fichier");
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const TYPE_COLORS: Record<string, string> = {
    pdf: "text-red-600",
    pptx: "text-orange-600",
    ppt: "text-orange-600",
    docx: "text-blue-600",
    doc: "text-blue-600",
    mp4: "text-purple-600",
    mp3: "text-green-600",
    zip: "text-gray-600",
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
      <FileText className={cn("h-4 w-4 shrink-0", TYPE_COLORS[file.type] ?? "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{file.name}</p>
        <p className="text-[11px] text-muted-foreground">{formatSize(file.size)} · {file.type.toUpperCase()}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {courseId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleDownload}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          </Button>
        )}
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Course Form Dialog ────────────────────────────────────────────────────────

function CourseDialog({
  open,
  onClose,
  onSaved,
  trainerId,
  course,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (course: TrainerCourse) => void;
  trainerId: string;
  course?: TrainerCourse;
}) {
  const [title, setTitle] = useState(course?.title ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [category, setCategory] = useState(course?.category ?? "");
  const [files, setFiles] = useState<CourseFile[]>(course?.files ?? []);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setTitle(course?.title ?? "");
      setDescription(course?.description ?? "");
      setCategory(course?.category ?? "");
      setFiles(course?.files ?? []);
    }
  }, [open, course]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Titre requis", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const method = course ? "PUT" : "POST";
      const url = course
        ? `/api/trainer/courses/${course.id}`
        : "/api/trainer/courses";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, category, files }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");

      toast({ title: course ? "Cours mis à jour" : "Cours créé" });
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
          <DialogTitle>{course ? "Modifier le cours" : "Nouveau cours"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Titre *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Maîtriser Excel en 2h"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Catégorie</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex: Bureautique, Soft skills, Technique..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez le contenu et les objectifs du cours..."
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <Label>Fichiers du cours</Label>
            <FileUploader
              trainerId={trainerId}
              onFileAdded={(f) => setFiles((prev) => [...prev, f])}
            />
            {files.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {files.map((f, i) => (
                  <FileItem
                    key={i}
                    file={f}
                    courseId={course?.id}
                    onRemove={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {course ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TrainerCoursesPage() {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<TrainerCourse[]>([]);
  const [trainerId, setTrainerId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<TrainerCourse | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── fetch data ───────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: trainer } = await supabase
        .from("trainers")
        .select("id")
        .eq("profile_id", user.id)
        .single();

      if (trainer) setTrainerId(trainer.id);

      const res = await fetch("/api/trainer/courses");
      const json = await res.json();
      setCourses(json.data ?? []);
    } catch {
      toast({ title: "Erreur de chargement", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── actions ──────────────────────────────────────────────────────────────────

  const handleToggleStatus = async (course: TrainerCourse) => {
    const newStatus = course.status === "draft" ? "published" : "draft";
    setTogglingId(course.id);
    try {
      const res = await fetch(`/api/trainer/courses/${course.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCourses((prev) =>
        prev.map((c) => (c.id === course.id ? { ...c, status: newStatus } : c))
      );
      toast({
        title: newStatus === "published" ? "Cours publié" : "Cours repassé en brouillon",
      });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (courseId: string) => {
    if (!confirm("Supprimer ce cours ? Cette action est irréversible.")) return;
    setDeletingId(courseId);
    try {
      const res = await fetch(`/api/trainer/courses/${courseId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur lors de la suppression");
      setCourses((prev) => prev.filter((c) => c.id !== courseId));
      toast({ title: "Cours supprimé" });
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

  const handleSaved = (saved: TrainerCourse) => {
    setCourses((prev) => {
      const exists = prev.find((c) => c.id === saved.id);
      if (exists) return prev.map((c) => (c.id === saved.id ? saved : c));
      return [saved, ...prev];
    });
  };

  const openCreate = () => {
    setEditingCourse(undefined);
    setDialogOpen(true);
  };

  const openEdit = (course: TrainerCourse) => {
    setEditingCourse(course);
    setDialogOpen(true);
  };

  // ── stats ────────────────────────────────────────────────────────────────────

  const published = courses.filter((c) => c.status === "published").length;
  const drafts = courses.filter((c) => c.status === "draft").length;
  const totalFiles = courses.reduce((acc, c) => acc + (c.files?.length ?? 0), 0);

  // ── render ───────────────────────────────────────────────────────────────────

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mes Cours</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Publiez vos supports de cours (PPTX, PDF, vidéos…) pour vos apprenants
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nouveau cours
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{courses.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Globe className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Publiés</p>
                <p className="text-2xl font-bold">{published}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <FileText className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fichiers</p>
                <p className="text-2xl font-bold">{totalFiles}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Course list */}
      {courses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <BookOpen className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">Aucun cours pour le moment</p>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Créez votre premier cours et uploadez vos supports (PPTX, PDF, vidéos…) pour les partager avec vos apprenants.
            </p>
            <Button onClick={openCreate} className="gap-2 mt-2">
              <Plus className="h-4 w-4" />
              Créer mon premier cours
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {courses.map((course) => (
            <Card key={course.id} className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base leading-tight">{course.title}</CardTitle>
                      {course.category && (
                        <Badge variant="secondary" className="text-[11px] shrink-0">
                          {course.category}
                        </Badge>
                      )}
                      <Badge
                        className={cn(
                          "text-[11px] shrink-0",
                          course.status === "published"
                            ? "bg-green-100 text-green-800 hover:bg-green-100"
                            : "bg-orange-100 text-orange-800 hover:bg-orange-100"
                        )}
                      >
                        {course.status === "published" ? (
                          <><Globe className="h-3 w-3 mr-1" />Publié</>
                        ) : (
                          <><Lock className="h-3 w-3 mr-1" />Brouillon</>
                        )}
                      </Badge>
                    </div>
                    {course.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {course.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Publish toggle */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => handleToggleStatus(course)}
                      disabled={togglingId === course.id}
                    >
                      {togglingId === course.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : course.status === "published" ? (
                        <><EyeOff className="h-3.5 w-3.5" />Dépublier</>
                      ) : (
                        <><Eye className="h-3.5 w-3.5" />Publier</>
                      )}
                    </Button>
                    {/* Edit */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEdit(course)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
                      onClick={() => handleDelete(course.id)}
                      disabled={deletingId === course.id}
                    >
                      {deletingId === course.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Files */}
              {(course.files?.length ?? 0) > 0 && (
                <CardContent className="pt-0">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Fichiers ({course.files.length})
                    </p>
                    {course.files.map((f, i) => (
                      <FileItem key={i} file={f} courseId={course.id} />
                    ))}
                  </div>
                </CardContent>
              )}

              {/* Empty files state */}
              {(course.files?.length ?? 0) === 0 && (
                <CardContent className="pt-0">
                  <button
                    onClick={() => openEdit(course)}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Ajouter des fichiers
                  </button>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      {dialogOpen && (
        <CourseDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={handleSaved}
          trainerId={trainerId}
          course={editingCourse}
        />
      )}
    </div>
  );
}
