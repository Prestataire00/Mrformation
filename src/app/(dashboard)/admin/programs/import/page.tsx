"use client";

import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Loader2,
  BookOpen,
  Clock,
  Users,
  Target,
  GraduationCap,
  X,
} from "lucide-react";
import Link from "next/link";

interface ParsedModule {
  id: number;
  title: string;
  duration_hours: number;
  topics: string[];
}

interface ParsedData {
  title: string;
  duration_hours: number;
  duration_days: number;
  target_audience: string;
  prerequisites: string;
  objectives: string[];
  description: string;
  modules: ParsedModule[];
  pedagogical_resources: string[];
  evaluation_methods: string[];
  certification_details: string;
  satisfaction_rate: string;
  max_participants: string;
}

interface MatchResult {
  id: string;
  title: string;
  score: number;
}

interface ImportResult {
  parsed: ParsedData;
  match: MatchResult | null;
  allPrograms: { id: string; title: string }[];
}

type ImportStep = "upload" | "preview" | "done";

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.95;
  // Check if one title starts with the other
  if (na.startsWith(nb) || nb.startsWith(na)) return 0.9;

  // Word overlap (Jaccard)
  const wordsA = na.split(" ").filter((w) => w.length > 2);
  const wordsB = nb.split(" ").filter((w) => w.length > 2);
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const intersection = [...setA].filter((w) => setB.has(w));
  const union = new Set([...setA, ...setB]);
  const jaccard = union.size > 0 ? intersection.length / union.size : 0;

  // Also check partial word matching (one word contained in the other)
  let partialMatches = 0;
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (wa.includes(wb) || wb.includes(wa)) {
        partialMatches++;
        break;
      }
    }
  }
  const partialScore = wordsA.length > 0 ? partialMatches / Math.max(wordsA.length, wordsB.length) : 0;

  return Math.max(jaccard, partialScore);
}

export default function ImportProgramPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [error, setError] = useState("");
  const [importHistory, setImportHistory] = useState<
    { title: string; programTitle: string }[]
  >([]);

  const processFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      setError("Veuillez glisser un fichier PDF.");
      return;
    }

    setLoading(true);
    setError("");
    setFileName(file.name);

    const formData = new FormData();
    formData.append("pdf", file);

    try {
      // 1. Parse PDF server-side
      const res = await fetch("/api/programs/import-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors du traitement du PDF");
        setLoading(false);
        return;
      }

      const parsed: ParsedData = data.parsed;

      // 2. Fetch programs client-side (has auth context)
      if (!entityId) {
        setError("Entité non sélectionnée.");
        setLoading(false);
        return;
      }
      const { data: programs, error: progError } = await supabase
        .from("programs")
        .select("id, title")
        .eq("entity_id", entityId)
        .order("title");

      console.log("[Import] Programs fetched:", programs?.length, "error:", progError);

      if (progError) {
        setError("Erreur chargement programmes: " + progError.message);
        setLoading(false);
        return;
      }

      const allPrograms = (programs || []).map((p: { id: string; title: string }) => ({
        id: p.id,
        title: p.title,
      }));

      // 3. Match title client-side
      console.log("[Import] PDF title:", JSON.stringify(parsed.title));
      let bestMatch: MatchResult | null = null;
      for (const p of allPrograms) {
        const score = titleSimilarity(parsed.title, p.title);
        console.log("[Import] vs", JSON.stringify(p.title), "score:", score);
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { id: p.id, title: p.title, score };
        }
      }
      console.log("[Import] Best match:", bestMatch);

      const importResult: ImportResult = {
        parsed,
        match: bestMatch && bestMatch.score >= 0.2 ? bestMatch : null,
        allPrograms,
      };

      setResult(importResult);
      setSelectedProgramId(importResult.match?.id || "");
      setStep("preview");
    } catch {
      setError("Erreur réseau. Vérifiez que le serveur est lancé.");
    }

    setLoading(false);
  }, [supabase, entityId]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleSave = async () => {
    if (!result || !selectedProgramId) {
      toast({
        title: "Sélectionnez un programme",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const { parsed } = result;

    const content = {
      modules: parsed.modules,
      duration_hours: parsed.duration_hours,
      duration_days: parsed.duration_days,
      location: "Marseille",
      specialty: "",
      diploma: "",
      cpf_eligible: false,
      target_audience: parsed.target_audience,
      prerequisites: parsed.prerequisites,
      team_description: "",
      evaluation_methods: parsed.evaluation_methods,
      pedagogical_resources: parsed.pedagogical_resources,
      certification_results: parsed.satisfaction_rate,
      certification_terms: "",
      certification_details: parsed.certification_details,
    };

    const { error: updateError } = await supabase
      .from("programs")
      .update({
        description: parsed.description,
        objectives: parsed.objectives.map((o) => "• " + o).join("\n"),
        content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedProgramId);

    if (updateError) {
      toast({
        title: "Erreur",
        description: updateError.message,
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    const matchedTitle =
      result.allPrograms.find((p) => p.id === selectedProgramId)?.title || "";

    setImportHistory((prev) => [
      { title: parsed.title, programTitle: matchedTitle },
      ...prev,
    ]);

    toast({
      title: "Programme mis à jour",
      description: `"${matchedTitle}" a été mis à jour avec les données du PDF.`,
    });

    setStep("done");
    setSaving(false);
  };

  const resetForNext = () => {
    setStep("upload");
    setResult(null);
    setSelectedProgramId("");
    setFileName("");
    setError("");
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/programs">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Import PDF vers Programme
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Glissez un PDF de formation pour mettre à jour automatiquement le
            programme correspondant
          </p>
        </div>
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-all
              ${
                isDragOver
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
              }
              ${loading ? "pointer-events-none opacity-60" : ""}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileInput}
              className="hidden"
            />

            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
                <p className="text-lg font-medium text-gray-700">
                  Analyse du PDF en cours...
                </p>
                <p className="text-sm text-gray-500">{fileName}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
                  <Upload className="h-8 w-8 text-blue-500" />
                </div>
                <div>
                  <p className="text-lg font-medium text-gray-700">
                    Glissez un PDF ici
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    ou cliquez pour sélectionner un fichier
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  Format: PDF MR FORMATION
                </Badge>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Import History */}
          {importHistory.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Imports effectués cette session
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {importHistory.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm text-gray-700"
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <span>
                      <strong>{h.title}</strong> &rarr; {h.programTitle}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Step: Preview */}
      {step === "preview" && result && (
        <div className="space-y-4">
          {/* Match info */}
          <Card
            className={
              result.match && result.match.score >= 0.7
                ? "border-green-200 bg-green-50/50"
                : "border-yellow-200 bg-yellow-50/50"
            }
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {result.match && result.match.score >= 0.7 ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900">
                      {result.match && result.match.score >= 0.7
                        ? "Programme correspondant trouvé"
                        : "Vérifiez la correspondance"}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      PDF: <strong>{result.parsed.title}</strong>
                    </p>
                    {result.match && (
                      <p className="text-sm text-gray-600">
                        Match: <strong>{result.match.title}</strong>{" "}
                        <Badge variant="outline" className="text-xs ml-1">
                          {Math.round(result.match.score * 100)}%
                        </Badge>
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={resetForNext}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Manual select */}
              <div className="mt-3">
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  Programme cible
                </label>
                <Select
                  value={selectedProgramId}
                  onValueChange={setSelectedProgramId}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Sélectionnez un programme..." />
                  </SelectTrigger>
                  <SelectContent>
                    {result.allPrograms.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Parsed data preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Info card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Informations extraites
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  <span>
                    {result.parsed.duration_hours}h ({result.parsed.duration_days}{" "}
                    jour{result.parsed.duration_days > 1 ? "s" : ""})
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Users className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
                  <span>{result.parsed.target_audience || "Non spécifié"}</span>
                </div>
                <div className="flex items-start gap-2">
                  <GraduationCap className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
                  <span>{result.parsed.prerequisites || "Aucun"}</span>
                </div>
                {result.parsed.satisfaction_rate && (
                  <div className="flex items-center gap-2">
                    <Target className="h-3.5 w-3.5 text-gray-400" />
                    <span>Satisfaction: {result.parsed.satisfaction_rate}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Objectives card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Objectifs ({result.parsed.objectives.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-gray-700">
                  {result.parsed.objectives.map((obj, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-blue-500 mt-1">•</span>
                      <span>{obj}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Modules */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Modules ({result.parsed.modules.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {result.parsed.modules.map((mod) => (
                  <div
                    key={mod.id}
                    className="border rounded-lg p-3 bg-gray-50/50"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-sm text-gray-900">
                        {mod.id}. {mod.title}
                      </p>
                      {mod.duration_hours > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {mod.duration_hours}h
                        </Badge>
                      )}
                    </div>
                    {mod.topics.length > 0 && (
                      <ul className="space-y-0.5 text-xs text-gray-600 mt-1">
                        {mod.topics.map((t, j) => (
                          <li key={j}>- {t}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pedagogical resources & evaluation */}
          {(result.parsed.pedagogical_resources.length > 0 ||
            result.parsed.evaluation_methods.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.parsed.pedagogical_resources.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Moyens pédagogiques
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1 text-sm text-gray-700">
                      {result.parsed.pedagogical_resources.map((r, i) => (
                        <li key={i}>• {r}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {result.parsed.evaluation_methods.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Dispositif d&apos;évaluation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1 text-sm text-gray-700">
                      {result.parsed.evaluation_methods.map((e, i) => (
                        <li key={i}>• {e}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button variant="outline" onClick={resetForNext}>
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !selectedProgramId}
              className="gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mise à jour...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Mettre à jour le programme
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <div className="text-center py-12 space-y-4">
          <div className="h-16 w-16 rounded-full bg-green-50 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <div>
            <p className="text-lg font-medium text-gray-900">
              Programme mis à jour avec succès
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Vous pouvez importer un autre PDF ou retourner aux programmes.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={resetForNext} className="gap-2">
              <Upload className="h-4 w-4" />
              Importer un autre PDF
            </Button>
            <Link href="/admin/programs">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Retour aux programmes
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
