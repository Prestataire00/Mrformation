"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import FileUploadZone from "@/components/elearning/FileUploadZone";
import GenerationProgress from "@/components/elearning/GenerationProgress";
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  Sparkles,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  PenLine,
  Globe,
  Trash2,
  Presentation,
  BrainCircuit,
  BookOpen,
  GraduationCap,
  Palette,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Types ----------
type CreationMethod = "generate" | "paste" | "import";
type ImportSource = "upload" | "url";
type CourseType = "presentation" | "quiz" | "complete";
type ViewStep = "method" | "import" | "configure" | "generate" | "done";

// ---------- Data ----------
const CREATION_METHODS = [
  {
    id: "generate" as CreationMethod,
    title: "Générer depuis un prompt",
    description: "Décrivez votre formation et l'IA génère tout le contenu automatiquement",
    icon: Sparkles,
    badge: "RECOMMANDÉ",
    gradient: "from-orange-300 via-pink-300 to-purple-400",
    iconBg: "bg-gradient-to-br from-orange-400 to-purple-500",
  },
  {
    id: "paste" as CreationMethod,
    title: "Coller votre contenu",
    description: "Fournissez vos notes, plan de cours ou contenu détaillé à transformer",
    icon: PenLine,
    gradient: "from-purple-400 via-indigo-400 to-blue-500",
    iconBg: "bg-gradient-to-br from-purple-500 to-indigo-600",
  },
  {
    id: "import" as CreationMethod,
    title: "Importer un fichier ou une URL",
    description: "Importez un PDF, PowerPoint, page web ou vidéo YouTube",
    icon: Upload,
    gradient: "from-green-300 via-teal-300 to-blue-400",
    iconBg: "bg-gradient-to-br from-green-400 to-blue-500",
  },
];

const COURSE_TYPES = [
  {
    id: "presentation" as CourseType,
    title: "Présentation Gamma",
    icon: Presentation,
    description: "Slides interactives générées par Gamma AI",
  },
  {
    id: "quiz" as CourseType,
    title: "Quiz interactif",
    icon: BrainCircuit,
    description: "Quiz et flashcards pour tester les connaissances",
  },
  {
    id: "complete" as CourseType,
    title: "Cours complet",
    icon: GraduationCap,
    description: "Présentation Gamma + Quiz + Examen final",
  },
];

// Map color keyword strings to actual CSS colors for theme preview
const COLOR_MAP: Record<string, string> = {
  // Basic
  black: "#1a1a2e", dark: "#1e293b", noir: "#1a1a2e", charcoal: "#374151", obsidian: "#0f172a",
  white: "#f8fafc", light: "#f1f5f9", cream: "#fef9ef", ivory: "#fffff0",
  // Grays
  gray: "#6b7280", grey: "#6b7280", silver: "#cbd5e1", slate: "#64748b", ash: "#9ca3af",
  // Blues
  blue: "#3b82f6", navy: "#1e3a5f", "dark blue": "#1e3a5f", "light blue": "#93c5fd",
  sky: "#38bdf8", azure: "#0ea5e9", cobalt: "#2563eb", indigo: "#6366f1", midnight: "#1e1b4b",
  // Greens
  green: "#22c55e", "lime green": "#84cc16", lime: "#a3e635", emerald: "#10b981",
  teal: "#14b8a6", mint: "#6ee7b7", sage: "#86efac", forest: "#166534", olive: "#84cc16",
  // Reds
  red: "#ef4444", crimson: "#dc2626", scarlet: "#ef4444", ruby: "#e11d48", maroon: "#881337",
  // Pinks
  pink: "#ec4899", salmon: "#fb7185", rose: "#f43f5e", magenta: "#d946ef", fuchsia: "#d946ef",
  blush: "#fda4af", coral: "#fb7185",
  // Oranges
  orange: "#f97316", amber: "#f59e0b", tangerine: "#fb923c", peach: "#fdba74", copper: "#d97706",
  // Yellows
  yellow: "#eab308", gold: "#ca8a04", golden: "#ca8a04", lemon: "#facc15", mustard: "#ca8a04",
  // Purples
  purple: "#a855f7", violet: "#8b5cf6", lavender: "#c4b5fd", plum: "#9333ea",
  mauve: "#c084fc", lilac: "#d8b4fe", amethyst: "#9333ea",
  // Browns
  brown: "#92400e", chocolate: "#78350f", mocha: "#92400e", tan: "#d2b48c", beige: "#f5f5dc",
  // Misc
  neon: "#39ff14", "neon green": "#39ff14", cyan: "#06b6d4", turquoise: "#2dd4bf",
  gradient: "#8b5cf6", holographic: "#c084fc", pastel: "#ddd6fe", muted: "#94a3b8",
  warm: "#f59e0b", cool: "#38bdf8", earth: "#92400e", earthy: "#a3703c",
  // Pearlescent / special
  "pearlescent white": "#e8e4ef", pearlescent: "#e8e4ef",
};

function keywordToColor(keyword: string): string {
  const kw = keyword.toLowerCase().trim();
  // Direct match
  if (COLOR_MAP[kw]) return COLOR_MAP[kw];
  // Partial match: try to find a keyword that's contained in the string
  for (const [key, val] of Object.entries(COLOR_MAP)) {
    if (kw.includes(key) || key.includes(kw)) return val;
  }
  return "#94a3b8"; // default slate
}

export default function CreateCoursePage() {
  const router = useRouter();
  const { toast } = useToast();

  // Navigation
  const [viewStep, setViewStep] = useState<ViewStep>("method");
  const [method, setMethod] = useState<CreationMethod | null>(null);
  const [courseType, setCourseType] = useState<CourseType>("complete");

  // Common
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Generate mode (prompt)
  const [prompt, setPrompt] = useState("");

  // Paste mode
  const [pastedText, setPastedText] = useState("");

  // Import mode
  const [importSource, setImportSource] = useState<ImportSource>("upload");
  const [uploadedFile, setUploadedFile] = useState<{
    name: string; url: string; type: string; size: number;
  } | null>(null);
  const [importUrl, setImportUrl] = useState("");

  // Extraction
  const [extractedText, setExtractedText] = useState("");
  const [wordCount, setWordCount] = useState(0);

  // Gamma theme & template
  const [gammaThemes, setGammaThemes] = useState<{ id: string; name: string; type: string; colorKeywords?: string[]; toneKeywords?: string[] }[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState<string>("");
  const [themesLoading, setThemesLoading] = useState(false);
  const [themeSearch, setThemeSearch] = useState("");

  // Chapter count
  const [numChapters, setNumChapters] = useState(5);

  // Final exam question count
  const [finalExamCount, setFinalExamCount] = useState(40);

  // Fetch Gamma themes when course type includes presentations
  useEffect(() => {
    if (courseType !== "quiz" && gammaThemes.length === 0 && !themesLoading) {
      setThemesLoading(true);
      fetch("/api/elearning/gamma-themes")
        .then((res) => res.json())
        .then(({ data }) => {
          if (data) setGammaThemes(data);
        })
        .catch(() => {})
        .finally(() => setThemesLoading(false));
    }
  }, [courseType, gammaThemes.length, themesLoading]);

  // ---------- Handlers ----------

  const handleMethodSelect = (m: CreationMethod) => {
    setMethod(m);
    if (m === "import") {
      setViewStep("import");
    } else {
      setViewStep("configure");
    }
  };

  const handleFileUploaded = (file: { name: string; url: string; type: string; size: number }) => {
    setUploadedFile(file);
    if (!title) {
      setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "));
    }
    setViewStep("configure");
  };

  const [importUrlLoading, setImportUrlLoading] = useState(false);

  const handleImportUrl = async () => {
    const url = importUrl.trim();
    if (!url) return;

    // Validate URL
    try { new URL(url); } catch {
      toast({ title: "URL invalide", variant: "destructive" });
      return;
    }

    setImportUrlLoading(true);
    try {
      const res = await fetch("/api/elearning/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const { data, error: extractError } = await res.json();
      if (extractError) throw new Error(extractError);

      // Store extracted text and move to configure
      setExtractedText(data.text);
      setWordCount(data.word_count);

      // Create a virtual "uploaded file" for the flow
      const isYoutube = /youtube\.com|youtu\.be/i.test(url);
      setUploadedFile({
        name: data.metadata?.title || (isYoutube ? "Vidéo YouTube" : new URL(url).hostname),
        url,
        type: isYoutube ? "youtube" : "webpage",
        size: data.text.length,
      });

      if (!title) {
        const extractedTitle = data.metadata?.title || "";
        if (extractedTitle) setTitle(extractedTitle);
      }

      if (data.metadata?.transcript_available === false) {
        toast({
          title: `${data.word_count} mots extraits`,
          description: data.metadata.warning as string || "Aucun sous-titre disponible — seule la description a été extraite.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Contenu extrait", description: `${data.word_count} mots extraits` });
      }
      setViewStep("configure");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur d'extraction";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setImportUrlLoading(false);
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setViewStep("import");
  };

  const handleBack = () => {
    setError(null);
    if (viewStep === "import") {
      setViewStep("method");
      setMethod(null);
    } else if (viewStep === "configure") {
      if (method === "import") {
        setViewStep("import");
      } else {
        setViewStep("method");
        setMethod(null);
      }
    } else if (viewStep === "generate") {
      setViewStep("configure");
    }
  };

  const canProceed = (): boolean => {
    if (method === "generate") return prompt.trim().length >= 20;
    if (!title.trim()) return false;
    if (method === "paste" && pastedText.trim().length < 50) return false;
    if (method === "import" && !uploadedFile && !extractedText) return false;
    return true;
  };

  const handleStartGeneration = async () => {
    if (!canProceed()) {
      toast({ title: "Informations manquantes", variant: "destructive" });
      return;
    }

    setLoading(true);
    setError(null);

    // Auto-extract title from prompt for generate mode
    const effectiveTitle = method === "generate" && !title.trim()
      ? prompt.trim().split(/[.\n]/)[0].slice(0, 80)
      : title.trim();

    try {
      // Step 1: Create the course
      const createBody: Record<string, unknown> = {
        title: effectiveTitle,
        course_type: courseType, // "presentation" | "quiz" | "complete"
        final_quiz_target_count: courseType === "presentation" ? 0 : finalExamCount,
        flashcards_target_count: courseType === "presentation" ? 0 : 40,
        num_chapters: numChapters,
        ...(selectedThemeId && { gamma_theme_id: selectedThemeId }),
        };

      if (method === "import" && extractedText) {
        // URL import: text already extracted, pass it directly
        createBody.extracted_text = extractedText;
      } else if (method === "import" && uploadedFile) {
        // File upload: will extract server-side
        createBody.source_file_name = uploadedFile.name;
        createBody.source_file_url = uploadedFile.url;
        createBody.source_file_type = uploadedFile.type;
      } else {
        createBody.extracted_text = method === "generate" ? prompt.trim() : pastedText.trim();
      }

      const res = await fetch("/api/elearning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createBody),
      });
      const { data: course, error: createError } = await res.json();
      if (createError) throw new Error(createError);
      setCourseId(course.id);

      // Step 2: If file upload (not URL import), extract text first
      if (method === "import" && uploadedFile && !extractedText) {
        const extractRes = await fetch(`/api/elearning/${course.id}/extract`, { method: "POST" });
        const { data: extractData, error: extractError } = await extractRes.json();
        if (extractError) throw new Error(extractError);
        setExtractedText(extractData.preview || "");
        setWordCount(extractData.word_count);
      }

      // Move to generation step
      setViewStep("generate");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      setError(msg);
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerationComplete = () => {
    setViewStep("done");
    toast({
      title: "Cours e-learning généré !",
      description: "Présentations Gamma, quiz et flashcards sont prêts.",
    });
  };

  const handleGenerationError = (message: string) => {
    setError(message);
    toast({ title: "Erreur de génération", description: message, variant: "destructive" });
  };

  // ---------- Render ----------

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-blue-50/80 via-cyan-50/40 to-white">
      {/* Top bar */}
      {viewStep !== "method" && (
        <div className="px-6 pt-4">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-full hover:bg-gray-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </button>
        </div>
      )}

      {/* ==================== STEP 1: Choose Method ==================== */}
      {viewStep === "method" && (
        <div className="flex flex-col items-center px-6 pt-16 pb-12">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-3">
              Créer avec l&apos;IA
            </h1>
            <p className="text-lg text-gray-500">
              Par où souhaitez-vous commencer ?
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl w-full">
            {CREATION_METHODS.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => handleMethodSelect(m.id)}
                  className="group relative flex flex-col bg-white rounded-2xl border border-gray-200 p-1 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left overflow-hidden"
                >
                  {/* Gradient illustration area */}
                  <div className={cn(
                    "h-36 rounded-xl bg-gradient-to-br flex items-center justify-center",
                    m.gradient
                  )}>
                    <div className={cn(
                      "w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg",
                      m.iconBg
                    )}>
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                  </div>

                  {/* Text area */}
                  <div className="p-4 space-y-1.5">
                    <h3 className="font-bold text-gray-900 text-base group-hover:text-blue-700 transition-colors">
                      {m.title}
                    </h3>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      {m.description}
                    </p>
                    {m.badge && (
                      <span className={cn(
                        "inline-block text-xs font-bold px-2.5 py-1 rounded-md mt-2",
                        m.badge === "RECOMMANDÉ"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                      )}>
                        {m.badge === "RECOMMANDÉ" ? "\u2B50 RECOMMANDÉ" : m.badge}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== STEP 2: Import Source ==================== */}
      {viewStep === "import" && (
        <div className="flex flex-col items-center px-6 pt-12 pb-12">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-4 shadow-lg">
              <Upload className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
              Importer avec l&apos;IA
            </h1>
            <p className="text-gray-500">
              Sélectionnez le fichier que vous souhaitez transformer
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl w-full">
            {/* Upload file card */}
            <div
              className={cn(
                "relative bg-white rounded-2xl border-2 p-6 cursor-pointer transition-all duration-200 hover:shadow-lg",
                importSource === "upload"
                  ? "border-blue-500 bg-blue-50/30"
                  : "border-gray-200 hover:border-gray-300"
              )}
              onClick={() => setImportSource("upload")}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-indigo-500" />
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-3">Télécharger un fichier</h3>
              <div className="space-y-2">
                {["Powerpoint PPTX", "Documents Word", "PDF", "Texte TXT"].map((format) => (
                  <div key={format} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {format}
                  </div>
                ))}
              </div>
            </div>

            {/* URL card */}
            <div
              className={cn(
                "relative bg-white rounded-2xl border-2 p-6 cursor-pointer transition-all duration-200 hover:shadow-lg",
                importSource === "url"
                  ? "border-blue-500 bg-cyan-50/30"
                  : "border-gray-200 hover:border-gray-300"
              )}
              onClick={() => setImportSource("url")}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-100 to-teal-100 flex items-center justify-center mb-4">
                <Globe className="h-8 w-8 text-teal-500" />
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-3">Importer depuis une URL</h3>
              <div className="space-y-2">
                {["Pages web", "Vidéos YouTube", "Billets de blog ou articles", "Documents Notion (publics)"].map((format) => (
                  <div key={format} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {format}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Upload zone or URL input */}
          <div className="max-w-3xl w-full mt-8">
            {importSource === "upload" ? (
              <FileUploadZone onUploadComplete={handleFileUploaded} />
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <Label htmlFor="import-url" className="text-sm font-medium text-gray-700 mb-2 block">
                  Saisissez l&apos;URL
                </Label>
                <div className="flex gap-3">
                  <Input
                    id="import-url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1"
                  />
                  <Button
                    onClick={handleImportUrl}
                    disabled={!importUrl.trim() || importUrlLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                  >
                    {importUrlLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Extraction...
                      </>
                    ) : (
                      <>
                        Importer <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== STEP 3: Configure ==================== */}
      {viewStep === "configure" && (
        <div className="flex flex-col items-center px-6 pt-12 pb-12">

          {/* ---- Generate mode: simplified prompt-first layout ---- */}
          {method === "generate" && (
            <>
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-purple-500 mb-4 shadow-lg">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                  Générer avec l&apos;IA
                </h1>
                <p className="text-gray-500">
                  Décrivez le cours que vous souhaitez créer
                </p>
              </div>

              <div className="max-w-2xl w-full space-y-6">
                {/* Hero prompt box */}
                <div className="bg-white rounded-2xl border-2 border-gray-200 focus-within:border-blue-400 transition-colors shadow-sm p-5 space-y-3">
                  <Textarea
                    id="prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={"Décrivez le cours que vous souhaitez créer...\n\nExemple : Formation complète sur la gestion de projet Agile avec Scrum. Niveau intermédiaire, destiné aux chefs de projet. Aborder les rôles, cérémonies et outils."}
                    rows={7}
                    className="resize-none text-base border-0 shadow-none focus-visible:ring-0 p-0 placeholder:text-gray-400"
                    autoFocus
                  />
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-400">{prompt.length} caractères (minimum 20)</p>
                  </div>
                </div>

                {/* Course type */}
                <div className="space-y-3">
                  <p className="text-center text-gray-700 font-semibold">
                    Qu&apos;aimeriez-vous créer ?
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {COURSE_TYPES.map((ct) => {
                      const Icon = ct.icon;
                      const isSelected = courseType === ct.id;
                      return (
                        <button
                          key={ct.id}
                          onClick={() => setCourseType(ct.id)}
                          className={cn(
                            "relative flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all duration-200 text-center",
                            isSelected
                              ? "border-blue-600 bg-white shadow-lg shadow-blue-100"
                              : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                          )}
                        >
                          {isSelected && (
                            <div className="absolute top-3 left-3">
                              <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                                <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                              </div>
                            </div>
                          )}
                          {!isSelected && (
                            <div className="absolute top-3 left-3">
                              <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                            </div>
                          )}
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            isSelected ? "bg-blue-100" : "bg-gray-100"
                          )}>
                            <Icon className={cn("h-5 w-5", isSelected ? "text-blue-600" : "text-gray-500")} />
                          </div>
                          <span className={cn(
                            "text-sm font-semibold",
                            isSelected ? "text-blue-700" : "text-gray-700"
                          )}>
                            {ct.title}
                          </span>
                          {ct.id === "complete" && (
                            <span className="absolute -top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                              Recommandé
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Chapters */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-blue-500" />
                        Nombre de chapitres
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Entre 2 et 8 chapitres (recommandé : 4-6)</p>
                    </div>
                    <span className="text-2xl font-bold text-blue-600">{numChapters}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-4 text-center">2</span>
                    <input
                      type="range"
                      min={2}
                      max={8}
                      value={numChapters}
                      onChange={(e) => setNumChapters(Number(e.target.value))}
                      className="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:shadow-md"
                    />
                    <span className="text-xs text-gray-400 w-4 text-center">8</span>
                  </div>
                </div>

                {/* Final exam question count */}
                {courseType !== "presentation" && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          <GraduationCap className="h-4 w-4 text-amber-500" />
                          Questions — Examen final
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Entre 10 et 80 questions (recommandé : 30-40)</p>
                      </div>
                      <span className="text-2xl font-bold text-amber-600">{finalExamCount}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-6 text-center">10</span>
                      <input
                        type="range"
                        min={10}
                        max={80}
                        step={5}
                        value={finalExamCount}
                        onChange={(e) => setFinalExamCount(Number(e.target.value))}
                        className="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-amber-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow-md"
                      />
                      <span className="text-xs text-gray-400 w-6 text-center">80</span>
                    </div>
                  </div>
                )}

                {/* Gamma Theme (optional) */}
                {courseType !== "quiz" && (
                  <div className="space-y-3">
                    <div className="text-center">
                      <p className="text-gray-700 font-semibold flex items-center justify-center gap-2">
                        <Palette className="h-4 w-4 text-purple-500" />
                        Style visuel (optionnel)
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Choisissez les couleurs et polices de vos présentations Gamma</p>
                    </div>
                    {themesLoading ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-4">
                        <Loader2 className="h-4 w-4 animate-spin" /> Chargement des styles...
                      </div>
                    ) : gammaThemes.length > 0 ? (
                      <div className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            value={themeSearch}
                            onChange={(e) => setThemeSearch(e.target.value)}
                            placeholder="Rechercher un style..."
                            className="pl-9 h-9 text-sm"
                          />
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[280px] overflow-y-auto pr-1 py-1">
                          <button
                            onClick={() => setSelectedThemeId("")}
                            className={cn(
                              "group relative flex flex-col items-center rounded-xl border-2 transition-all overflow-hidden",
                              !selectedThemeId
                                ? "border-purple-500 ring-2 ring-purple-200 shadow-md"
                                : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                            )}
                          >
                            <div className="w-full h-14 bg-gradient-to-br from-violet-400 via-purple-400 to-pink-400 flex items-center justify-center">
                              <Sparkles className="h-5 w-5 text-white drop-shadow" />
                            </div>
                            <div className="p-2 text-center w-full">
                              <span className="text-xs font-semibold text-gray-700">Auto</span>
                            </div>
                          </button>
                          {gammaThemes
                            .filter((t) => !themeSearch || t.name.toLowerCase().includes(themeSearch.toLowerCase()))
                            .map((theme) => {
                              const colors = (theme.colorKeywords || []).map((kw: string) => keywordToColor(kw));
                              const bg = colors.length >= 2
                                ? `linear-gradient(135deg, ${colors[0]}, ${colors[1]}${colors[2] ? `, ${colors[2]}` : ""})`
                                : colors.length === 1
                                  ? colors[0]
                                  : "#94a3b8";
                              return (
                                <button
                                  key={theme.id}
                                  onClick={() => setSelectedThemeId(theme.id)}
                                  className={cn(
                                    "group relative flex flex-col items-center rounded-xl border-2 transition-all overflow-hidden",
                                    selectedThemeId === theme.id
                                      ? "border-purple-500 ring-2 ring-purple-200 shadow-md"
                                      : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                                  )}
                                >
                                  <div
                                    className="w-full h-14 flex items-end justify-start p-1.5 gap-1"
                                    style={{ background: bg }}
                                  >
                                    <div className="flex gap-0.5">
                                      {colors.slice(0, 4).map((c: string, i: number) => (
                                        <div
                                          key={i}
                                          className="w-3 h-3 rounded-full border border-white/40"
                                          style={{ backgroundColor: c }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                  <div className="p-2 text-center w-full bg-white">
                                    <span className="text-[11px] font-semibold leading-tight block truncate text-gray-700">
                                      {theme.name}
                                    </span>
                                    {theme.toneKeywords && theme.toneKeywords.length > 0 && (
                                      <span className="text-[9px] text-gray-400 truncate block mt-0.5">
                                        {theme.toneKeywords.slice(0, 2).join(" · ")}
                                      </span>
                                    )}
                                  </div>
                                  {selectedThemeId === theme.id && (
                                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center shadow">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 text-center">Le style par défaut sera utilisé</p>
                    )}
                  </div>
                )}

                {wordCount > 0 && wordCount < 100 && (
                  <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Contenu extrait très court ({wordCount} mots)</p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        La vidéo YouTube n&apos;a probablement pas de sous-titres disponibles. Seule la description a été extraite. Le cours généré sera limité en contenu.
                      </p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
                  </div>
                )}

                <Button
                  onClick={handleStartGeneration}
                  disabled={!canProceed() || loading}
                  className="w-full h-14 text-base font-semibold rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-200 gap-3 transition-all duration-200"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Préparation en cours...
                    </>
                  ) : (
                    <>
                      Générer avec l&apos;IA <Sparkles className="h-5 w-5" />
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {/* ---- Paste / Import mode: full configure layout ---- */}
          {method !== "generate" && (
            <>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 mb-4 shadow-lg">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
              {method === "import" ? "Importer avec l\u2019IA" : "Coller votre contenu"}
            </h1>
            <p className="text-gray-500">
              {method === "import"
                ? "Sélectionnez le fichier que vous souhaitez transformer"
                : "Configurez votre cours e-learning"}
            </p>
          </div>

          <div className="max-w-2xl w-full space-y-6">
            {/* Show uploaded file if import mode */}
            {method === "import" && uploadedFile && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{uploadedFile.name}</p>
                  <p className="text-xs text-gray-500">
                    {uploadedFile.type === "youtube" || uploadedFile.type === "webpage"
                      ? `${wordCount.toLocaleString()} mots extraits`
                      : `${(uploadedFile.size / (1024 * 1024)).toFixed(1)} Mo`}
                  </p>
                </div>
                <button
                  onClick={handleRemoveFile}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            )}

            {/* Title */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="course-title" className="text-sm font-semibold text-gray-700">
                  Titre du cours <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="course-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex : Formation Excel Avancé"
                  className="h-12 text-base"
                />
              </div>

              {/* Paste: text input */}
              {method === "paste" && (
                <div className="space-y-2">
                  <Label htmlFor="pasted-text" className="text-sm font-semibold text-gray-700">
                    Contenu du cours <span className="text-red-500">*</span>
                    <span className="text-xs font-normal text-gray-400 ml-2">(plan, notes, brief...)</span>
                  </Label>
                  <Textarea
                    id="pasted-text"
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={`Collez votre contenu ici...\n\nExemple :\n\nFormation : Gestion du stress en milieu professionnel\n\nObjectifs :\n- Comprendre les mécanismes du stress\n- Identifier ses sources de stress personnelles\n\nChapitre 1 : Qu'est-ce que le stress ?\n- Définition physiologique\n- Bon stress vs mauvais stress\n\nChapitre 2 : Identifier ses déclencheurs...`}
                    rows={12}
                    className="resize-none font-mono text-sm"
                  />
                  <p className="text-xs text-gray-400">{pastedText.length} caractères (minimum 50)</p>
                </div>
              )}

            </div>

            {/* Course type selection */}
            <div className="space-y-3">
              <p className="text-center text-gray-700 font-semibold">
                Qu&apos;aimeriez-vous créer avec ce contenu ?
              </p>
              <div className="grid grid-cols-3 gap-3">
                {COURSE_TYPES.map((ct) => {
                  const Icon = ct.icon;
                  const isSelected = courseType === ct.id;
                  return (
                    <button
                      key={ct.id}
                      onClick={() => setCourseType(ct.id)}
                      className={cn(
                        "relative flex flex-col items-center gap-2 p-5 rounded-2xl border-2 transition-all duration-200 text-center",
                        isSelected
                          ? "border-blue-600 bg-white shadow-lg shadow-blue-100"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                      )}
                    >
                      {isSelected && (
                        <div className="absolute top-3 left-3">
                          <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                            <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                          </div>
                        </div>
                      )}
                      {!isSelected && (
                        <div className="absolute top-3 left-3">
                          <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                        </div>
                      )}
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        isSelected ? "bg-blue-100" : "bg-gray-100"
                      )}>
                        <Icon className={cn("h-5 w-5", isSelected ? "text-blue-600" : "text-gray-500")} />
                      </div>
                      <span className={cn(
                        "text-sm font-semibold",
                        isSelected ? "text-blue-700" : "text-gray-700"
                      )}>
                        {ct.title}
                      </span>
                      {ct.id === "complete" && (
                        <span className="absolute -top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                          Recommandé
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chapter count selector */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-blue-500" />
                    Nombre de chapitres
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Entre 2 et 8 chapitres (recommandé : 4-6)</p>
                </div>
                <span className="text-2xl font-bold text-blue-600">{numChapters}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-4 text-center">2</span>
                <input
                  type="range"
                  min={2}
                  max={8}
                  value={numChapters}
                  onChange={(e) => setNumChapters(Number(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:shadow-md"
                />
                <span className="text-xs text-gray-400 w-4 text-center">8</span>
              </div>
            </div>

            {/* Final exam question count */}
            {courseType !== "presentation" && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <GraduationCap className="h-4 w-4 text-amber-500" />
                      Questions — Examen final
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Entre 10 et 80 questions (recommandé : 30-40)</p>
                  </div>
                  <span className="text-2xl font-bold text-amber-600">{finalExamCount}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-6 text-center">10</span>
                  <input
                    type="range"
                    min={10}
                    max={80}
                    step={5}
                    value={finalExamCount}
                    onChange={(e) => setFinalExamCount(Number(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-amber-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow-md"
                  />
                  <span className="text-xs text-gray-400 w-6 text-center">80</span>
                </div>
              </div>
            )}

            {/* Gamma Theme selector (only for presentation/complete modes) */}
            {courseType !== "quiz" && (
              <div className="space-y-3">
                <div className="text-center">
                  <p className="text-gray-700 font-semibold flex items-center justify-center gap-2">
                    <Palette className="h-4 w-4 text-purple-500" />
                    Style visuel (optionnel)
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Choisissez les couleurs et polices de vos présentations Gamma</p>
                </div>
                {themesLoading ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Chargement des styles...
                  </div>
                ) : gammaThemes.length > 0 ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        value={themeSearch}
                        onChange={(e) => setThemeSearch(e.target.value)}
                        placeholder="Rechercher un style..."
                        className="pl-9 h-9 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[280px] overflow-y-auto pr-1 py-1">
                      {/* Default Auto option */}
                      <button
                        onClick={() => setSelectedThemeId("")}
                        className={cn(
                          "group relative flex flex-col items-center rounded-xl border-2 transition-all overflow-hidden",
                          !selectedThemeId
                            ? "border-purple-500 ring-2 ring-purple-200 shadow-md"
                            : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                        )}
                      >
                        <div className="w-full h-14 bg-gradient-to-br from-violet-400 via-purple-400 to-pink-400 flex items-center justify-center">
                          <Sparkles className="h-5 w-5 text-white drop-shadow" />
                        </div>
                        <div className="p-2 text-center w-full">
                          <span className="text-xs font-semibold text-gray-700">Auto</span>
                        </div>
                      </button>
                      {gammaThemes
                        .filter((t) => !themeSearch || t.name.toLowerCase().includes(themeSearch.toLowerCase()))
                        .map((theme) => {
                          const colors = (theme.colorKeywords || []).map((kw: string) => keywordToColor(kw));
                          const bg = colors.length >= 2
                            ? `linear-gradient(135deg, ${colors[0]}, ${colors[1]}${colors[2] ? `, ${colors[2]}` : ""})`
                            : colors.length === 1
                              ? colors[0]
                              : "#94a3b8";
                          return (
                            <button
                              key={theme.id}
                              onClick={() => setSelectedThemeId(theme.id)}
                              className={cn(
                                "group relative flex flex-col items-center rounded-xl border-2 transition-all overflow-hidden",
                                selectedThemeId === theme.id
                                  ? "border-purple-500 ring-2 ring-purple-200 shadow-md"
                                  : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                              )}
                            >
                              {/* Color preview band */}
                              <div
                                className="w-full h-14 flex items-end justify-start p-1.5 gap-1"
                                style={{ background: bg }}
                              >
                                {/* Small color dots */}
                                <div className="flex gap-0.5">
                                  {colors.slice(0, 4).map((c: string, i: number) => (
                                    <div
                                      key={i}
                                      className="w-3 h-3 rounded-full border border-white/40"
                                      style={{ backgroundColor: c }}
                                    />
                                  ))}
                                </div>
                              </div>
                              <div className="p-2 text-center w-full bg-white">
                                <span className={cn(
                                  "text-[11px] font-semibold leading-tight block truncate",
                                  "text-gray-700"
                                )}>
                                  {theme.name}
                                </span>
                                {theme.toneKeywords && theme.toneKeywords.length > 0 && (
                                  <span className="text-[9px] text-gray-400 truncate block mt-0.5">
                                    {theme.toneKeywords.slice(0, 2).join(" · ")}
                                  </span>
                                )}
                              </div>
                              {/* Selected check */}
                              {selectedThemeId === theme.id && (
                                <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center shadow">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center">Le style par défaut sera utilisé</p>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
              </div>
            )}

            {/* Info box */}
            <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-2xl p-5 space-y-3">
              <p className="text-sm font-semibold text-violet-700 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Ce que Gamma AI va générer :
              </p>
              <ul className="text-sm text-violet-600 space-y-1.5 ml-6 list-disc">
                {courseType !== "quiz" && (
                  <li><strong>Présentations Gamma</strong> — de belles slides interactives par chapitre</li>
                )}
                {courseType !== "presentation" && (
                  <>
                    <li><strong>Quiz interactifs</strong> — pour valider les acquis à chaque chapitre</li>
                    <li><strong>Flashcards</strong> — pour réviser les notions clés</li>
                    <li><strong>Examen final</strong> — banque de 40+ questions</li>
                  </>
                )}
                <li>L&apos;IA structure automatiquement le contenu en chapitres</li>
              </ul>
            </div>

            {/* CTA */}
            <Button
              onClick={handleStartGeneration}
              disabled={!canProceed() || loading}
              className="w-full h-14 text-base font-semibold rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-200 gap-3 transition-all duration-200"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Préparation en cours...
                </>
              ) : (
                <>
                  Continuer <ArrowRight className="h-5 w-5" />
                </>
              )}
            </Button>
          </div>
          </>
          )}
        </div>
      )}

      {/* ==================== STEP 4: Generation ==================== */}
      {viewStep === "generate" && courseId && (
        <div className="flex flex-col items-center px-6 pt-16 pb-12">
          <div className="max-w-2xl w-full bg-white rounded-2xl border border-gray-200 shadow-lg p-8">
            <GenerationProgress
              courseId={courseId}
              courseType={courseType}
              onComplete={handleGenerationComplete}
              onError={handleGenerationError}
            />
          </div>
        </div>
      )}

      {/* ==================== STEP 5: Done ==================== */}
      {viewStep === "done" && (
        <div className="flex flex-col items-center px-6 pt-20 pb-12">
          <div className="text-center space-y-6 max-w-lg">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-green-400 to-emerald-500 shadow-2xl">
              <CheckCircle2 className="h-12 w-12 text-white" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Cours e-learning généré avec succès !
              </h2>
              <p className="text-gray-500 mt-2">
                Présentations Gamma, quiz interactifs, flashcards et examen final sont prêts.
              </p>
            </div>

            <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-2xl p-5">
              <p className="text-sm text-violet-700 font-semibold flex items-center gap-2 justify-center">
                <Sparkles className="h-4 w-4" />
                Les présentations Gamma sont intégrées dans chaque chapitre
              </p>
              <p className="text-xs text-violet-600 mt-2">
                Les apprenants verront les slides Gamma, puis les quiz et flashcards interactifs pour dynamiser chaque chapitre.
              </p>
            </div>

            <div className="flex items-center justify-center gap-4 pt-2">
              <Button
                variant="outline"
                onClick={() => router.push("/admin/elearning")}
                className="h-12 px-6 rounded-xl"
              >
                Retour à la liste
              </Button>
              {courseId && (
                <Button
                  onClick={() => router.push(`/admin/elearning/courses/${courseId}`)}
                  className="h-12 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white gap-2 shadow-lg shadow-blue-200"
                >
                  Voir le cours <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
