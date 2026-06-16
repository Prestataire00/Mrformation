"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Key, Loader2, CheckCircle2, XCircle, SkipForward, Copy } from "lucide-react";

interface BatchResultItem {
  trainerId: string;
  fullName: string;
  success: boolean;
  email: string | null;
  password: string | null;
  syntheticEmailUsed: boolean;
  error: string | null;
  skipped: boolean;
}

interface BatchResponse {
  ok: boolean;
  results: BatchResultItem[];
  summary: { successCount: number; skippedCount: number; failureCount: number; total: number };
}

interface TrainerCredentialsActionProps {
  /** IDs explicites ; si absent, le serveur cible les formateurs actifs (avec session) sans compte. */
  trainerIds?: string[];
  onComplete?: () => Promise<void> | void;
}

export default function TrainerCredentialsAction({ trainerIds, onComplete }: TrainerCredentialsActionProps) {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [response, setResponse] = useState<BatchResponse | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);

  const handleBatch = async () => {
    setConfirmOpen(false);
    setProcessing(true);
    try {
      const res = await fetch("/api/trainers/batch-create-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trainerIds && trainerIds.length ? { trainer_ids: trainerIds } : {}),
      });
      const data: BatchResponse = await res.json();
      if (!res.ok) {
        throw new Error((data as unknown as { error: string }).error || `Erreur ${res.status}`);
      }
      setResponse(data);
      setResultsOpen(true);
      const { successCount, skippedCount, failureCount } = data.summary;
      toast({
        title: `${successCount} accès créés`,
        description: [
          skippedCount > 0 ? `${skippedCount} déjà existants` : null,
          failureCount > 0 ? `${failureCount} échec(s)` : null,
        ].filter(Boolean).join(" — ") || "Identifiants générés.",
      });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Échec de la création des accès",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = async () => {
    setResultsOpen(false);
    setResponse(null);
    if (onComplete) await onComplete();
  };

  const copyAll = () => {
    if (!response) return;
    const lines = response.results
      .filter((r) => r.success && !r.skipped && r.password)
      .map((r) => `${r.fullName}\t${r.email}\t${r.password}`);
    const text = ["Formateur\tEmail (connexion)\tMot de passe", ...lines].join("\n");
    navigator.clipboard.writeText(text).then(
      () => toast({ title: "Copié", description: `${lines.length} identifiants copiés dans le presse-papiers.` }),
      () => toast({ title: "Copie impossible", variant: "destructive" }),
    );
  };

  return (
    <>
      <Button
        onClick={() => setConfirmOpen(true)}
        disabled={processing}
        variant="secondary"
        className="bg-white text-gray-800 hover:bg-gray-100"
      >
        {processing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Key className="h-4 w-4 mr-1.5" />}
        {processing ? "Création…" : "Créer les accès"}
      </Button>

      {/* Confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Créer les accès formateurs ?</DialogTitle>
            <DialogDescription>
              {trainerIds && trainerIds.length
                ? `${trainerIds.length} formateur(s) sélectionné(s) recevront un compte.`
                : "Tous les formateurs reliés à au moins une session et sans compte recevront un accès."}{" "}
              Les formateurs sans email réel (ou en doublon) auront un identifiant de connexion synthétique.
              Aucun email n'est envoyé : les identifiants s'affichent pour distribution.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Annuler</Button>
            <Button onClick={handleBatch}>Créer les accès</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Résultats */}
      <Dialog open={resultsOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Résultats — {response?.summary.total} formateur(s) traité(s)</DialogTitle>
            <DialogDescription>
              Notez ces identifiants : le mot de passe n'est affiché qu'une seule fois.
            </DialogDescription>
          </DialogHeader>

          {response && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap items-center">
                <Badge className="bg-green-100 text-green-700">{response.summary.successCount} créés</Badge>
                {response.summary.skippedCount > 0 && (
                  <Badge variant="outline" className="text-gray-500">{response.summary.skippedCount} déjà existants</Badge>
                )}
                {response.summary.failureCount > 0 && (
                  <Badge className="bg-red-100 text-red-700">{response.summary.failureCount} échec(s)</Badge>
                )}
                <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={copyAll}>
                  <Copy className="h-3.5 w-3.5" /> Copier tout
                </Button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2">Formateur</th>
                      <th className="text-left px-3 py-2">Email (connexion)</th>
                      <th className="text-left px-3 py-2">Mot de passe</th>
                      <th className="text-center px-3 py-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {response.results.map((r) => (
                      <tr key={r.trainerId} className="border-t">
                        <td className="px-3 py-2 font-medium">{r.fullName}</td>
                        <td className="px-3 py-2 text-xs">
                          {r.email ?? "—"}
                          {r.syntheticEmailUsed && (
                            <Badge variant="outline" className="ml-1 text-[9px] text-orange-600 border-orange-200">synth.</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{r.password ?? "—"}</td>
                        <td className="px-3 py-2 text-center">
                          {r.skipped ? (
                            <SkipForward className="h-4 w-4 text-gray-400 mx-auto" />
                          ) : r.success ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                          ) : (
                            <span className="flex items-center justify-center gap-1 text-xs text-red-600">
                              <XCircle className="h-4 w-4" />
                              {r.error ? r.error.slice(0, 30) : "Erreur"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
