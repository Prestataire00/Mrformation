"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, FileText, Sparkles, FlaskConical, Package, AlertCircle, ClipboardList, ScrollText, Shield, Gavel } from "lucide-react";

/**
 * Page de test temporaire — Story B-Convention.
 *
 * Permet de tester la génération de convention via la NOUVELLE infra
 * (Puppeteer + cache + template `[%xxx%]`) sans toucher l'ancien flow
 * TabConventionDocs. Une fois la story validée, cette page peut être
 * supprimée (en Lot E) car le bouton sera intégré dans TabConventionDocs.
 */

interface SessionRow {
  id: string;
  title: string;
  start_date: string;
}

interface CompanyRow {
  client_id: string;
  client: { id: string; company_name: string } | null;
}

export default function TestConventionPage() {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedBatchSessionId, setSelectedBatchSessionId] = useState<string>("");
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [lastResult, setLastResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);
  const [lastBatchResult, setLastBatchResult] = useState<{
    totalCompanies: number;
    successCount: number;
    failureCount: number;
    errors: { clientId: string; companyName: string; error: string }[];
    totalLatencyMs: number;
  } | null>(null);

  // ── Émargement collectif (état séparé) ────────────────────────────────
  const [emargementSessionId, setEmargementSessionId] = useState<string>("");
  const [emargementClientId, setEmargementClientId] = useState<string>("");
  const [emargementCompanies, setEmargementCompanies] = useState<CompanyRow[]>([]);
  const [loadingEmargementCompanies, setLoadingEmargementCompanies] = useState(false);
  const [emargementBatchSessionId, setEmargementBatchSessionId] = useState<string>("");
  const [generatingEmargement, setGeneratingEmargement] = useState(false);
  const [generatingEmargementBatch, setGeneratingEmargementBatch] = useState(false);
  const [lastEmargementResult, setLastEmargementResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
    signedCount?: number;
  } | null>(null);
  const [lastEmargementBatchResult, setLastEmargementBatchResult] = useState<{
    totalCompanies: number;
    successCount: number;
    failureCount: number;
    errors: { clientId: string; companyName: string; error: string }[];
    totalLatencyMs: number;
    signedCount?: number;
  } | null>(null);

  // ── CGV (entity-only, pas de session/client) ─────────────────────────
  const [generatingCgv, setGeneratingCgv] = useState(false);
  const [lastCgvResult, setLastCgvResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);

  // ── RGPD (entity-only, pas de session/client) ────────────────────────
  const [generatingRgpd, setGeneratingRgpd] = useState(false);
  const [lastRgpdResult, setLastRgpdResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);

  // ── Règlement Intérieur (entity-only) ────────────────────────────────
  const [generatingRi, setGeneratingRi] = useState(false);
  const [lastRiResult, setLastRiResult] = useState<{
    engineUsed: string;
    cacheHit: boolean;
    latencyMs: number;
    fileSizeBytes: number;
  } | null>(null);

  // Charge la liste des sessions de l'entité
  useEffect(() => {
    if (!entityId) return;
    (async () => {
      const { data } = await supabase
        .from("sessions")
        .select("id, title, start_date")
        .eq("entity_id", entityId)
        .order("start_date", { ascending: false })
        .limit(50);
      setSessions((data as SessionRow[]) || []);
      setLoadingSessions(false);
    })();
  }, [supabase, entityId]);

  // Charge les entreprises de la session sélectionnée
  useEffect(() => {
    if (!selectedSessionId) {
      setCompanies([]);
      setSelectedClientId("");
      return;
    }
    setLoadingCompanies(true);
    (async () => {
      const { data } = await supabase
        .from("formation_companies")
        .select("client_id, client:clients(id, company_name)")
        .eq("session_id", selectedSessionId);
      setCompanies((data as unknown as CompanyRow[]) || []);
      setLoadingCompanies(false);
    })();
  }, [supabase, selectedSessionId]);

  // Charge les entreprises de la session émargement single
  useEffect(() => {
    if (!emargementSessionId) {
      setEmargementCompanies([]);
      setEmargementClientId("");
      return;
    }
    setLoadingEmargementCompanies(true);
    (async () => {
      const { data } = await supabase
        .from("formation_companies")
        .select("client_id, client:clients(id, company_name)")
        .eq("session_id", emargementSessionId);
      setEmargementCompanies((data as unknown as CompanyRow[]) || []);
      setLoadingEmargementCompanies(false);
    })();
  }, [supabase, emargementSessionId]);

  // ── CGV handler (entity-only, pas de params) ──────────────────────────
  async function handleGenerateCgv() {
    setGeneratingCgv(true);
    setLastCgvResult(null);
    try {
      const res = await fetch("/api/documents/generate-cgv", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastCgvResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "CGV générées", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec génération CGV",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingCgv(false);
    }
  }

  // ── Règlement Intérieur handler ───────────────────────────────────────
  async function handleGenerateRi() {
    setGeneratingRi(true);
    setLastRiResult(null);
    try {
      const res = await fetch("/api/documents/generate-reglement-interieur", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastRiResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Règlement Intérieur généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec génération Règlement Intérieur",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingRi(false);
    }
  }

  // ── RGPD handler (entity-only, pas de params) ─────────────────────────
  async function handleGenerateRgpd() {
    setGeneratingRgpd(true);
    setLastRgpdResult(null);
    try {
      const res = await fetch("/api/documents/generate-rgpd", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastRgpdResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Politique RGPD générée", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec génération RGPD",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingRgpd(false);
    }
  }

  // ── Émargement handlers ───────────────────────────────────────────────
  async function handleGenerateEmargementMock() {
    setGeneratingEmargement(true);
    setLastEmargementResult(null);
    try {
      const res = await fetch("/api/documents/generate-emargement-mock", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastEmargementResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({ title: "Émargement mock généré", description: `${json.engineUsed} · ${json.latencyMs}ms` });
    } catch (err) {
      toast({
        title: "Échec émargement mock",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingEmargement(false);
    }
  }

  async function handleGenerateEmargement() {
    if (!emargementSessionId || !emargementClientId) {
      toast({ title: "Sélection incomplète", description: "Choisis session ET entreprise.", variant: "destructive" });
      return;
    }
    setGeneratingEmargement(true);
    setLastEmargementResult(null);
    try {
      const res = await fetch("/api/documents/generate-emargement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: emargementSessionId, clientId: emargementClientId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastEmargementResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
        signedCount: json.signedCount,
      });
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank");
      toast({
        title: "Émargement généré",
        description: `${json.signedCount ?? 0} signature(s) · ${json.engineUsed} · ${json.latencyMs}ms`,
      });
    } catch (err) {
      toast({
        title: "Échec émargement",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingEmargement(false);
    }
  }

  async function handleGenerateEmargementBatch() {
    if (!emargementBatchSessionId) {
      toast({ title: "Aucune session choisie", description: "Sélectionne d'abord une session.", variant: "destructive" });
      return;
    }
    setGeneratingEmargementBatch(true);
    setLastEmargementBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-emargements-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: emargementBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLastEmargementBatchResult({
        totalCompanies: json.totalCompanies,
        successCount: json.successCount,
        failureCount: json.failureCount,
        errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
        signedCount: json.signedCount,
      });
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === emargementBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `emargements-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: json.failureCount === 0 ? "ZIP émargements généré" : "ZIP avec erreurs",
        description: `${json.successCount}/${json.totalCompanies} feuilles · ${json.signedCount ?? 0} signature(s) · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      toast({
        title: "Échec batch émargements",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setGeneratingEmargementBatch(false);
    }
  }

  async function handleGenerateMock() {
    setGenerating(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/documents/generate-convention-mock", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setLastResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });

      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");

      toast({
        title: "PDF mock généré",
        description: `${json.engineUsed} · ${json.latencyMs}ms`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: "Échec génération mock",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateBatch() {
    if (!selectedBatchSessionId) {
      toast({
        title: "Aucune session choisie",
        description: "Sélectionne d'abord une session.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingBatch(true);
    setLastBatchResult(null);
    try {
      const res = await fetch("/api/documents/generate-conventions-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedBatchSessionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setLastBatchResult({
        totalCompanies: json.totalCompanies,
        successCount: json.successCount,
        failureCount: json.failureCount,
        errors: json.errors ?? [],
        totalLatencyMs: json.totalLatencyMs,
      });

      // Téléchargement auto du ZIP
      const bytes = Uint8Array.from(atob(json.zipBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const sessionLabel = sessions.find((s) => s.id === selectedBatchSessionId)?.title ?? "session";
      a.href = url;
      a.download = `conventions-${sessionLabel.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase().slice(0, 50)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: json.failureCount === 0 ? "ZIP généré" : "ZIP généré avec erreurs",
        description: `${json.successCount}/${json.totalCompanies} conventions · ${json.totalLatencyMs}ms`,
        variant: json.failureCount === 0 ? "default" : "destructive",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: "Échec génération batch",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setGeneratingBatch(false);
    }
  }

  async function handleGenerate() {
    if (!selectedSessionId || !selectedClientId) {
      toast({
        title: "Sélection incomplète",
        description: "Choisis une session ET une entreprise.",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/documents/generate-convention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: selectedSessionId,
          clientId: selectedClientId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setLastResult({
        engineUsed: json.engineUsed,
        cacheHit: json.cacheHit,
        latencyMs: json.latencyMs,
        fileSizeBytes: json.fileSizeBytes,
      });

      // Ouvre le PDF dans un nouvel onglet
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");

      toast({
        title: "PDF généré",
        description: `${json.engineUsed} · ${json.latencyMs}ms · ${(json.fileSizeBytes / 1024).toFixed(1)} KB`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: "Échec génération",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-blue-600" />
          Test nouvelle infra — Convention entreprise
        </h1>
        <p className="text-sm text-muted-foreground">
          Page temporaire (Story B-Convention) pour valider la génération PDF
          via la nouvelle infra Puppeteer + cache + template{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">[%xxx%]</code>.
          Sera intégrée dans <code className="text-xs bg-gray-100 px-1 rounded">TabConventionDocs</code> une fois validée.
        </p>
      </div>

      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-blue-600" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Génère un PDF avec des données mockées (Acme Formation SAS, 3
            apprenants, formation Habilitation Électrique). Permet de valider
            le rendu visuel du template sans avoir besoin de vraie session
            en base. Le logo et la signature organisme viennent quand même
            de ton entité réelle.
          </p>
          <Button
            onClick={handleGenerateMock}
            disabled={generating}
            className="w-full gap-2"
            variant="default"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Générer un PDF de test (données factices)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Données réelles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="session-select" className="text-sm">
              Session (50 dernières)
            </Label>
            <Select
              value={selectedSessionId}
              onValueChange={setSelectedSessionId}
              disabled={loadingSessions || generating}
            >
              <SelectTrigger id="session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="company-select" className="text-sm">
              Entreprise rattachée à la session
            </Label>
            <Select
              value={selectedClientId}
              onValueChange={setSelectedClientId}
              disabled={!selectedSessionId || loadingCompanies || generating}
            >
              <SelectTrigger id="company-select" className="mt-1">
                <SelectValue
                  placeholder={
                    !selectedSessionId
                      ? "Choisis d'abord une session"
                      : loadingCompanies
                        ? "Chargement…"
                        : companies.length === 0
                          ? "Aucune entreprise rattachée"
                          : "Choisir une entreprise…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) =>
                  c.client ? (
                    <SelectItem key={c.client_id} value={c.client_id}>
                      {c.client.company_name}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!selectedSessionId || !selectedClientId || generating}
            className="w-full gap-2"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours… (peut prendre 5-10s si premier rendu)
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Générer la convention (nouvelle infra)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch — toutes les entreprises de la session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>une convention par entreprise</strong> rattachée à la session via{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">formation_companies</code>,
            avec les bons apprenants et le bon montant pour chacune (cf PR #13
            multi-entreprises). Résultat : <strong>1 ZIP</strong> contenant tous les
            PDF. <strong>Fail-soft</strong> : si une entreprise échoue, le ZIP
            contient quand même les autres + un fichier{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">_erreurs.txt</code>.
          </p>

          <div>
            <Label htmlFor="batch-session-select" className="text-sm">
              Session
            </Label>
            <Select
              value={selectedBatchSessionId}
              onValueChange={setSelectedBatchSessionId}
              disabled={loadingSessions || generatingBatch}
            >
              <SelectTrigger id="batch-session-select" className="mt-1">
                <SelectValue
                  placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"}
                />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateBatch}
            disabled={!selectedBatchSessionId || generatingBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            {generatingBatch ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours… (peut durer 10-30s selon le nombre d&apos;entreprises)
              </>
            ) : (
              <>
                <Package className="h-4 w-4" />
                Générer ZIP — toutes les conventions
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {lastBatchResult && (
        <Card
          className={
            lastBatchResult.failureCount === 0
              ? "border-green-200 bg-green-50/30"
              : "border-amber-200 bg-amber-50/30"
          }
        >
          <CardHeader>
            <CardTitle
              className={
                "text-base " +
                (lastBatchResult.failureCount === 0
                  ? "text-green-900"
                  : "text-amber-900")
              }
            >
              {lastBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>{lastBatchResult.successCount}</strong> /{" "}
              {lastBatchResult.totalCompanies} conventions générées
            </div>
            <div>
              <strong>Latence totale :</strong> {lastBatchResult.totalLatencyMs} ms
            </div>
            {lastBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs (
                  {lastBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastBatchResult.errors.map((e) => (
                    <li key={e.clientId}>
                      <strong>{e.companyName}</strong> : {e.error}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Le ZIP téléchargé contient un fichier{" "}
                  <code className="text-xs bg-gray-100 px-1 rounded">_erreurs.txt</code>{" "}
                  avec le détail.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernière génération</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastResult.engineUsed}
              {lastResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div>
              <strong>Latence :</strong> {lastResult.latencyMs} ms
            </div>
            <div>
              <strong>Taille PDF :</strong> {(lastResult.fileSizeBytes / 1024).toFixed(1)} KB
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Le PDF s&apos;est ouvert dans un nouvel onglet. Compare visuellement avec ton{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">convention-entreprise-mrformation.pdf</code> de référence.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    ÉMARGEMENT COLLECTIF — 3 modes (mock / single / batch)        */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <ClipboardList className="h-5 w-5 text-orange-600" />
          Émargement collectif
        </h2>
        <p className="text-sm text-muted-foreground">
          Feuille d&apos;émargement par entreprise. Statut Présent/Absent calculé
          depuis la table <code className="text-xs bg-gray-100 px-1 rounded">signatures</code> en mode réel.
        </p>
      </div>

      <Card className="border-orange-200 bg-orange-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-orange-600" />
            Mode rapide — Données factices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Génère un PDF avec session mockée (10/01/2025, 1 jour, 2 créneaux
            matin/aprem) + 3 apprenants tous Présent. Permet de valider le rendu
            visuel sans dépendre des signatures réelles.
          </p>
          <Button
            onClick={handleGenerateEmargementMock}
            disabled={generatingEmargement || generatingEmargementBatch}
            className="w-full gap-2 bg-orange-600 hover:bg-orange-700"
          >
            {generatingEmargement ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Générer une feuille d&apos;émargement de test
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Émargement — Données réelles (1 entreprise)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="emargement-session-select" className="text-sm">Session</Label>
            <Select
              value={emargementSessionId}
              onValueChange={setEmargementSessionId}
              disabled={loadingSessions || generatingEmargement}
            >
              <SelectTrigger id="emargement-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="emargement-company-select" className="text-sm">Entreprise rattachée</Label>
            <Select
              value={emargementClientId}
              onValueChange={setEmargementClientId}
              disabled={!emargementSessionId || loadingEmargementCompanies || generatingEmargement}
            >
              <SelectTrigger id="emargement-company-select" className="mt-1">
                <SelectValue
                  placeholder={
                    !emargementSessionId
                      ? "Choisis d'abord une session"
                      : loadingEmargementCompanies
                        ? "Chargement…"
                        : emargementCompanies.length === 0
                          ? "Aucune entreprise rattachée"
                          : "Choisir une entreprise…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {emargementCompanies.map((c) =>
                  c.client ? (
                    <SelectItem key={c.client_id} value={c.client_id}>
                      {c.client.company_name}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateEmargement}
            disabled={!emargementSessionId || !emargementClientId || generatingEmargement}
            className="w-full gap-2"
            size="lg"
          >
            {generatingEmargement ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <ClipboardList className="h-4 w-4" />
                Générer la feuille d&apos;émargement
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" />
            Mode batch émargement — toutes les entreprises de la session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Génère <strong>une feuille d&apos;émargement par entreprise</strong> rattachée
            à la session. Statuts Présent/Absent calculés depuis la table{" "}
            <code className="text-xs bg-gray-100 px-1 rounded">signatures</code>{" "}
            (partagée pour toutes les entreprises de la session). Sortie : 1 ZIP.
          </p>

          <div>
            <Label htmlFor="emargement-batch-session-select" className="text-sm">Session</Label>
            <Select
              value={emargementBatchSessionId}
              onValueChange={setEmargementBatchSessionId}
              disabled={loadingSessions || generatingEmargementBatch}
            >
              <SelectTrigger id="emargement-batch-session-select" className="mt-1">
                <SelectValue placeholder={loadingSessions ? "Chargement…" : "Choisir une session…"} />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} — {new Date(s.start_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateEmargementBatch}
            disabled={!emargementBatchSessionId || generatingEmargementBatch}
            className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            {generatingEmargementBatch ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours… (peut durer 10-30s)
              </>
            ) : (
              <>
                <Package className="h-4 w-4" />
                Générer ZIP — toutes les feuilles d&apos;émargement
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {lastEmargementBatchResult && (
        <Card
          className={
            lastEmargementBatchResult.failureCount === 0
              ? "border-green-200 bg-green-50/30"
              : "border-amber-200 bg-amber-50/30"
          }
        >
          <CardHeader>
            <CardTitle
              className={
                "text-base " +
                (lastEmargementBatchResult.failureCount === 0 ? "text-green-900" : "text-amber-900")
              }
            >
              {lastEmargementBatchResult.failureCount === 0 ? "✅" : "⚠️"} Dernier batch émargement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>{lastEmargementBatchResult.successCount}</strong> /{" "}
              {lastEmargementBatchResult.totalCompanies} feuilles générées
            </div>
            <div>
              <strong>Signatures réelles trouvées :</strong>{" "}
              {lastEmargementBatchResult.signedCount ?? 0}
            </div>
            <div>
              <strong>Latence totale :</strong> {lastEmargementBatchResult.totalLatencyMs} ms
            </div>
            {lastEmargementBatchResult.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1 text-amber-900 font-medium">
                  <AlertCircle className="h-4 w-4" /> Erreurs (
                  {lastEmargementBatchResult.errors.length})
                </div>
                <ul className="text-xs space-y-0.5 ml-5 list-disc">
                  {lastEmargementBatchResult.errors.map((e) => (
                    <li key={e.clientId}>
                      <strong>{e.companyName}</strong> : {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastEmargementResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernier émargement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastEmargementResult.engineUsed}
              {lastEmargementResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div>
              <strong>Latence :</strong> {lastEmargementResult.latencyMs} ms
            </div>
            <div>
              <strong>Taille PDF :</strong> {(lastEmargementResult.fileSizeBytes / 1024).toFixed(1)} KB
            </div>
            {lastEmargementResult.signedCount !== undefined && (
              <div>
                <strong>Signatures réelles :</strong> {lastEmargementResult.signedCount}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    CGV — Conditions Générales de Vente (entity-only, statique)  */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <ScrollText className="h-5 w-5 text-emerald-600" />
          Conditions Générales de Vente
        </h2>
        <p className="text-sm text-muted-foreground">
          Document statique (17 articles juridiques). Pas de session/client requis :
          seul l&apos;organisme (nom, SIRET, NDA, adresse, logo) varie selon l&apos;entité.
        </p>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-emerald-600" />
            Générer CGV pour cet organisme
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Génère le PDF des CGV avec les infos de ton entité courante.
            Aussi disponible automatiquement dans l&apos;espace client + apprenant
            (après deploy) — ce bouton est juste pour valider le rendu.
          </p>
          <Button
            onClick={handleGenerateCgv}
            disabled={generatingCgv}
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
            size="lg"
          >
            {generatingCgv ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ScrollText className="h-4 w-4" />
            )}
            Générer les CGV
          </Button>
        </CardContent>
      </Card>

      {lastCgvResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernières CGV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastCgvResult.engineUsed}
              {lastCgvResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div>
              <strong>Latence :</strong> {lastCgvResult.latencyMs} ms
            </div>
            <div>
              <strong>Taille PDF :</strong> {(lastCgvResult.fileSizeBytes / 1024).toFixed(1)} KB
            </div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    RGPD — Politique de protection des données (entity-only)     */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <Shield className="h-5 w-5 text-cyan-600" />
          Politique RGPD
        </h2>
        <p className="text-sm text-muted-foreground">
          Document statique (6 sections + intro + contact DPO). Seul l&apos;organisme
          (nom, email, adresse) varie selon l&apos;entité.
        </p>
      </div>

      <Card className="border-cyan-200 bg-cyan-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-cyan-600" />
            Générer la Politique RGPD pour cet organisme
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Génère le PDF de la Politique RGPD avec les infos de ton entité
            courante (DPO = email + adresse organisme). Aussi disponible dans
            l&apos;espace client + apprenant à côté des CGV.
          </p>
          <Button
            onClick={handleGenerateRgpd}
            disabled={generatingRgpd}
            className="w-full gap-2 bg-cyan-600 hover:bg-cyan-700"
            size="lg"
          >
            {generatingRgpd ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Shield className="h-4 w-4" />
            )}
            Générer la Politique RGPD
          </Button>
        </CardContent>
      </Card>

      {lastRgpdResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernière Politique RGPD</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastRgpdResult.engineUsed}
              {lastRgpdResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div>
              <strong>Latence :</strong> {lastRgpdResult.latencyMs} ms
            </div>
            <div>
              <strong>Taille PDF :</strong> {(lastRgpdResult.fileSizeBytes / 1024).toFixed(1)} KB
            </div>
          </CardContent>
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/*    Règlement Intérieur (entity-only, statique)                  */}
      {/* ════════════════════════════════════════════════════════════════ */}

      <div className="pt-10 border-t-2 border-dashed border-gray-300">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
          <Gavel className="h-5 w-5 text-orange-700" />
          Règlement Intérieur
        </h2>
        <p className="text-sm text-muted-foreground">
          Document statique (8 articles conformes aux articles L.6352-3/4 et
          R.6352-1 à 15 du Code du travail). Seul l&apos;organisme varie.
        </p>
      </div>

      <Card className="border-orange-200 bg-orange-50/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gavel className="h-4 w-4 text-orange-700" />
            Générer le Règlement Intérieur
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Génère le PDF du Règlement Intérieur avec les infos de ton entité
            courante. Aussi disponible dans les espaces client + apprenant.
          </p>
          <Button
            onClick={handleGenerateRi}
            disabled={generatingRi}
            className="w-full gap-2 bg-orange-700 hover:bg-orange-800"
            size="lg"
          >
            {generatingRi ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Gavel className="h-4 w-4" />
            )}
            Générer le Règlement Intérieur
          </Button>
        </CardContent>
      </Card>

      {lastRiResult && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader>
            <CardTitle className="text-base text-green-900">✅ Dernier Règlement Intérieur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>
              <strong>Moteur :</strong> {lastRiResult.engineUsed}
              {lastRiResult.cacheHit && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  ⚡ Cache hit
                </span>
              )}
            </div>
            <div>
              <strong>Latence :</strong> {lastRiResult.latencyMs} ms
            </div>
            <div>
              <strong>Taille PDF :</strong> {(lastRiResult.fileSizeBytes / 1024).toFixed(1)} KB
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
