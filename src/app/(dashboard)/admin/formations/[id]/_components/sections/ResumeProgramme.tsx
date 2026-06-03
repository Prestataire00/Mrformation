"use client";

/**
 * CONT-2 audit BMAD — Card "Programme pédagogique" dans TabResume.
 *
 * Affiche le détail complet du contenu programme via le composant partagé
 * ProgramContentPreview (le même utilisé dans la pop-up de création de
 * session) — objectifs, modules, méta Qualiopi, certif. Permet à l'admin
 * de comprendre ce qui sera repris dans les documents générés sans
 * naviguer hors de la fiche.
 *
 * En complément : bouton "Exporter le programme PDF" spécifique à cette
 * session (utilise sessionId, donc PDF aligné sur les dates/formateurs
 * de la session concrète).
 */

import { useState } from "react";
import Link from "next/link";
import type { Session } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { BookOpen, Download, Loader2 } from "lucide-react";
import { ProgramContentPreview } from "@/components/programs/ProgramContentPreview";

interface Props {
  formation: Session;
}

export function ResumeProgramme({ formation }: Props) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const program = formation.program;

  const handleExportPdf = async () => {
    if (!program) return;
    setExporting(true);
    try {
      const res = await fetch("/api/documents/generate-programme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: formation.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);

      const bytes = atob(data.pdfBase64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `programme-${program.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Programme exporté", description: "PDF téléchargé." });
    } catch (err) {
      toast({
        title: "Export échoué",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  if (!program) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Aucun programme pédagogique attribué à cette formation.
        </p>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href="/admin/programs">
            <BookOpen className="h-3.5 w-3.5" />
            Choisir un programme
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ProgramContentPreview program={program} />

      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 w-full"
        onClick={handleExportPdf}
        disabled={exporting}
      >
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {exporting ? "Génération…" : "Exporter le programme (PDF)"}
      </Button>
    </div>
  );
}
