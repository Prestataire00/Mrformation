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
import { Loader2, FileText, Sparkles } from "lucide-react";

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
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<{
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sélection</CardTitle>
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
    </div>
  );
}
