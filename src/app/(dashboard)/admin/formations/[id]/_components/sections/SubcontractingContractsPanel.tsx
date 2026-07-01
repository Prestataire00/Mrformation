"use client";

/**
 * Lot Sub audit BMAD — Panneau de génération des contrats de sous-traitance
 * pour les formateurs rattachés à la session/formation courante.
 *
 * Avant : la chaîne backend (template + route /api/documents/generate-
 * convention-intervention + résolveur de variables formateur) était 100%
 * fonctionnelle, mais le bouton n'existait QUE dans la page test
 * /admin/test-convention. Aucun admin métier n'y accédait.
 *
 * Ce composant rend le bouton accessible depuis TabConventionDocs.
 *
 * Pour chaque formateur rattaché :
 *  - Badge "profil incomplet" si SIRET / NDA / adresse manquent (le PDF
 *    aurait des [Placeholder] visibles → la génération est bloquée).
 *  - Bouton "Générer la convention" qui appelle generate-convention-intervention.
 *  - Bouton "Contrat de sous-traitance" qui appelle generate-contrat-sous-traitance.
 *  - Affichage du coût HT calculé côté API si disponible.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { FileSignature, Loader2, AlertTriangle, Download, FileText } from "lucide-react";
import type { Session, Trainer } from "@/lib/types";

interface Props {
  formation: Session;
}

type FormationTrainerRow = {
  id: string;
  trainer_id: string;
  agreed_cost_ht: number | null;
  hourly_rate: number | null;
  hours_done: number | null;
  daily_rate: number | null;
  dates_done: string | null;
  trainer: Pick<
    Trainer,
    "id" | "first_name" | "last_name" | "siret" | "nda" | "address" | "postal_code" | "city"
  > | null;
};

function missingTrainerFields(trainer: FormationTrainerRow["trainer"]): string[] {
  if (!trainer) return ["formateur inconnu"];
  const missing: string[] = [];
  if (!trainer.siret) missing.push("SIRET");
  if (!trainer.nda) missing.push("NDA");
  if (!trainer.address) missing.push("adresse");
  return missing;
}

function downloadPdfFromBase64(base64: string, filename: string) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Clé composite pour l'état de chargement : `${trainerId}:${docType}` */
type GeneratingKey = `${string}:convention` | `${string}:contrat_st`;

export function SubcontractingContractsPanel({ formation }: Props) {
  const supabase = createClient();
  const { toast } = useToast();
  const [rows, setRows] = useState<FormationTrainerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<GeneratingKey | null>(null);

  const fetchTrainers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("formation_trainers")
      .select(
        "id, trainer_id, agreed_cost_ht, hourly_rate, hours_done, daily_rate, dates_done, trainer:trainers(id, first_name, last_name, siret, nda, address, postal_code, city)",
      )
      .eq("session_id", formation.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      setRows([]);
    } else {
      setRows((data as unknown as FormationTrainerRow[]) || []);
    }
    setLoading(false);
  }, [supabase, toast, formation.id]);

  useEffect(() => {
    fetchTrainers();
  }, [fetchTrainers]);

  /**
   * Logique commune aux deux boutons : vérifie le profil, appelle l'endpoint,
   * télécharge le PDF. Seuls l'endpoint et le nom de fichier diffèrent.
   */
  const handleGenerateDoc = async (
    row: FormationTrainerRow,
    endpoint: string,
    filenamePrefix: string,
    successTitle: string,
    generatingKey: GeneratingKey,
  ) => {
    if (!row.trainer) return;
    const missing = missingTrainerFields(row.trainer);
    if (missing.length > 0) {
      toast({
        title: "Profil formateur incomplet",
        description: `Champ(s) manquant(s) : ${missing.join(", ")}. Complétez la fiche formateur avant de générer.`,
        variant: "destructive",
      });
      return;
    }
    setGenerating(generatingKey);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: formation.id, trainerId: row.trainer_id }),
      });
      const data = (await res.json()) as { pdfBase64?: string; costHt?: number; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      if (!data.pdfBase64) {
        throw new Error("Réponse API invalide : pdfBase64 manquant");
      }
      const filename = `${filenamePrefix}-${row.trainer.last_name?.toLowerCase() ?? "formateur"}-${row.trainer_id.slice(0, 8)}.pdf`;
      downloadPdfFromBase64(data.pdfBase64, filename);
      toast({
        title: successTitle,
        description: `${row.trainer.first_name} ${row.trainer.last_name}${data.costHt != null ? ` — coût HT : ${data.costHt} €` : ""}`,
      });
    } catch (err) {
      toast({
        title: "Génération échouée",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerate = (row: FormationTrainerRow) =>
    handleGenerateDoc(
      row,
      "/api/documents/generate-convention-intervention",
      "convention-intervention",
      "Convention générée",
      `${row.trainer_id}:convention`,
    );

  const handleGenerateContratST = (row: FormationTrainerRow) =>
    handleGenerateDoc(
      row,
      "/api/documents/generate-contrat-sous-traitance",
      "contrat-sous-traitance",
      "Contrat de sous-traitance généré",
      `${row.trainer_id}:contrat_st`,
    );

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement formateurs…
      </div>
    );
  }

  if (rows.length === 0) {
    return null; // Pas de formateurs rattachés → rien à afficher
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-purple-50 border-b border-purple-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-2">
          <FileSignature className="h-4 w-4" />
          Contrats de sous-traitance ({rows.length})
        </h3>
        <p className="text-xs text-purple-700 mt-0.5">
          Générer le contrat de sous-traitance pour chaque formateur rattaché à la session.
          Les informations sont reprises automatiquement depuis la fiche formateur (SIRET, NDA, adresse, signature, coût HT).
        </p>
      </div>
      <div className="divide-y">
        {rows.map((row) => {
          const missing = missingTrainerFields(row.trainer);
          const isGeneratingConvention = generating === `${row.trainer_id}:convention`;
          const isGeneratingContratST = generating === `${row.trainer_id}:contrat_st`;
          const isAnyGenerating = isGeneratingConvention || isGeneratingContratST;
          const trainer = row.trainer;
          return (
            <div key={row.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {trainer?.last_name?.toUpperCase() || "—"} {trainer?.first_name || ""}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {missing.length === 0 ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                      Profil complet
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Manque : {missing.join(", ")}
                    </Badge>
                  )}
                  {row.agreed_cost_ht != null && (
                    <span className="text-xs text-muted-foreground">{row.agreed_cost_ht} € HT</span>
                  )}
                  {row.agreed_cost_ht == null && row.hourly_rate != null && row.hours_done != null && (
                    <span className="text-xs text-muted-foreground">
                      {row.hourly_rate} €/h × {row.hours_done}h
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGenerate(row)}
                  disabled={isAnyGenerating || missing.length > 0}
                  className="gap-1.5"
                >
                  {isGeneratingConvention ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {isGeneratingConvention ? "Génération…" : "Convention"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleGenerateContratST(row)}
                  disabled={isAnyGenerating || missing.length > 0}
                  className="gap-1.5"
                >
                  {isGeneratingContratST ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  {isGeneratingContratST ? "Génération…" : "Contrat de sous-traitance"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
