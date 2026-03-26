"use client";

import { useEffect, useState, useCallback } from "react";
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
  Loader2,
  Globe,
  Lock,
  Eye,
  EyeOff,
  FileText,
} from "lucide-react";
import { FileUploader } from "./FileUploader";
import { FileItem } from "./FileItem";
import type { UploadedFile } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrainerCourse {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: "draft" | "published";
  files: UploadedFile[];
  created_at: string;
  updated_at: string;
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
  const [files, setFiles] = useState<UploadedFile[]>(course?.files ?? []);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

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

  const handleDownloadFile = async (file: UploadedFile) => {
    if (!course?.id) return;
    const res = await fetch(
      `/api/trainer/courses/${course.id}/file-url?path=${encodeURIComponent(file.path)}`
    );
    if (!res.ok) throw new Error("Impossible de générer le lien");
    const { url } = await res.json();
    window.open(url, "_blank", "noopener,noreferrer");
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

          <div className="space-y-2">
            <Label>Fichiers du cours</Label>
            <FileUploader
              trainerId={trainerId}
              storagePrefix="trainer-courses"
              onFileAdded={(f) => setFiles((prev) => [...prev, f])}
            />
            {files.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {files.map((f, i) => (
                  <FileItem
                    key={i}
                    file={f}
                    onDownload={course?.id ? () => handleDownloadFile(f) : undefined}
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

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function CourseMaterialsTab({ trainerId }: { trainerId: string }) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<TrainerCourse[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<TrainerCourse | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trainer/courses");
      const json = await res.json();
      setCourses(json.data ?? []);
    } catch {
      toast({ title: "Erreur de chargement", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

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

  const handleDownloadFile = async (courseId: string, file: UploadedFile) => {
    const res = await fetch(
      `/api/trainer/courses/${courseId}/file-url?path=${encodeURIComponent(file.path)}`
    );
    if (!res.ok) throw new Error("Impossible de générer le lien");
    const { url } = await res.json();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Stats
  const published = courses.filter((c) => c.status === "published").length;
  const totalFiles = courses.reduce((acc, c) => acc + (c.files?.length ?? 0), 0);

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
          Publiez vos supports de cours (PPTX, PDF, vidéos…) pour vos apprenants
        </p>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEdit(course)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
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

              {(course.files?.length ?? 0) > 0 && (
                <CardContent className="pt-0">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Fichiers ({course.files.length})
                    </p>
                    {course.files.map((f, i) => (
                      <FileItem
                        key={i}
                        file={f}
                        onDownload={() => handleDownloadFile(course.id, f)}
                      />
                    ))}
                  </div>
                </CardContent>
              )}

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
