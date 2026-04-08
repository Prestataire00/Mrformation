"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  EyeOff,
  FileText,
  Globe,
  HelpCircle,
  History,
  Link2,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
  Youtube,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface QuizQuestion {
  id: string;
}

interface Quiz {
  id: string;
  passing_score: number;
  elearning_quiz_questions: QuizQuestion[];
}

interface Chapter {
  id: string;
  title: string;
  summary: string | null;
  key_concepts: string[] | null;
  order_index: number;
  estimated_duration_minutes: number;
  gamma_deck_id: string | null;
  gamma_deck_url: string | null;
  gamma_embed_url: string | null;
  gamma_export_pdf: string | null;
  gamma_export_pptx: string | null;
  gamma_slide_start: number | null;
  is_enriched: boolean;
  elearning_quizzes: Quiz[];
}

interface GenerationLogEntry {
  step: string;
  timestamp: string;
  message: string;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  objectives: string | null;
  status: string;
  generation_status: string | null;
  estimated_duration_minutes: number;
  source_file_name: string | null;
  source_file_url: string | null;
  source_file_type: string | null;
  course_type: string | null;
  num_chapters: number | null;
  generation_log: GenerationLogEntry[] | null;
  created_at: string;
  updated_at: string;
  final_exam_passing_score: number;
  gamma_embed_url: string | null;
  gamma_deck_url: string | null;
  gamma_deck_id: string | null;
  gamma_export_pptx: string | null;
  elearning_chapters: Chapter[];
}

const STATUS_COLORS: Record<string, string> = {
  processing: "bg-yellow-100 text-yellow-700 border-yellow-200",
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  review: "bg-blue-100 text-blue-700 border-blue-200",
  published: "bg-green-100 text-green-700 border-green-200",
  archived: "bg-red-100 text-red-600 border-red-200",
};

export default function CourseEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const courseId = params.courseId as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishLoading, setPublishLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);

  // Duration editing
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationValue, setDurationValue] = useState("");
  const [savingDuration, setSavingDuration] = useState(false);

  // Gamma regeneration
  const [gammaLoading, setGammaLoading] = useState(false);

  const fetchCourse = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/elearning/${courseId}?shallow=true`);
    const { data, error } = await res.json();
    if (error) {
      toast({ title: "Erreur", description: error, variant: "destructive" });
      setLoading(false);
      return;
    }
    if (data.elearning_chapters) {
      data.elearning_chapters.sort((a: Chapter, b: Chapter) => a.order_index - b.order_index);
    }
    setCourse(data);
    setLoading(false);
  }, [courseId, toast]);

  useEffect(() => { fetchCourse(); }, [fetchCourse]);

  const handleDelete = async () => {
    setDeleteLoading(true);
    const res = await fetch(`/api/elearning/${courseId}`, { method: "DELETE" });
    const { error } = await res.json();
    if (error) {
      toast({ title: "Erreur", description: error, variant: "destructive" });
      setDeleteLoading(false);
    } else {
      toast({ title: "Cours supprimé" });
      router.push("/admin/elearning");
    }
  };

  const handleTogglePublish = async () => {
    setPublishLoading(true);
    const res = await fetch(`/api/elearning/${courseId}/publish`, { method: "PATCH" });
    const { data, error } = await res.json();
    if (error) {
      toast({ title: "Erreur", description: error, variant: "destructive" });
    } else {
      toast({ title: data.status === "published" ? "Cours publié" : "Cours dépublié" });
      fetchCourse();
    }
    setPublishLoading(false);
  };

  const handleSaveDuration = async () => {
    const mins = parseInt(durationValue, 10);
    if (isNaN(mins) || mins < 1) {
      toast({ title: "Durée invalide", variant: "destructive" });
      return;
    }
    setSavingDuration(true);
    const res = await fetch(`/api/elearning/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimated_duration_minutes: mins }),
    });
    const { error } = await res.json();
    if (error) {
      toast({ title: "Erreur", description: error, variant: "destructive" });
    } else {
      setCourse((prev) => prev ? { ...prev, estimated_duration_minutes: mins } : prev);
      toast({ title: "Durée mise à jour" });
    }
    setSavingDuration(false);
    setEditingDuration(false);
  };

  const handleGenerateGamma = async () => {
    setGammaLoading(true);
    try {
      const res = await fetch(`/api/elearning/${courseId}/gamma`, { method: "POST" });
      const { data, error } = await res.json();
      if (error) {
        toast({ title: "Erreur Gamma", description: error, variant: "destructive" });
      } else {
        toast({ title: "Présentation Gamma générée", description: `Deck créé pour ${data.chapters_count} chapitres` });
        fetchCourse();
      }
    } catch {
      toast({ title: "Erreur", description: "Erreur lors de la génération Gamma", variant: "destructive" });
    }
    setGammaLoading(false);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-[#374151] animate-spin" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Cours non trouvé</p>
        <Button className="mt-4" onClick={() => router.push("/admin/elearning")}>Retour</Button>
      </div>
    );
  }

  const chapters = course.elearning_chapters || [];
  const totalQuestions = chapters.reduce(
    (acc, ch) => acc + ch.elearning_quizzes.reduce((a, q) => a + q.elearning_quiz_questions.length, 0),
    0
  );
  const hasGammaDeck = !!course.gamma_embed_url || chapters.some((ch) => ch.gamma_deck_url);
  // Un deck par chapitre → 1 appel API par chapitre
  const gammaApiCalls = chapters.filter((ch) => !!ch.gamma_deck_url).length || (course.gamma_embed_url ? 1 : 0);
  const hasContent = chapters.length > 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin" className="text-[#374151] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/elearning" className="text-[#374151] hover:underline">E-Learning</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500 truncate max-w-xs">{course.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge className={cn("border text-xs", STATUS_COLORS[course.status] || STATUS_COLORS.draft)}>
              {course.status === "published" ? (
                <><Globe className="h-3 w-3 mr-1" />Publié</>
              ) : course.status === "draft" ? (
                <><EyeOff className="h-3 w-3 mr-1" />Brouillon</>
              ) : (
                course.status
              )}
            </Badge>
            {course.generation_status === "completed" && (
              <Badge className="bg-purple-100 text-purple-700 border-purple-200 border text-xs gap-1">
                <Sparkles className="h-3 w-3" /> Généré par IA
              </Badge>
            )}
            {hasGammaDeck && (
              <Badge className="bg-violet-100 text-violet-700 border-violet-200 border text-xs gap-1">
                <Sparkles className="h-3 w-3" /> Présentation Gamma
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{course.title}</h1>
          {course.description && (
            <p className="text-sm text-gray-500 mt-1">{course.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Button variant="outline" onClick={() => router.push("/admin/elearning")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Button>
          {!showDeleteConfirm ? (
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(true)}
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Supprimer
            </Button>
          ) : (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <span className="text-sm text-red-700 font-medium">Confirmer ?</span>
              <Button
                size="sm"
                disabled={deleteLoading}
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white h-7 px-2 gap-1"
              >
                {deleteLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Oui
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                className="h-7 px-2"
              >
                Non
              </Button>
            </div>
          )}
          <Button
            onClick={handleTogglePublish}
            disabled={publishLoading}
            className={cn(
              "gap-2 text-white",
              course.status === "published" ? "bg-gray-500 hover:bg-gray-600" : "bg-green-500 hover:bg-green-600"
            )}
          >
            {publishLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : course.status === "published" ? (
              <><EyeOff className="h-4 w-4" /> Dépublier</>
            ) : (
              <><Globe className="h-4 w-4" /> Publier</>
            )}
          </Button>
        </div>
      </div>

      {/* Launch course button — always visible when chapters exist */}
      {hasContent && (
        <div className="bg-gradient-to-r from-[#374151]/10 to-blue-50 border border-[#374151]/20 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {course.status === "published" ? "Tester le cours en mode apprenant" : "Prévisualiser le cours"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Parcours complet : slides Gamma, flashcards et quiz interactifs</p>
          </div>
          <Link href={`/learner/courses/${courseId}`}>
            <Button className="gap-2 bg-[#374151] hover:opacity-90 text-white">
              <Play className="h-4 w-4" /> Lancer le cours
            </Button>
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: BookOpen, label: "Chapitres", value: chapters.length, color: "text-blue-600 bg-blue-50", editable: false },
          { icon: HelpCircle, label: "Questions quiz", value: totalQuestions, color: "text-amber-600 bg-amber-50", editable: false },
          ...(course.course_type !== "quiz" ? [{ icon: Sparkles, label: "Présentation Gamma", value: hasGammaDeck ? `${gammaApiCalls} deck${gammaApiCalls > 1 ? "s" : ""}` : "Aucune", color: hasGammaDeck ? "text-violet-600 bg-violet-50" : "text-gray-400 bg-gray-50", editable: false }] : []),
          { icon: Clock, label: "Durée estimée", value: `${course.estimated_duration_minutes || 0} min`, color: "text-gray-600 bg-gray-50", editable: true },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3 relative group">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", stat.color)}>
              <stat.icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500">{stat.label}</p>
              {stat.editable && editingDuration ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={durationValue}
                    onChange={(e) => setDurationValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveDuration();
                      if (e.key === "Escape") setEditingDuration(false);
                    }}
                    className="w-16 h-7 text-sm font-bold text-gray-900 border border-gray-300 rounded px-1.5 focus:outline-none focus:border-[#374151]"
                    autoFocus
                  />
                  <span className="text-xs text-gray-500">min</span>
                  <button
                    onClick={handleSaveDuration}
                    disabled={savingDuration}
                    className="w-6 h-6 rounded bg-green-500 text-white flex items-center justify-center hover:bg-green-600"
                  >
                    {savingDuration ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  </button>
                  <button
                    onClick={() => setEditingDuration(false)}
                    className="w-6 h-6 rounded bg-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <p className="text-lg font-bold text-gray-900">{stat.value}</p>
                  {stat.editable && (
                    <button
                      onClick={() => {
                        setEditingDuration(true);
                        setDurationValue(String(course.estimated_duration_minutes || 0));
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded hover:bg-gray-100 flex items-center justify-center"
                      title="Modifier la durée"
                    >
                      <Edit3 className="h-3 w-3 text-gray-400" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Gamma generate/regenerate */}
      {hasContent && !hasGammaDeck && course.course_type !== "quiz" && (
        <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-violet-700 flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Aucune présentation Gamma
            </p>
            <p className="text-xs text-violet-500 mt-0.5">
              Génère une présentation par chapitre (~40 crédits chacune)
            </p>
          </div>
          <Button
            onClick={handleGenerateGamma}
            disabled={gammaLoading}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
          >
            {gammaLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Génération en cours...</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Générer Gamma</>
            )}
          </Button>
        </div>
      )}

      {/* Gamma API info */}
      {hasGammaDeck && course.course_type !== "quiz" && (
        <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-violet-700 flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4" /> Informations Gamma API
          </p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-violet-500">Appels API</p>
              <p className="font-semibold text-gray-900">{gammaApiCalls} génération{gammaApiCalls > 1 ? "s" : ""}</p>
            </div>
            <div>
              <p className="text-xs text-violet-500">Crédits estimés</p>
              <p className="font-semibold text-gray-900">~{gammaApiCalls * 40} crédits</p>
            </div>
            <div>
              <p className="text-xs text-violet-500">Coût estimé</p>
              <p className="font-semibold text-gray-900">~{(gammaApiCalls * 0.50).toFixed(2)} $</p>
            </div>
          </div>
          <p className="text-[11px] text-violet-400 mt-2">
            1 appel API Gamma par chapitre (~40 crédits, ~0.50 $ chacun). Plan Gamma Plus : 400 crédits/mois inclus.
          </p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {course.gamma_deck_url && (
              <a href={course.gamma_deck_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-violet-700 border-violet-200 hover:bg-violet-50">
                  <ExternalLink className="h-3.5 w-3.5" /> Voir / Éditer dans Gamma
                </Button>
              </a>
            )}
            {course.gamma_deck_id ? (
              <>
                <a href={`/api/elearning/${course.id}/download-pptx`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-orange-600 border-orange-200 hover:bg-orange-50">
                    <Download className="h-3.5 w-3.5" /> Télécharger PPTX
                  </Button>
                </a>
                <a href={`/api/elearning/${course.id}/download-pdf`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-red-600 border-red-200 hover:bg-red-50">
                    <Download className="h-3.5 w-3.5" /> Télécharger PDF
                  </Button>
                </a>
              </>
            ) : (
              <Button variant="outline" size="sm" disabled className="gap-1.5 text-xs h-8 text-gray-400 border-gray-200">
                <Download className="h-3.5 w-3.5" /> PPTX / PDF (prochaine génération)
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateGamma}
              disabled={gammaLoading}
              className="gap-1.5 text-xs h-8 text-violet-700 border-violet-200 hover:bg-violet-50"
            >
              {gammaLoading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Régénération...</>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5" /> Régénérer Gamma</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Chapters with Gamma presentations */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">
          {course.course_type === "presentation" ? "Présentation Gamma" : "Chapitres & Présentations"}
        </h2>

        {chapters.length === 0 ? (
          course.course_type === "presentation" && hasGammaDeck ? (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-700">
                    Mode Présentation — le contenu est directement généré sous forme de slides Gamma, sans chapitres textuels.
                  </p>
                </div>
                {course.gamma_deck_id && (
                  <div className="flex items-center gap-2 shrink-0">
                    <a href={`/api/elearning/${course.id}/download-pptx`} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-orange-600 border-orange-200 hover:bg-orange-50">
                        <Download className="h-3.5 w-3.5" /> PPTX
                      </Button>
                    </a>
                    <a href={`/api/elearning/${course.id}/download-pdf`} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-red-600 border-red-200 hover:bg-red-50">
                        <Download className="h-3.5 w-3.5" /> PDF
                      </Button>
                    </a>
                  </div>
                )}
              </div>
              {course.gamma_embed_url && (
                <div className="aspect-video bg-gray-900 rounded-xl overflow-hidden">
                  <iframe
                    src={course.gamma_embed_url}
                    className="w-full h-full border-0"
                    allow="fullscreen"
                    title={course.title}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <BookOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Aucun chapitre généré</p>
            </div>
          )
        ) : (
          <div className="space-y-2">
            {chapters.map((ch, i) => {
              const isExpanded = expandedChapter === ch.id;
              const questionsCount = ch.elearning_quizzes.reduce((a, q) => a + q.elearning_quiz_questions.length, 0);
              const hasGamma = !!ch.gamma_deck_url || !!ch.gamma_embed_url;
              const embedUrl = ch.gamma_embed_url || (ch.gamma_deck_url ? ch.gamma_deck_url.replace("/docs/", "/embed/") : null);

              return (
                <div key={ch.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* Chapter header */}
                  <button
                    onClick={() => setExpandedChapter(isExpanded ? null : ch.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#374151] to-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{ch.title}</p>
                        {ch.is_enriched && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">enrichi</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {ch.estimated_duration_minutes} min
                        </span>
                        {questionsCount > 0 && (
                          <span className="flex items-center gap-1">
                            <HelpCircle className="h-3 w-3" /> {questionsCount} questions
                          </span>
                        )}
                        {hasGamma && (
                          <span className="flex items-center gap-1 text-violet-600">
                            <Sparkles className="h-3 w-3" /> Gamma
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {hasGamma && (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      {/* Download/link buttons */}
                      {hasGamma && (
                        <div className="flex items-center gap-2 px-5 py-3 bg-violet-50/50 border-b border-gray-100">
                          {/* PPTX + PDF download via API re-fetch */}
                          {ch.gamma_deck_id && (
                            <>
                              <a href={`/api/elearning/${course.id}/download-pptx?chapterId=${ch.id}`} target="_blank" rel="noopener noreferrer">
                                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-orange-600 border-orange-200 hover:bg-orange-50">
                                  <Download className="h-3.5 w-3.5" /> Télécharger PPTX
                                </Button>
                              </a>
                              <a href={`/api/elearning/${course.id}/download-pdf?chapterId=${ch.id}`} target="_blank" rel="noopener noreferrer">
                                <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-red-600 border-red-200 hover:bg-red-50">
                                  <Download className="h-3.5 w-3.5" /> Télécharger PDF
                                </Button>
                              </a>
                            </>
                          )}
                          {/* Edit: use chapter or course deck URL */}
                          {(ch.gamma_deck_url || course.gamma_deck_url) && (
                            <a href={(ch.gamma_deck_url || course.gamma_deck_url)!} target="_blank" rel="noopener noreferrer">
                              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-violet-700 border-violet-200 hover:bg-violet-50">
                                <ExternalLink className="h-3.5 w-3.5" /> Modifier dans Gamma
                              </Button>
                            </a>
                          )}
                        </div>
                      )}

                      {/* Gamma embed */}
                      {embedUrl ? (
                        <div className="aspect-video bg-gray-900">
                          <iframe
                            src={embedUrl}
                            className="w-full h-full border-0"
                            allow="fullscreen"
                            title={`Présentation - ${ch.title}`}
                          />
                        </div>
                      ) : course.course_type !== "quiz" ? (
                        <div className="p-8 text-center">
                          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                            <Sparkles className="h-6 w-6 text-gray-400" />
                          </div>
                          <p className="text-sm text-gray-500">
                            Pas de présentation Gamma pour ce chapitre
                          </p>
                          {ch.summary && (
                            <p className="text-xs text-gray-400 mt-2 max-w-md mx-auto">{ch.summary}</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Source & Historique */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <History className="h-4 w-4 text-gray-400" /> Source & Historique de génération
        </h3>

        {/* Source info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {course.source_file_type && (
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                {course.source_file_type === "youtube" ? (
                  <Youtube className="h-4 w-4 text-red-500" />
                ) : course.source_file_type === "webpage" ? (
                  <Link2 className="h-4 w-4 text-blue-500" />
                ) : course.source_file_type === "text/plain" ? (
                  <FileText className="h-4 w-4 text-gray-500" />
                ) : (
                  <Upload className="h-4 w-4 text-orange-500" />
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500">Type de source</p>
                <p className="text-gray-700 font-medium">
                  {course.source_file_type === "youtube" ? "Vidéo YouTube"
                    : course.source_file_type === "webpage" ? "Page web"
                    : course.source_file_type === "text/plain" ? "Prompt / Texte"
                    : course.source_file_type === "application/pdf" ? "Document PDF"
                    : course.source_file_type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ? "Présentation PPTX"
                    : course.source_file_type || "Inconnu"}
                </p>
              </div>
            </div>
          )}

          {course.source_file_url && (
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                <Link2 className="h-4 w-4 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Source</p>
                <a
                  href={`/api/elearning/${course.id}/source-url`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm truncate block max-w-xs"
                  title={course.source_file_url}
                >
                  {course.source_file_name || course.source_file_url}
                </a>
              </div>
            </div>
          )}

          {course.course_type && (
            <div>
              <p className="text-xs text-gray-500">Mode de génération</p>
              <p className="text-gray-700 font-medium">
                {course.course_type === "complete" ? "Complet (Quiz + Gamma)"
                  : course.course_type === "presentation" ? "Présentation seule"
                  : course.course_type === "quiz" ? "Quiz seul"
                  : course.course_type}
              </p>
            </div>
          )}

          {course.num_chapters && (
            <div>
              <p className="text-xs text-gray-500">Chapitres demandés</p>
              <p className="text-gray-700 font-medium">{course.num_chapters} chapitres</p>
            </div>
          )}

          <div>
            <p className="text-xs text-gray-500">Créé le</p>
            <p className="text-gray-700">{formatDate(course.created_at)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Dernière modification</p>
            <p className="text-gray-700">{formatDate(course.updated_at)}</p>
          </div>
        </div>

        {/* Objectives */}
        {course.objectives && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Objectifs</p>
            <p className="text-sm text-gray-700 whitespace-pre-line bg-gray-50 rounded-lg p-3">{course.objectives}</p>
          </div>
        )}

        {/* Generation log */}
        {course.generation_log && course.generation_log.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Journal de génération</p>
            <div className="space-y-1.5">
              {course.generation_log.map((entry, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-700">{entry.message}</p>
                    <p className="text-gray-400 text-[10px]">
                      {new Date(entry.timestamp).toLocaleString("fr-FR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
