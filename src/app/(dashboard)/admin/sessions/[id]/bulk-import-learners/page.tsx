"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Trash2,
  Plus,
  Loader2,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  Users,
  RefreshCw,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { isPedagogieV2Epic25Enabled } from "@/lib/feature-flags";

/**
 * Pédagogie V2 Epic 2.5 + E2-S06 — Page admin bulk import apprenants.
 *
 * Permet à un admin de créer plusieurs apprenants d'un coup pour une session,
 * avec ou sans email. La page :
 *  1. Affiche un tableau dynamique (add/remove rows, jusqu'à 100 lignes)
 *  2. Accepte le collage Excel/Google Sheets via onPaste (TAB ou ; séparateurs)
 *  3. POSTe vers /api/sessions/[id]/learners/bulk/start
 *  4. Si N ≤ 20 : résultat inline immédiat
 *  5. Si 20 < N ≤ 100 : polling GET /status toutes les 2s
 *  6. Affiche 3 statuts ✓/⚠/✗ + un bouton "Télécharger PDF identifiants"
 *
 * Garde feature flag NEXT_PUBLIC_FEATURE_PEDAGOGIE_V2_EPIC_2_5.
 */

const MAX_ROWS = 100;
const POLL_INTERVAL_MS = 2000;
const QUEUED_RETRY_DELAY_MS = 10_000;

type Row = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

type JobStatus = "idle" | "submitted" | "queued" | "running" | "completed" | "failed";

type JobLearner = {
  learnerId: string | null;
  fullName: string;
  username: string | null;
  email: string | null;
  syntheticEmailUsed: boolean;
  enrolled: boolean;
  isError: boolean;
  errorMessage: string | null;
};

type JobResults = {
  created_count: number;
  enrolled_count: number;
  error_count: number;
  learners: JobLearner[];
};

type StartResponse = {
  ok: boolean;
  jobId: string;
  status: string;
  results?: JobResults;
  pdfSignedUrl?: string | null;
  pollUrl?: string;
  error?: string;
  code?: string;
  maxLearners?: number;
  attempted?: number;
};

type PollJob = {
  id: string;
  status: string;
  payload_count: number;
  results: JobResults | null;
  pdf_signed_url: string | null;
  pdf_signed_url_expires_at: string | null;
  error_message: string | null;
};

const STATUS_LABELS: Record<JobStatus, string> = {
  idle: "",
  submitted: "Envoi en cours…",
  queued: "En file d\u2019attente…",
  running: "Import en cours…",
  completed: "Import terminé",
  failed: "Import échoué",
};

function emptyRow(): Row {
  return {
    id: Math.random().toString(36).slice(2),
    firstName: "",
    lastName: "",
    email: "",
  };
}

function getEntitySlugFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )entity_slug=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function BulkImportLearnersPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;

  const featureEnabled = isPedagogieV2Epic25Enabled();

  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [results, setResults] = useState<JobResults | null>(null);
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [queuedAt, setQueuedAt] = useState<number | null>(null);
  const [showRetry, setShowRetry] = useState(false);

  const entitySlug = useMemo(() => {
    const cookieSlug = getEntitySlugFromCookie();
    return cookieSlug === "mr-formation" || cookieSlug === "c3v-formation"
      ? cookieSlug
      : null;
  }, []);

  const validRows = useMemo(
    () => rows.filter((r) => r.firstName.trim() && r.lastName.trim()),
    [rows],
  );

  // ---------- Polling ----------

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId || !["queued", "running"].includes(jobStatus)) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/learners/bulk/status?jobId=${jobId}`,
        );
        if (!res.ok) {
          if (res.status >= 500) {
            toast({
              title: "Erreur serveur",
              description: `Statut HTTP ${res.status} lors du polling.`,
              variant: "destructive",
            });
          }
          return;
        }
        const data = (await res.json()) as { ok: boolean; job: PollJob };
        if (!data.ok) return;

        const job = data.job;
        const newStatus = job.status as JobStatus;

        if (newStatus === "running" && jobStatus !== "running") {
          setJobStatus("running");
        }

        if (newStatus === "completed") {
          setJobStatus("completed");
          setResults(job.results);
          setPdfSignedUrl(job.pdf_signed_url);
          toast({
            title: "Import terminé",
            description: `${job.results?.created_count ?? 0} apprenant(s) créés.`,
          });
        } else if (newStatus === "failed") {
          setJobStatus("failed");
          setResults(job.results);
          setErrorMessage(job.error_message);
          toast({
            title: "Import échoué",
            description: job.error_message ?? "Erreur lors de l\u2019import.",
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: "Erreur réseau",
          description: "Impossible de vérifier le statut. Nouvelle tentative…",
          variant: "destructive",
        });
      }
    };

    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    // Appeler immédiatement
    poll();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [jobId, jobStatus, sessionId]);

  // ---------- Queued > 10s → Retry button ----------

  useEffect(() => {
    if (jobStatus !== "queued" || !queuedAt) {
      setShowRetry(false);
      return;
    }
    const elapsed = Date.now() - queuedAt;
    if (elapsed >= QUEUED_RETRY_DELAY_MS) {
      setShowRetry(true);
      return;
    }
    const timeout = setTimeout(
      () => setShowRetry(true),
      QUEUED_RETRY_DELAY_MS - elapsed,
    );
    return () => clearTimeout(timeout);
  }, [jobStatus, queuedAt]);

  // ---------- Row handlers ----------

  const update = useCallback(
    (id: string, field: keyof Row, value: string) => {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
      );
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setRows((prev) =>
      prev.length === 1 ? [emptyRow()] : prev.filter((r) => r.id !== id),
    );
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) =>
      prev.length >= MAX_ROWS ? prev : [...prev, emptyRow()],
    );
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number) => {
      const text = e.clipboardData.getData("text/plain");
      if (!text.includes("\n") && !text.includes("\t")) return;

      e.preventDefault();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) return;

      const parsed: Row[] = lines.slice(0, MAX_ROWS - rowIndex).map((line) => {
        const parts = line.split(/[\t;,]/).map((p) => p.trim());
        return {
          id: Math.random().toString(36).slice(2),
          firstName: parts[0] ?? "",
          lastName: parts[1] ?? "",
          email: parts[2] ?? "",
        };
      });

      setRows((prev) => {
        const next = [...prev];
        for (let i = 0; i < parsed.length && rowIndex + i < MAX_ROWS; i++) {
          next[rowIndex + i] = parsed[i];
        }
        while (next.length > MAX_ROWS) next.pop();
        return next;
      });

      toast({
        title: `${parsed.length} ligne(s) collée(s)`,
        description: "Vérifiez les données avant de valider.",
      });
    },
    [],
  );

  // ---------- Submit ----------

  async function handleSubmit() {
    if (!entitySlug) {
      toast({
        title: "Entité inconnue",
        description: "Sélectionnez d\u2019abord votre entité dans le menu.",
        variant: "destructive",
      });
      return;
    }
    if (validRows.length === 0) {
      toast({
        title: "Aucun apprenant",
        description: "Saisissez au moins un prénom + nom.",
        variant: "destructive",
      });
      return;
    }

    setJobStatus("submitted");
    setJobId(null);
    setResults(null);
    setPdfSignedUrl(null);
    setErrorMessage(null);
    setQueuedAt(null);
    setShowRetry(false);

    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/learners/bulk/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            learners: validRows.map((r) => ({
              firstName: r.firstName.trim(),
              lastName: r.lastName.trim(),
              email: r.email.trim() || null,
            })),
            idempotencyKey: `${sessionId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
            entitySlug,
          }),
        },
      );

      const data = (await res.json().catch(() => ({}))) as StartResponse;

      if (!res.ok) {
        setJobStatus("failed");
        if (data.code === "bulk_exceeds_max" || data.code === "bulk_too_large_v1") {
          toast({
            title: `Trop d\u2019apprenants (${data.attempted})`,
            description: `Maximum ${data.maxLearners} apprenants par import. Splittez votre liste.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Erreur",
            description: data.error ?? "Import impossible.",
            variant: "destructive",
          });
        }
        return;
      }

      setJobId(data.jobId);

      // Inline completed (N ≤ 20)
      if (data.status === "completed" || data.status === "failed") {
        setJobStatus(data.status as JobStatus);
        setResults(data.results ?? null);
        setPdfSignedUrl(data.pdfSignedUrl ?? null);
        if (data.status === "completed") {
          toast({
            title: "Import terminé",
            description: `${data.results?.created_count ?? 0} apprenant(s) créés.`,
          });
        } else {
          toast({
            title: "Import échoué",
            description: "Certains apprenants n\u2019ont pas pu être créés.",
            variant: "destructive",
          });
        }
        return;
      }

      // BG mode (N > 20) → start polling
      if (data.status === "queued") {
        setJobStatus("queued");
        setQueuedAt(Date.now());
        toast({
          title: "Import en file d\u2019attente",
          description: `${validRows.length} apprenants à traiter. Le statut sera mis à jour automatiquement.`,
        });
      }
    } catch {
      setJobStatus("failed");
      toast({
        title: "Erreur réseau",
        description: "Réessayez.",
        variant: "destructive",
      });
    }
  }

  // ---------- Retry ----------

  async function handleRetry() {
    if (!jobId) return;
    setShowRetry(false);
    toast({
      title: "Relance demandée",
      description: "Vérification du statut…",
    });
    // Force an immediate poll — the useEffect will handle the rest
    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/learners/bulk/status?jobId=${jobId}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; job: PollJob };
        if (data.ok) {
          const job = data.job;
          const newStatus = job.status as JobStatus;
          setJobStatus(newStatus);
          if (newStatus === "completed") {
            setResults(job.results);
            setPdfSignedUrl(job.pdf_signed_url);
          } else if (newStatus === "failed") {
            setResults(job.results);
            setErrorMessage(job.error_message);
          }
        }
      }
    } catch {
      toast({
        title: "Erreur réseau",
        description: "Impossible de vérifier le statut.",
        variant: "destructive",
      });
    }
  }

  // ---------- Reset ----------

  function handleReset() {
    setJobStatus("idle");
    setJobId(null);
    setResults(null);
    setPdfSignedUrl(null);
    setErrorMessage(null);
    setQueuedAt(null);
    setShowRetry(false);
    setRows([emptyRow(), emptyRow(), emptyRow()]);
  }

  // ---------- Render ----------

  const isProcessing = ["submitted", "queued", "running"].includes(jobStatus);
  const isTerminal = ["completed", "failed"].includes(jobStatus);

  if (!featureEnabled) {
    return (
      <div className="container mx-auto py-10 text-center">
        <p className="text-gray-500">
          Fonctionnalité non activée pour cette entité.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          Import groupé d&apos;apprenants
        </h1>
      </div>

      {/* ---------- Status banner ---------- */}
      {jobStatus !== "idle" && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              {jobStatus === "submitted" && (
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              )}
              {jobStatus === "queued" && (
                <Clock className="w-5 h-5 text-amber-500" />
              )}
              {jobStatus === "running" && (
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              )}
              {jobStatus === "completed" && (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
              {jobStatus === "failed" && (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              <p
                aria-live="polite"
                className="text-sm font-medium flex-1"
              >
                {STATUS_LABELS[jobStatus]}
                {errorMessage && jobStatus === "failed" && (
                  <span className="text-red-600 ml-2">— {errorMessage}</span>
                )}
              </p>
              {showRetry && jobStatus === "queued" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  className="gap-1"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retenter
                </Button>
              )}
              {isTerminal && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="gap-1"
                >
                  Nouvel import
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- Form (hidden when processing/terminal) ---------- */}
      {!isProcessing && !isTerminal && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saisie des apprenants</CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              Astuce : collez directement depuis Excel ou Google Sheets dans la
              1re cellule (format : <code>Prénom · Nom · Email</code> séparés par
              TAB, virgule ou point-virgule). Max {MAX_ROWS} lignes par import.
              Les apprenants sans email recevront un identifiant auto-généré.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-2">
                <div className="col-span-1">#</div>
                <div className="col-span-3">Prénom *</div>
                <div className="col-span-3">Nom *</div>
                <div className="col-span-4">Email (optionnel)</div>
                <div className="col-span-1"></div>
              </div>
              {rows.map((row, idx) => (
                <div
                  key={row.id}
                  className="grid grid-cols-12 gap-2 items-center"
                >
                  <div className="col-span-1 text-xs text-gray-400 text-right pr-2">
                    {idx + 1}
                  </div>
                  <div className="col-span-3">
                    <Input
                      value={row.firstName}
                      onChange={(e) => update(row.id, "firstName", e.target.value)}
                      onPaste={(e) => handlePaste(e, idx)}
                      placeholder="Marie"
                      aria-label={`Prénom ligne ${idx + 1}`}
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      value={row.lastName}
                      onChange={(e) => update(row.id, "lastName", e.target.value)}
                      placeholder="Dupont"
                      aria-label={`Nom ligne ${idx + 1}`}
                    />
                  </div>
                  <div className="col-span-4">
                    <Input
                      type="email"
                      value={row.email}
                      onChange={(e) => update(row.id, "email", e.target.value)}
                      placeholder="marie@exemple.fr (vide = identifiant auto)"
                      aria-label={`Email ligne ${idx + 1}`}
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Supprimer la ligne ${idx + 1}`}
                      onClick={() => remove(row.id)}
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addRow}
                  disabled={rows.length >= MAX_ROWS}
                  className="gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter une ligne
                </Button>
                <span className="text-xs text-gray-400">
                  {rows.length} / {MAX_ROWS} lignes
                </span>
                <div className="flex-1" />
                <Button
                  onClick={handleSubmit}
                  disabled={validRows.length === 0}
                  className="gap-2"
                >
                  Créer {validRows.length} apprenant(s)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- Results table ---------- */}
      {results && results.learners && results.learners.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Résultat de l&apos;import
              <Badge
                variant={
                  results.error_count === 0 ? "default" : "destructive"
                }
              >
                {results.created_count} créés ·{" "}
                {results.enrolled_count} inscrits ·{" "}
                {results.error_count} erreurs
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pdfSignedUrl && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
                <Download className="w-5 h-5 text-blue-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">
                    PDF identifiants généré
                  </p>
                  <p className="text-xs text-blue-700">
                    Lien valable 24 h. Téléchargez et transmettez aux apprenants.
                  </p>
                </div>
                <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700">
                  <a
                    href={pdfSignedUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Télécharger
                  </a>
                </Button>
              </div>
            )}

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Statut</th>
                    <th className="px-3 py-2 text-left">Nom complet</th>
                    <th className="px-3 py-2 text-left">Identifiant</th>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {results.learners.map((l, i) => (
                    <tr key={`${l.learnerId ?? "err"}-${i}`}>
                      <td className="px-3 py-2">
                        {l.isError ? (
                          <XCircle className="w-4 h-4 text-red-500" />
                        ) : l.enrolled ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-orange-500" />
                        )}
                      </td>
                      <td className="px-3 py-2">{l.fullName}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {l.username ?? "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {l.syntheticEmailUsed ? (
                          <span className="text-gray-400 italic">
                            (auto, non utilisable)
                          </span>
                        ) : (
                          l.email
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {l.errorMessage ??
                          (l.enrolled
                            ? "Créé et inscrit"
                            : "Créé sans inscription")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-500">
              Le PDF n&apos;est plus accessible après 24 h pour des raisons de
              sécurité. Si vous le perdez, utilisez la fonction « Régénérer
              identifiants » sur la fiche de chaque apprenant.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
