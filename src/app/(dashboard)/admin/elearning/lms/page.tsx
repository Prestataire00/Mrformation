"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  Upload,
  ExternalLink,
  BookOpen,
  Video,
  FileText,
  HelpCircle,
  Globe,
  EyeOff,
  Layers,
  Clock,
  BarChart3,
  TrendingUp,
  ArrowLeft,
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
  content: ELearningContent;
  created_at: string;
  updated_at: string;
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
  video: "bg-purple-100 text-purple-700",
  document: "bg-blue-100 text-blue-700",
  quiz: "bg-amber-100 text-amber-700",
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LMSPage() {
  const supabase = createClient();
  const { entityId, entity } = useEntity();
  const { toast } = useToast();

  // Course data
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // Activation form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchCourses = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("programs")
      .select("*")
      .eq("entity_id", entityId)
      .order("updated_at", { ascending: false });

    if (error) {
      setLoading(false);
      return;
    }

    const eLearningCourses = ((data as Course[]) || []).filter(
      (p) =>
        p.content &&
        typeof p.content === "object" &&
        (p.content as ELearningContent).type === "elearning"
    );

    setCourses(eLearningCourses);
    setLoading(false);
  }, [entityId]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // ── Computed stats ─────────────────────────────────────────────────────────

  const publishedCourses = courses.filter(
    (c) => c.content?.status === "published"
  );
  const draftCourses = courses.filter((c) => c.content?.status === "draft");
  const allModules = courses.flatMap((c) => c.content?.modules ?? []);
  const totalModuleCount = allModules.length;
  const totalDurationAll = totalDuration(allModules);

  const videoCount = allModules.filter((m) => m.content_type === "video").length;
  const docCount = allModules.filter((m) => m.content_type === "document").length;
  const quizCount = allModules.filter((m) => m.content_type === "quiz").length;

  // ── Activation form ────────────────────────────────────────────────────────

  const handleActivationSubmit = async () => {
    if (!username.trim()) {
      toast({
        title: "Erreur",
        description: "Le nom d'utilisateur LMS est requis.",
        variant: "destructive",
      });
      return;
    }
    if (password && password.length < 8) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 8 caractères.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    // Store activation request in activity_log if entity exists
    if (entityId) {
      await supabase.from("activity_log").insert({
        entity_id: entityId,
        action: "lms_activation_request",
        resource_type: "lms",
        details: {
          username: username.trim(),
          entity_name: entity?.name,
          requested_at: new Date().toISOString(),
        },
      });
    }

    // Simulate async processing
    await new Promise((res) => setTimeout(res, 1000));

    setSubmitting(false);
    setUsername("");
    setPassword("");

    toast({
      title: "Demande envoyée",
      description:
        "Votre demande d'activation LMS & SCORM a été enregistrée. Nous reviendrons vers vous sous 48h.",
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin" className="text-[#3DB5C5] hover:underline">
          Accueil
        </Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/elearning" className="text-[#3DB5C5] hover:underline">
          E-Learning
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">LMS & SCORM</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">LMS & SCORM</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestion de la plateforme LMS et import de contenus SCORM.
          </p>
        </div>
        <Link
          href="/admin/elearning"
          className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux cours
        </Link>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-4 w-4 text-[#3DB5C5]" />
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Cours total
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {loading ? "—" : courses.length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-4 w-4 text-green-500" />
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Publiés
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {loading ? "—" : publishedCourses.length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="h-4 w-4 text-purple-500" />
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Modules
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {loading ? "—" : totalModuleCount}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Durée totale
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {loading ? "—" : formatDuration(totalDurationAll)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Course Library */}
        <div className="lg:col-span-2 space-y-4">
          {/* Content breakdown */}
          {!loading && totalModuleCount > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#3DB5C5]" />
                  Répartition des contenus
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { type: "video", count: videoCount, label: "Vidéos", color: "bg-purple-500" },
                    { type: "document", count: docCount, label: "Documents", color: "bg-blue-500" },
                    { type: "quiz", count: quizCount, label: "Quiz", color: "bg-amber-500" },
                  ].map(({ type, count, label, color }) => (
                    <div key={type} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="flex items-center gap-1.5 text-gray-600 font-medium">
                          {CONTENT_TYPE_ICONS[type as ContentType]}
                          {label}
                        </span>
                        <span className="text-gray-500">{count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", color)}
                          style={{
                            width: totalModuleCount > 0
                              ? `${Math.round((count / totalModuleCount) * 100)}%`
                              : "0%",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Published courses list */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="h-4 w-4 text-green-500" />
                  Cours publiés
                </CardTitle>
                <Badge className="bg-green-100 text-green-700 border-green-200 border text-xs">
                  {publishedCourses.length} actif{publishedCourses.length !== 1 ? "s" : ""}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : publishedCourses.length === 0 ? (
                <div className="text-center py-8">
                  <Globe className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Aucun cours publié</p>
                  <p className="text-xs text-gray-300 mt-1">
                    Publiez vos cours depuis la{" "}
                    <Link
                      href="/admin/elearning"
                      className="text-[#3DB5C5] hover:underline"
                    >
                      page e-learning
                    </Link>
                    .
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {publishedCourses.map((course) => {
                    const modules = course.content?.modules ?? [];
                    const dur = totalDuration(modules);
                    return (
                      <div
                        key={course.id}
                        className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {course.title}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <Layers className="h-3 w-3" />
                              {modules.length} module{modules.length !== 1 ? "s" : ""}
                            </span>
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(dur)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <div className="flex gap-1">
                            {["video", "document", "quiz"].map((t) => {
                              const cnt = modules.filter(
                                (m) => m.content_type === t
                              ).length;
                              if (cnt === 0) return null;
                              return (
                                <span
                                  key={t}
                                  className={cn(
                                    "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium",
                                    CONTENT_TYPE_COLORS[t as ContentType]
                                  )}
                                >
                                  {CONTENT_TYPE_ICONS[t as ContentType]}
                                  {cnt}
                                </span>
                              );
                            })}
                          </div>
                          <Badge className="bg-green-100 text-green-700 border-green-200 border text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Publié
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Draft courses list */}
          {!loading && draftCourses.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <EyeOff className="h-4 w-4 text-gray-400" />
                    Brouillons
                  </CardTitle>
                  <Badge className="bg-gray-100 text-gray-600 border-gray-200 border text-xs">
                    {draftCourses.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {draftCourses.map((course) => {
                    const modules = course.content?.modules ?? [];
                    return (
                      <div
                        key={course.id}
                        className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors opacity-70"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">
                            {course.title}
                          </p>
                          <span className="text-xs text-gray-400">
                            {modules.length} module{modules.length !== 1 ? "s" : ""} — Modifié le{" "}
                            {formatDate(course.updated_at)}
                          </span>
                        </div>
                        <Badge className="bg-gray-100 text-gray-500 border-gray-200 border text-xs shrink-0 ml-2">
                          <EyeOff className="h-3 w-3 mr-1" />
                          Brouillon
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: LMS Activation */}
        <div className="space-y-4">
          {/* Warning banner */}
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-800 font-semibold text-sm mb-1">
                Intégration SCORM
              </p>
              <p className="text-amber-700 text-xs leading-relaxed">
                L&apos;import SCORM (Moodle, Articulate, iSpring) nécessite
                une activation. Remplissez le formulaire pour en faire la demande.
              </p>
            </div>
          </div>

          {/* Activation form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Demande d&apos;activation LMS
              </CardTitle>
              <CardDescription className="text-xs">
                Nous activerons votre accès sous 48h ouvrées.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="lms_user" className="text-xs font-medium">
                  Nom d&apos;utilisateur LMS{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lms_user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ex : mr-formation-admin"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lms_pass" className="text-xs font-medium">
                  Mot de passe souhaité
                </Label>
                <Input
                  id="lms_pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 caractères"
                  className="h-8 text-sm"
                />
                <p className="text-xs text-gray-400">
                  Minimum 8 caractères, avec majuscule et chiffre.
                </p>
              </div>
              <Button
                onClick={handleActivationSubmit}
                disabled={submitting}
                className="w-full text-white"
                style={{ background: "#3DB5C5" }}
              >
                {submitting ? "Envoi en cours..." : "Demander l'activation"}
              </Button>
            </CardContent>
          </Card>

          {/* SCORM info */}
          <Card className="bg-gray-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Qu&apos;est-ce que SCORM ?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {[
                  "Import SCORM 1.2 / 2004 (Articulate, iSpring, Lectora)",
                  "Suivi de progression des apprenants en temps réel",
                  "Délivrance de certificats automatiques",
                  "Compatible Moodle, Blackboard, Canvas",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3DB5C5] mt-1.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="https://scorm.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#3DB5C5] hover:underline mt-3"
              >
                En savoir plus sur SCORM
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>

          {/* Quick link */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
            <TrendingUp className="h-6 w-6 text-blue-400 mx-auto mb-2" />
            <p className="text-xs text-blue-700 font-medium">
              Créez vos premiers cours e-learning natifs sans SCORM
            </p>
            <Link
              href="/admin/elearning"
              className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 font-semibold hover:underline"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Gérer mes cours
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
