"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { FileText, Upload, Eye, Loader2, CheckCircle2 } from "lucide-react";

/**
 * Carte « Mon CV » de l'espace formateur (EF-3.5). Le formateur consulte et
 * téléverse son propre CV (PDF) via l'endpoint self-service /api/trainer/cv.
 */
export function TrainerCvCard() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasCv, setHasCv] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/trainer/cv");
      setHasCv(res.ok);
    } catch {
      setHasCv(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleView = async () => {
    setOpening(true);
    try {
      const res = await fetch("/api/trainer/cv");
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "CV indisponible");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Impossible d'ouvrir le CV.",
        variant: "destructive",
      });
    } finally {
      setOpening(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Format invalide", description: "Seuls les PDF sont acceptés.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("cv", file);
      const res = await fetch("/api/trainer/cv", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'envoi");
      toast({ title: "CV enregistré", description: "Votre CV a été mis à jour." });
      setHasCv(true);
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Téléversement impossible.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" /> Mon CV
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Chargement…"
            : hasCv
              ? "Un CV est enregistré sur votre fiche."
              : "Aucun CV enregistré. Téléversez votre CV au format PDF."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {hasCv && !loading && (
            <Button variant="outline" size="sm" onClick={handleView} disabled={opening} className="gap-1.5">
              {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Voir mon CV
            </Button>
          )}
          <Button
            variant={hasCv ? "outline" : "default"}
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="gap-1.5"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {hasCv ? "Remplacer" : "Téléverser"}
          </Button>
          {hasCv && !loading && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> PDF présent
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleUpload}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
}
