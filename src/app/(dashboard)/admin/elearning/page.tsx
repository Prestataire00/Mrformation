"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { cn, formatDate, truncate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  BookOpen,
  Video,
  FileText,
  HelpCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  GripVertical,
  Globe,
  EyeOff,
  Clock,
  Layers,
  ArrowUp,
  ArrowDown,
  X,
  CheckCircle2,
  BarChart3,
  BookMarked,
  Sparkles,
  Upload,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type ContentType = "video" | "document" | "quiz";
type CourseStatus = "draft" | "published";

interface CourseModule {
  id: string;
  title: string;
  content_type: ContentType;
  content_url: string;
  duration_minutes: number;
}

interface ELearningContent {
  type: "elearning";
  status: CourseStatus;
  modules: CourseModule[];
}

interface Course {
  id: string;
  entity_id: string;
  title: string;
  description: string | null;
  objectives: string | null;
  is_active: boolean;
  content: ELearningContent;
  created_at: string;
  updated_at: string;
}

// AI-generated courses from elearning_courses table
interface AICourse {
  id: string;
  entity_id: string;
  title: string;
  description: string | null;
  status: string;
  generation_status: string;
  estimated_duration_minutes: number;
  created_at: string;
  updated_at: string;
  elearning_chapters: { id: string }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  video: "Vidéo",
  document: "Document",
  quiz: "Quiz",
};

const CONTENT_TYPE_ICONS: Record<ContentType, React.ReactNode> = {
  video: <Video className="h-3.5 w-3.5" />,
  document: <FileText className="h-3.5 w-3.5" />,
  quiz: <HelpCircle className="h-3.5 w-3.5" />,
};

const CONTENT_TYPE_COLORS: Record<ContentType, string> = {
  video: "bg-purple-100 text-purple-700 border-purple-200",
  document: "bg-blue-100 text-blue-700 border-blue-200",
  quiz: "bg-amber-100 text-amber-700 border-amber-200",
};

function totalDuration(modules: CourseModule[]): number {
  return modules.reduce((acc, m) => acc + (m.duration_minutes || 0), 0);
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function newModuleId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Empty states ────────────────────────────────────────────────────────────

const emptyModule = (): CourseModule => ({
  id: newModuleId(),
  title: "",
  content_type: "video",
  content_url: "",
  duration_minutes: 0,
});

interface CourseFormData {
  title: string;
  description: string;
  objectives: string;
  status: CourseStatus;
  modules: CourseModule[];
}

const emptyForm = (): CourseFormData => ({
  title: "",
  description: "",
  objectives: "",
  status: "draft",
  modules: [],
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ELearningPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();

  const [courses, setCourses] = useState<Course[]>([]);
  const [aiCourses, setAiCourses] = useState<AICourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");

  // Course editor dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formData, setFormData] = useState<CourseFormData>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchCourses = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    // Fetch both program-based and AI-generated courses in parallel
    const [programsRes, aiRes] = await Promise.all([
      supabase
        .from("programs")
        .select("*")
        .eq("entity_id", entityId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("elearning_courses")
        .select("id, entity_id, title, description, status, generation_status, estimated_duration_minutes, created_at, updated_at, elearning_chapters(id)")
        .eq("entity_id", entityId)
        .order("updated_at", { ascending: false }),
    ]);

    if (programsRes.error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les cours e-learning.",
        variant: "destructive",
      });
    }

    // Filter only e-learning programs (content.type === "elearning")
    const eLearningCourses = ((programsRes.data as Course[]) || []).filter(
      (p) =>
        p.content &&
        typeof p.content === "object" &&
        (p.content as ELearningContent).type === "elearning"
    );

    setCourses(eLearningCourses);
    setAiCourses((aiRes.data as AICourse[]) || []);
    setLoading(false);
  }, [entityId]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = courses.filter((c) => {
    const matchSearch =
      search === "" ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase());
    const courseStatus = c.content?.status ?? "draft";
    const matchStatus =
      statusFilter === "all" || courseStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Stats ──────────────────────────────────────────────────────────────────

  // Filter AI courses
  const filteredAiCourses = aiCourses.filter((c) => {
    const matchSearch =
      search === "" ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "published" && c.status === "published") ||
      (statusFilter === "draft" && c.status !== "published");
    return matchSearch && matchStatus;
  });

  const totalCourses = courses.length + aiCourses.length;
  const publishedCourses =
    courses.filter((c) => c.content?.status === "published").length +
    aiCourses.filter((c) => c.status === "published").length;
  const totalModules =
    courses.reduce((acc, c) => acc + (c.content?.modules?.length ?? 0), 0) +
    aiCourses.reduce((acc, c) => acc + (c.elearning_chapters?.length ?? 0), 0);

  // ── Dialog handlers ────────────────────────────────────────────────────────

  const openAddDialog = () => {
    setEditingCourse(null);
    setFormData(emptyForm());
    setDialogOpen(true);
  };

  const openEditDialog = (course: Course) => {
    setEditingCourse(course);
    setFormData({
      title: course.title,
      description: course.description || "",
      objectives: course.objectives || "",
      status: course.content?.status ?? "draft",
      modules: course.content?.modules ? [...course.content.modules] : [],
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingCourse(null);
    setFormData(emptyForm());
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({ title: "Titre requis", variant: "destructive" });
      return;
    }
    if (!entityId) {
      toast({ title: "Erreur", description: "Entité non sélectionnée.", variant: "destructive" });
      return;
    }

    // Validate modules
    for (const mod of formData.modules) {
      if (!mod.title.trim()) {
        toast({
          title: "Module incomplet",
          description: "Tous les modules doivent avoir un titre.",
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);

    const content: ELearningContent = {
      type: "elearning",
      status: formData.status,
      modules: formData.modules.map((m, idx) => ({
        ...m,
        id: m.id || newModuleId(),
        duration_minutes: Number(m.duration_minutes) || 0,
        // Ensure order is preserved
        _order: idx,
      })) as CourseModule[],
    };

    const payload = {
      entity_id: entityId,
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      objectives: formData.objectives.trim() || null,
      content,
      updated_at: new Date().toISOString(),
    };

    if (editingCourse) {
      const { error } = await supabase
        .from("programs")
        .update(payload)
        .eq("id", editingCourse.id);

      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Cours mis à jour", description: `"${payload.title}" a été enregistré.` });
    } else {
      const { error } = await supabase.from("programs").insert({
        ...payload,
        version: 1,
        is_active: true,
      });

      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Cours créé", description: `"${payload.title}" a été créé avec succès.` });
    }

    setSaving(false);
    closeDialog();
    await fetchCourses();
  };

  // ── Toggle publish ─────────────────────────────────────────────────────────

  const handleTogglePublish = async (course: Course) => {
    const newStatus: CourseStatus =
      course.content?.status === "published" ? "draft" : "published";
    const newContent: ELearningContent = {
      ...course.content,
      status: newStatus,
    };

    const { error } = await supabase
      .from("programs")
      .update({ content: newContent, updated_at: new Date().toISOString() })
      .eq("id", course.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: newStatus === "published" ? "Cours publié" : "Cours dépublié",
        description: course.title,
      });
      await fetchCourses();
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const openDeleteDialog = (course: Course) => {
    setCourseToDelete(course);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!courseToDelete) return;
    setDeleting(true);

    const { error } = await supabase
      .from("programs")
      .delete()
      .eq("id", courseToDelete.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cours supprimé", description: `"${courseToDelete.title}" a été supprimé.` });
      setDeleteDialogOpen(false);
      setCourseToDelete(null);
      await fetchCourses();
    }
    setDeleting(false);
  };

  // ── Module management ──────────────────────────────────────────────────────

  const addModule = () => {
    setFormData((prev) => ({
      ...prev,
      modules: [...prev.modules, emptyModule()],
    }));
  };

  const removeModule = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      modules: prev.modules.filter((m) => m.id !== id),
    }));
  };

  const updateModule = (id: string, updates: Partial<CourseModule>) => {
    setFormData((prev) => ({
      ...prev,
      modules: prev.modules.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }));
  };

  const moveModule = (id: string, direction: "up" | "down") => {
    setFormData((prev) => {
      const idx = prev.modules.findIndex((m) => m.id === id);
      if (idx === -1) return prev;
      const newModules = [...prev.modules];
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= newModules.length) return prev;
      [newModules[idx], newModules[swapIdx]] = [newModules[swapIdx], newModules[idx]];
      return { ...prev, modules: newModules };
    });
  };

  // ── File upload for module ──────────────────────────────────────────────────

  const [uploadingModuleId, setUploadingModuleId] = useState<string | null>(null);

  const handleModuleFileUpload = async (moduleId: string, file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const validExts = ["pdf", "pptx", "ppt", "docx", "doc", "mp4", "mp3", "txt", "xlsx", "zip"];
    if (!validExts.includes(ext)) {
      toast({ title: "Format non supporté", description: "PDF, PPTX, DOCX, MP4, MP3, XLSX, ZIP acceptés.", variant: "destructive" });
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "Fichier trop volumineux", description: "Maximum 100 Mo.", variant: "destructive" });
      return;
    }
    setUploadingModuleId(moduleId);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `course-modules/${Date.now()}_${safeName}`;
      const { data, error: uploadError } = await supabase.storage
        .from("elearning-documents")
        .upload(storagePath, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      // Generate a signed URL valid for 5 years
      const { data: signedData, error: signedError } = await supabase.storage
        .from("elearning-documents")
        .createSignedUrl(data.path, 157_680_000); // 5 years in seconds
      if (signedError || !signedData?.signedUrl) throw new Error("Impossible de générer l'URL");
      const videoExts = ["mp4", "mp3", "avi", "mov", "webm"];
      const detectedType = videoExts.includes(ext) ? "video" : "document";
      updateModule(moduleId, { content_url: signedData.signedUrl, content_type: detectedType });
      toast({ title: "Fichier uploadé", description: file.name });
    } catch (err) {
      toast({ title: "Erreur upload", description: err instanceof Error ? err.message : "Erreur inconnue", variant: "destructive" });
    } finally {
      setUploadingModuleId(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin" className="text-[#DC2626] hover:underline">
          Accueil
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">E-Learning</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">E-Learning</h1>
          <p className="text-sm text-gray-500 mt-1">
            Créez et gérez vos cours e-learning avec modules, vidéos et quiz.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/elearning/create"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Doc → Cours IA
          </Link>
          <Button onClick={openAddDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau cours
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total cours</p>
            <p className="text-2xl font-bold text-gray-900">{totalCourses}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
            <Globe className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Publiés</p>
            <p className="text-2xl font-bold text-gray-900">{publishedCourses}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total modules</p>
            <p className="text-2xl font-bold text-gray-900">{totalModules}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher un cours..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 border rounded-lg p-1 bg-gray-50 w-fit">
          {(["all", "published", "draft"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                statusFilter === f
                  ? "bg-white shadow-sm text-gray-900 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {f === "all" ? "Tous" : f === "published" ? "Publiés" : "Brouillons"}
            </button>
          ))}
        </div>
      </div>

      {/* Courses Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-60 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 && filteredAiCourses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <BookOpen className="h-10 w-10 text-gray-300" />
          </div>
          <p className="font-semibold text-gray-600 text-lg">
            {search || statusFilter !== "all"
              ? "Aucun cours trouvé"
              : "Créez votre premier cours e-learning"}
          </p>
          <p className="text-sm text-gray-400 mt-1 max-w-sm">
            {search || statusFilter !== "all"
              ? "Essayez de modifier vos filtres de recherche."
              : "Ajoutez des modules vidéo, des documents PDF ou des quiz interactifs à vos cours."}
          </p>
          {!search && statusFilter === "all" && (
            <div className="flex items-center gap-3 mt-6">
              <Link
                href="/admin/elearning/create"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                Créer avec l&apos;IA
              </Link>
              <Button onClick={openAddDialog} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Cours manuel
              </Button>
            </div>
          )}
        </div>
      ) : filtered.length > 0 ? (
        <>
        {filtered.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BookMarked className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-gray-700">Cours manuels</h2>
              <span className="text-xs text-gray-400">({filtered.length})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((course) => {
            const modules = course.content?.modules ?? [];
            const status = course.content?.status ?? "draft";
            const duration = totalDuration(modules);
            const videoCount = modules.filter((m) => m.content_type === "video").length;
            const docCount = modules.filter((m) => m.content_type === "document").length;
            const quizCount = modules.filter((m) => m.content_type === "quiz").length;

            return (
              <Card
                key={course.id}
                className="group hover:shadow-md transition-all duration-200 border-gray-200"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {status === "published" ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200 border text-xs gap-1 font-medium">
                            <Globe className="h-3 w-3" />
                            Publié
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-600 border-gray-200 border text-xs gap-1 font-medium">
                            <EyeOff className="h-3 w-3" />
                            Brouillon
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-base leading-snug">
                        {truncate(course.title, 48)}
                      </CardTitle>
                      {course.description && (
                        <CardDescription className="mt-1 text-xs leading-relaxed">
                          {truncate(course.description, 90)}
                        </CardDescription>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openEditDialog(course)}
                          className="gap-2"
                        >
                          <Pencil className="h-4 w-4" />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleTogglePublish(course)}
                          className="gap-2"
                        >
                          {status === "published" ? (
                            <>
                              <EyeOff className="h-4 w-4" />
                              Dépublier
                            </>
                          ) : (
                            <>
                              <Globe className="h-4 w-4" />
                              Publier
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => openDeleteDialog(course)}
                          className="gap-2 text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Module count pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {videoCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                        <Video className="h-3 w-3" />
                        {videoCount} vidéo{videoCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {docCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                        <FileText className="h-3 w-3" />
                        {docCount} doc{docCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {quizCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        <HelpCircle className="h-3 w-3" />
                        {quizCount} quiz
                      </span>
                    )}
                    {modules.length === 0 && (
                      <span className="text-xs text-gray-400 italic">Aucun module</span>
                    )}
                  </div>

                  {/* Progress bar */}
                  {modules.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-xs text-gray-500">
                        <span>{modules.length} module{modules.length > 1 ? "s" : ""}</span>
                        <span>{formatDuration(duration)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            status === "published" ? "bg-green-500" : "bg-[#DC2626]"
                          )}
                          style={{
                            width: `${Math.min(100, (modules.length / 10) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatDate(course.updated_at)}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(course)}
                      className="h-7 text-xs gap-1.5 border-[#DC2626] text-[#DC2626] hover:bg-[#DC2626]/5"
                    >
                      <Pencil className="h-3 w-3" />
                      Éditer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
            </div>
          </div>
        )}
        </>
      ) : null}

      {/* ── AI-Generated Courses ─────────────────────────────────────────── */}
      {!loading && filteredAiCourses.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <h2 className="text-sm font-semibold text-gray-700">Cours générés par IA</h2>
            <span className="text-xs text-gray-400">({filteredAiCourses.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredAiCourses.map((course) => {
              const chaptersCount = course.elearning_chapters?.length ?? 0;
              const isPublished = course.status === "published";
              const isProcessing = course.generation_status === "generating" || course.generation_status === "extracting";
              const isFailed = course.generation_status === "failed";

              return (
                <Card
                  key={course.id}
                  className="group hover:shadow-md transition-all duration-200 border-gray-200 cursor-pointer"
                  onClick={() => {
                    if (course.generation_status === "completed" || course.status === "draft" || course.status === "published") {
                      window.location.href = `/admin/elearning/courses/${course.id}`;
                    }
                  }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge className="bg-purple-100 text-purple-700 border-purple-200 border text-xs gap-1 font-medium">
                            <Sparkles className="h-3 w-3" />
                            IA
                          </Badge>
                          {isPublished ? (
                            <Badge className="bg-green-100 text-green-700 border-green-200 border text-xs gap-1 font-medium">
                              <Globe className="h-3 w-3" />
                              Publié
                            </Badge>
                          ) : isProcessing ? (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 border text-xs gap-1 font-medium">
                              <Clock className="h-3 w-3" />
                              En cours...
                            </Badge>
                          ) : isFailed ? (
                            <Badge className="bg-red-100 text-red-700 border-red-200 border text-xs gap-1 font-medium">
                              Échoué
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-600 border-gray-200 border text-xs gap-1 font-medium">
                              <EyeOff className="h-3 w-3" />
                              Brouillon
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-base leading-snug">
                          {truncate(course.title, 48)}
                        </CardTitle>
                        {course.description && (
                          <CardDescription className="mt-1 text-xs leading-relaxed">
                            {truncate(course.description, 90)}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {chaptersCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                          <BookOpen className="h-3 w-3" />
                          {chaptersCount} chapitre{chaptersCount > 1 ? "s" : ""}
                        </span>
                      )}
                      {course.estimated_duration_minutes > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                          <Clock className="h-3 w-3" />
                          {formatDuration(course.estimated_duration_minutes)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatDate(course.updated_at)}</span>
                      </div>
                      <Link
                        href={`/admin/elearning/courses/${course.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 h-7 px-3 text-xs font-medium rounded-md border border-[#DC2626] text-[#DC2626] hover:bg-[#DC2626]/5 transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        Éditer
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Course Editor Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-[#DC2626]" />
              {editingCourse ? "Modifier le cours" : "Nouveau cours e-learning"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Course info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="c_title">
                  Titre du cours <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="c_title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Ex : Formation Excel Avancé"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c_desc">Description</Label>
                <Textarea
                  id="c_desc"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  rows={3}
                  placeholder="Décrivez votre cours..."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c_obj">Objectifs pédagogiques</Label>
                <Textarea
                  id="c_obj"
                  value={formData.objectives}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, objectives: e.target.value }))
                  }
                  rows={3}
                  placeholder="À l'issue de ce cours, les apprenants seront capables de..."
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Statut de publication</Label>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, status: "draft" }))
                  }
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                    formData.status === "draft"
                      ? "border-gray-400 bg-gray-100 text-gray-700"
                      : "border-gray-200 text-gray-400 hover:border-gray-300"
                  )}
                >
                  <EyeOff className="h-4 w-4" />
                  Brouillon
                </button>
                <button
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, status: "published" }))
                  }
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                    formData.status === "published"
                      ? "border-green-400 bg-green-50 text-green-700"
                      : "border-gray-200 text-gray-400 hover:border-gray-300"
                  )}
                >
                  <Globe className="h-4 w-4" />
                  Publié
                </button>
              </div>
            </div>

            {/* Modules section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">
                    Modules du cours
                  </Label>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formData.modules.length} module
                    {formData.modules.length !== 1 ? "s" : ""} —{" "}
                    {formatDuration(totalDuration(formData.modules))}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addModule}
                  className="gap-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un module
                </Button>
              </div>

              {formData.modules.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
                  <Layers className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 font-medium">Aucun module</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Cliquez sur &quot;Ajouter un module&quot; pour commencer.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {formData.modules.map((mod, idx) => (
                    <div
                      key={mod.id}
                      className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3"
                    >
                      {/* Module header */}
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                        <span className="text-xs font-semibold text-gray-400 w-6 text-center">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <Input
                            value={mod.title}
                            onChange={(e) =>
                              updateModule(mod.id, { title: e.target.value })
                            }
                            placeholder="Titre du module"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => moveModule(mod.id, "up")}
                            disabled={idx === 0}
                            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
                            title="Monter"
                          >
                            <ArrowUp className="h-3.5 w-3.5 text-gray-500" />
                          </button>
                          <button
                            onClick={() => moveModule(mod.id, "down")}
                            disabled={idx === formData.modules.length - 1}
                            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
                            title="Descendre"
                          >
                            <ArrowDown className="h-3.5 w-3.5 text-gray-500" />
                          </button>
                          <button
                            onClick={() => removeModule(mod.id)}
                            className="p-1 rounded hover:bg-red-100 transition-colors"
                            title="Supprimer"
                          >
                            <X className="h-3.5 w-3.5 text-red-400" />
                          </button>
                        </div>
                      </div>

                      {/* Module fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-8">
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-500">Type de contenu</Label>
                          <Select
                            value={mod.content_type}
                            onValueChange={(v) =>
                              updateModule(mod.id, {
                                content_type: v as ContentType,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="video">
                                <span className="flex items-center gap-2">
                                  <Video className="h-3.5 w-3.5 text-purple-500" />
                                  Vidéo
                                </span>
                              </SelectItem>
                              <SelectItem value="document">
                                <span className="flex items-center gap-2">
                                  <FileText className="h-3.5 w-3.5 text-blue-500" />
                                  Document
                                </span>
                              </SelectItem>
                              <SelectItem value="quiz">
                                <span className="flex items-center gap-2">
                                  <HelpCircle className="h-3.5 w-3.5 text-amber-500" />
                                  Quiz
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1 sm:col-span-1">
                          <Label className="text-xs text-gray-500">Durée (minutes)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={mod.duration_minutes || ""}
                            onChange={(e) =>
                              updateModule(mod.id, {
                                duration_minutes: parseInt(e.target.value) || 0,
                              })
                            }
                            placeholder="30"
                            className="h-8 text-xs"
                          />
                        </div>

                        <div className="space-y-1.5 sm:col-span-3">
                          <Label className="text-xs text-gray-500">
                            Contenu{" "}
                            <span className="text-gray-400">
                              ({mod.content_type === "video"
                                ? "lien vidéo ou fichier"
                                : mod.content_type === "document"
                                ? "lien ou fichier PDF / PPTX / DOCX..."
                                : "lien quiz"})
                            </span>
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              value={mod.content_url}
                              onChange={(e) =>
                                updateModule(mod.id, { content_url: e.target.value })
                              }
                              placeholder={
                                mod.content_type === "video"
                                  ? "https://youtube.com/..."
                                  : mod.content_type === "document"
                                  ? "https://example.com/document.pdf"
                                  : "https://example.com/quiz"
                              }
                              className="h-8 text-xs flex-1"
                            />
                            {(mod.content_type === "document" || mod.content_type === "video") && (
                              <label className={cn(
                                "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-medium cursor-pointer shrink-0 transition-colors",
                                uploadingModuleId === mod.id
                                  ? "border-gray-200 text-gray-400 pointer-events-none"
                                  : "border-[#DC2626] text-[#DC2626] hover:bg-[#DC2626]/5"
                              )}>
                                <input
                                  type="file"
                                  accept=".pdf,.pptx,.ppt,.docx,.doc,.mp4,.mp3,.txt,.xlsx,.zip"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleModuleFileUpload(mod.id, file);
                                    e.target.value = "";
                                  }}
                                />
                                {uploadingModuleId === mod.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Upload className="h-3.5 w-3.5" />
                                )}
                                {uploadingModuleId === mod.id ? "Upload..." : "Fichier"}
                              </label>
                            )}
                          </div>
                          {mod.content_url && mod.content_url.startsWith("https://") && (
                            <a
                              href={mod.content_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-[#DC2626] hover:underline"
                            >
                              <LinkIcon className="h-3 w-3" />
                              Aperçu du lien
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Type badge */}
                      <div className="pl-8">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium",
                            CONTENT_TYPE_COLORS[mod.content_type]
                          )}
                        >
                          {CONTENT_TYPE_ICONS[mod.content_type]}
                          {CONTENT_TYPE_LABELS[mod.content_type]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ background: "#DC2626" }}
              className="text-white hover:opacity-90"
            >
              {saving
                ? "Enregistrement..."
                : editingCourse
                ? "Mettre à jour"
                : "Créer le cours"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ───────────────────────────────────── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Supprimer le cours
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Supprimer{" "}
            <strong>&quot;{courseToDelete?.title}&quot;</strong> ? Cette action est
            irréversible et supprimera tous les modules associés.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setCourseToDelete(null);
              }}
            >
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
