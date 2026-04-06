"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import * as XLSX from "xlsx";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Users,
  Building2,
  Banknote,
  UserCheck,
  ArrowRight,
  Trash2,
  Database,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  parseApprenants,
  parseEntreprises,
  parseFinanceurs,
  parseFormateurs,
  deduplicateLearners,
  deduplicateClients,
  deduplicateTrainers,
  type ParsedLearner,
  type ParsedClient,
  type ParsedTrainer,
} from "@/lib/migration/parsers";

// ── Types ───────────────────────────────────────────────────────────────────

type FileType = "apprenants" | "entreprises" | "financeurs" | "formateurs";
type Step = "upload" | "preview" | "import" | "done";

interface FileState {
  file: File | null;
  rawRows: Record<string, unknown>[];
  parsed: boolean;
}

interface ImportResult {
  type: FileType;
  label: string;
  inserted: number;
  errors: number;
  duplicatesSkipped: number;
}

const FILE_CONFIG: Record<FileType, { label: string; icon: React.ElementType; color: string; description: string }> = {
  apprenants: { label: "Apprenants", icon: Users, color: "#DC2626", description: "Tableau.xlsx — Noms, emails, téléphones des apprenants" },
  entreprises: { label: "Entreprises", icon: Building2, color: "#2563EB", description: "Tableau (1).xlsx — Clients entreprises" },
  financeurs: { label: "Financeurs", icon: Banknote, color: "#7C3AED", description: "Tableau (2).xlsx — Organismes financeurs (OPCO, etc.)" },
  formateurs: { label: "Formateurs", icon: UserCheck, color: "#F59E0B", description: "Tableau (3).xlsx — Formateurs internes et externes" },
};

// ── Component ───────────────────────────────────────────────────────────────

export default function MigrationPage() {
  const supabase = createClient();
  const { entityId } = useEntity();

  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<Record<FileType, FileState>>({
    apprenants: { file: null, rawRows: [], parsed: false },
    entreprises: { file: null, rawRows: [], parsed: false },
    financeurs: { file: null, rawRows: [], parsed: false },
    formateurs: { file: null, rawRows: [], parsed: false },
  });

  // Parsed & deduplicated data
  const [learners, setLearners] = useState<ParsedLearner[]>([]);
  const [clients, setClients] = useState<ParsedClient[]>([]);
  const [trainers, setTrainers] = useState<ParsedTrainer[]>([]);
  const [stats, setStats] = useState({
    learnerDupes: 0,
    clientDupes: 0,
    trainerDupes: 0,
  });

  // Import
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);

  // Preview expanded
  const [previewType, setPreviewType] = useState<FileType | null>(null);

  // ── File handling ─────────────────────────────────────────────────────────

  const handleFileUpload = useCallback((type: FileType, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];

      setFiles((prev) => ({
        ...prev,
        [type]: { file, rawRows: rows, parsed: true },
      }));
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback(
    (type: FileType) => (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv"))) {
        handleFileUpload(type, file);
      }
    },
    [handleFileUpload]
  );

  const handleFileInput = useCallback(
    (type: FileType) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileUpload(type, file);
    },
    [handleFileUpload]
  );

  const removeFile = useCallback((type: FileType) => {
    setFiles((prev) => ({
      ...prev,
      [type]: { file: null, rawRows: [], parsed: false },
    }));
  }, []);

  // ── Parse & Deduplicate ───────────────────────────────────────────────────

  const processData = useCallback(() => {
    // Parse apprenants
    const rawLearners = files.apprenants.parsed ? parseApprenants(files.apprenants.rawRows) : [];
    const { unique: uniqueLearners, duplicates: learnerDupes } = deduplicateLearners(rawLearners);

    // Parse entreprises + financeurs → clients
    const rawEntreprises = files.entreprises.parsed ? parseEntreprises(files.entreprises.rawRows) : [];
    const rawFinanceurs = files.financeurs.parsed ? parseFinanceurs(files.financeurs.rawRows) : [];
    const allClients = [...rawEntreprises, ...rawFinanceurs];
    const { unique: uniqueClients, duplicates: clientDupes } = deduplicateClients(allClients);

    // Parse formateurs
    const rawTrainers = files.formateurs.parsed ? parseFormateurs(files.formateurs.rawRows) : [];
    const { unique: uniqueTrainers, duplicates: trainerDupes } = deduplicateTrainers(rawTrainers);

    setLearners(uniqueLearners);
    setClients(uniqueClients);
    setTrainers(uniqueTrainers);
    setStats({ learnerDupes, clientDupes, trainerDupes });
    setStep("preview");
  }, [files]);

  // ── Import to Supabase ────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!entityId) return;
    setImporting(true);
    const importResults: ImportResult[] = [];

    // Import clients — upsert on company_name + entity_id (no duplicates on re-import)
    if (clients.length > 0) {
      let inserted = 0;
      let errors = 0;
      for (const client of clients) {
        const { error } = await supabase.from("clients").upsert(
          {
            entity_id: entityId,
            company_name: client.company_name,
            sector: client.sector,
            status: "active",
            notes: client.email ? `Contact: ${client.email}` : null,
          },
          { onConflict: "entity_id,company_name", ignoreDuplicates: true }
        );
        if (error) errors++;
        else inserted++;
      }
      importResults.push({
        type: "entreprises",
        label: "Clients & Financeurs",
        inserted,
        errors,
        duplicatesSkipped: stats.clientDupes,
      });
    }

    // Import learners — upsert on email + entity_id (no duplicates on re-import)
    if (learners.length > 0) {
      let inserted = 0;
      let errors = 0;
      for (const learner of learners) {
        const { error } = await supabase.from("learners").upsert(
          {
            entity_id: entityId,
            first_name: learner.first_name || "Inconnu",
            last_name: learner.last_name || "Inconnu",
            email: learner.email,
            phone: learner.phone,
          },
          { onConflict: "email", ignoreDuplicates: true }
        );
        if (error) errors++;
        else inserted++;
      }
      importResults.push({
        type: "apprenants",
        label: "Apprenants",
        inserted,
        errors,
        duplicatesSkipped: stats.learnerDupes,
      });
    }

    // Import trainers — upsert on email + entity_id (no duplicates on re-import)
    if (trainers.length > 0) {
      let inserted = 0;
      let errors = 0;
      for (const trainer of trainers) {
        const { error } = await supabase.from("trainers").upsert(
          {
            entity_id: entityId,
            first_name: trainer.first_name || "Inconnu",
            last_name: trainer.last_name || "Inconnu",
            email: trainer.email,
            phone: trainer.phone,
            type: "external",
            bio: trainer.specialty,
          },
          { onConflict: "email", ignoreDuplicates: true }
        );
        if (error) errors++;
        else inserted++;
      }
      importResults.push({
        type: "formateurs",
        label: "Formateurs",
        inserted,
        errors,
        duplicatesSkipped: stats.trainerDupes,
      });
    }

    setResults(importResults);
    setImporting(false);
    setStep("done");
  }, [entityId, clients, learners, trainers, stats, supabase]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const hasAnyFile = Object.values(files).some((f) => f.parsed);
  const totalRawRows = Object.values(files).reduce((sum, f) => sum + f.rawRows.length, 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Migration des Données</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Importez les données depuis Visio/Sellsy (fichiers Excel) vers la plateforme LMS.
        </p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(["upload", "preview", "import", "done"] as Step[]).map((s, i) => {
          const labels = ["1. Upload", "2. Aperçu", "3. Import", "4. Terminé"];
          const isActive = s === step;
          const isDone = ["upload", "preview", "import", "done"].indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
              <span
                className={
                  isActive
                    ? "font-semibold text-primary"
                    : isDone
                    ? "text-green-600 font-medium"
                    : "text-muted-foreground"
                }
              >
                {isDone && !isActive && <CheckCircle className="inline w-3.5 h-3.5 mr-1" />}
                {labels[i]}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Upload ───────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.entries(FILE_CONFIG) as [FileType, typeof FILE_CONFIG[FileType]][]).map(
              ([type, config]) => {
                const state = files[type];
                const Icon = config.icon;

                return (
                  <Card key={type} className="relative">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="w-4 h-4" style={{ color: config.color }} />
                        {config.label}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{config.description}</p>
                    </CardHeader>
                    <CardContent>
                      {state.parsed ? (
                        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="w-4 h-4 text-green-600" />
                            <div>
                              <p className="text-sm font-medium text-green-800">
                                {state.file?.name}
                              </p>
                              <p className="text-xs text-green-600">
                                {state.rawRows.length} lignes détectées
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700"
                            onClick={() => removeFile(type)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="border-2 border-dashed border-muted rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                          onDrop={handleDrop(type)}
                          onDragOver={(e) => e.preventDefault()}
                          onClick={() =>
                            document.getElementById(`file-${type}`)?.click()
                          }
                        >
                          <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Glissez un fichier .xlsx ou{" "}
                            <span className="text-primary font-medium">parcourez</span>
                          </p>
                          <input
                            id={`file-${type}`}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={handleFileInput(type)}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              }
            )}
          </div>

          {hasAnyFile && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                {totalRawRows} lignes chargées au total
              </p>
              <Button onClick={processData}>
                Analyser les données
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Preview ──────────────────────────────────────────────── */}
      {step === "preview" && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SummaryCard
              label="Apprenants"
              icon={Users}
              count={learners.length}
              dupes={stats.learnerDupes}
              color="#DC2626"
              onPreview={() => setPreviewType(previewType === "apprenants" ? null : "apprenants")}
              isPreview={previewType === "apprenants"}
            />
            <SummaryCard
              label="Clients & Financeurs"
              icon={Building2}
              count={clients.length}
              dupes={stats.clientDupes}
              color="#2563EB"
              onPreview={() => setPreviewType(previewType === "entreprises" ? null : "entreprises")}
              isPreview={previewType === "entreprises"}
            />
            <SummaryCard
              label="Formateurs"
              icon={UserCheck}
              count={trainers.length}
              dupes={stats.trainerDupes}
              color="#F59E0B"
              onPreview={() => setPreviewType(previewType === "formateurs" ? null : "formateurs")}
              isPreview={previewType === "formateurs"}
            />
          </div>

          {/* Data preview table */}
          {previewType === "apprenants" && learners.length > 0 && (
            <PreviewTable
              title="Aperçu des Apprenants"
              headers={["Nom", "Prénom", "Email", "Téléphone"]}
              rows={learners.map((l) => [l.last_name, l.first_name, l.email ?? "—", l.phone ?? "—"])}
            />
          )}
          {previewType === "entreprises" && clients.length > 0 && (
            <PreviewTable
              title="Aperçu des Clients & Financeurs"
              headers={["Nom entreprise", "Téléphone", "Email", "Secteur"]}
              rows={clients.map((c) => [c.company_name, c.phone ?? "—", c.email ?? "—", c.sector ?? "—"])}
            />
          )}
          {previewType === "formateurs" && trainers.length > 0 && (
            <PreviewTable
              title="Aperçu des Formateurs"
              headers={["Nom", "Prénom", "Email", "Téléphone", "Spécialité"]}
              rows={trainers.map((t) => [t.last_name, t.first_name, t.email ?? "—", t.phone ?? "—", t.specialty ?? "—"])}
            />
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={() => setStep("upload")}>
              Retour
            </Button>
            <Button onClick={() => setStep("import")}>
              <Database className="mr-2 w-4 h-4" />
              Procéder à l&apos;import
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Import confirmation ──────────────────────────────────── */}
      {step === "import" && (
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <Database className="w-10 h-10 mx-auto text-primary" />
            <h2 className="text-lg font-semibold">Confirmer l&apos;import</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Les données suivantes seront importées dans la base de données
              et rattachées à l&apos;entité active :
            </p>
            <div className="flex items-center justify-center gap-6 text-sm py-2">
              {learners.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#DC2626]" />
                  {learners.length} apprenants
                </span>
              )}
              {clients.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#2563EB]" />
                  {clients.length} clients
                </span>
              )}
              {trainers.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-[#F59E0B]" />
                  {trainers.length} formateurs
                </span>
              )}
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep("preview")} disabled={importing}>
                Retour
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <>
                    <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                    Import en cours...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 w-4 h-4" />
                    Lancer l&apos;import
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Results ──────────────────────────────────────────────── */}
      {step === "done" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <CheckCircle className="w-10 h-10 mx-auto text-green-500" />
              <h2 className="text-lg font-semibold">Import terminé</h2>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {results.map((r) => (
              <Card key={r.type}>
                <CardContent className="py-4">
                  <h3 className="font-semibold text-sm mb-2">{r.label}</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Insérés</span>
                      <Badge variant="default" className="bg-green-500">
                        {r.inserted}
                      </Badge>
                    </div>
                    {r.errors > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Erreurs</span>
                        <Badge variant="destructive">{r.errors}</Badge>
                      </div>
                    )}
                    {r.duplicatesSkipped > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Doublons ignorés</span>
                        <Badge variant="secondary">{r.duplicatesSkipped}</Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setStep("upload");
                setFiles({
                  apprenants: { file: null, rawRows: [], parsed: false },
                  entreprises: { file: null, rawRows: [], parsed: false },
                  financeurs: { file: null, rawRows: [], parsed: false },
                  formateurs: { file: null, rawRows: [], parsed: false },
                });
                setLearners([]);
                setClients([]);
                setTrainers([]);
                setResults([]);
              }}
            >
              Nouvelle migration
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  icon: Icon,
  count,
  dupes,
  color,
  onPreview,
  isPreview,
}: {
  label: string;
  icon: React.ElementType;
  count: number;
  dupes: number;
  color: string;
  onPreview: () => void;
  isPreview: boolean;
}) {
  return (
    <Card className={isPreview ? "ring-2 ring-primary" : ""}>
      <CardContent className="py-4">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${color}15`, color }}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-2xl font-bold">{count}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          {dupes > 0 ? (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {dupes} doublons retirés
            </span>
          ) : (
            <span className="text-xs text-green-600">Aucun doublon</span>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onPreview}>
            <Eye className="w-3 h-3 mr-1" />
            {isPreview ? "Masquer" : "Aperçu"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  const [showAll, setShowAll] = useState(false);
  const displayRows = showAll ? rows : rows.slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                {headers.map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  {row.map((cell, j) => (
                    <td key={j} className="py-1.5 px-3 text-xs">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 10 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-xs w-full"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? "Afficher moins" : `Afficher les ${rows.length - 10} restants`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
