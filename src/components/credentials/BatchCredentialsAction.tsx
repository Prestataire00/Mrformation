"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Key, Loader2, Download, CheckCircle2, XCircle, SkipForward } from "lucide-react";

interface BatchResultItem {
  learnerId: string;
  fullName: string;
  success: boolean;
  username: string | null;
  email: string | null;
  syntheticEmailUsed: boolean;
  error: string | null;
  skipped: boolean;
}

interface BatchResponse {
  ok: boolean;
  results: BatchResultItem[];
  summary: { successCount: number; skippedCount: number; failureCount: number; total: number };
  pdfSignedUrl: string | null;
}

interface BatchCredentialsActionProps {
  selectedLearnerIds: string[];
  onComplete?: () => Promise<void>;
}

export default function BatchCredentialsAction({ selectedLearnerIds, onComplete }: BatchCredentialsActionProps) {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [response, setResponse] = useState<BatchResponse | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const count = selectedLearnerIds.length;

  const handleBatch = async () => {
    setConfirmOpen(false);
    setProcessing(true);
    try {
      const res = await fetch("/api/learners/batch-create-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learner_ids: selectedLearnerIds }),
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
          data.pdfSignedUrl ? "PDF prêt au téléchargement." : null,
        ].filter(Boolean).join(" — "),
      });
    } catch (err) {
      toast({
        title: "Erreur batch",
        description: err instanceof Error ? err.message : "Échec de la création en masse",
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

  if (count === 0) return null;

  return (
    <>
      <Button size="sm" className="gap-1.5" disabled={processing || count > 100} onClick={() => setConfirmOpen(true)}>
        {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
        {processing ? "Cr\u00e9ation en cours\u2026" : `Cr\u00e9er acc\u00e8s (${count})`}
      </Button>

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cr\u00e9er {count} acc\u00e8s ?</DialogTitle>
            <DialogDescription>
              {count} comptes seront cr\u00e9\u00e9s avec credentials uniques.
              Les apprenants sans email recevront un email synth\u00e9tique.
              Un PDF combin\u00e9 sera g\u00e9n\u00e9r\u00e9 pour impression.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Annuler</Button>
            <Button onClick={handleBatch}>Cr\u00e9er {count} acc\u00e8s</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results Dialog */}
      <Dialog open={resultsOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Résultats — {response?.summary.total} apprenants traités</DialogTitle>
          </DialogHeader>

          {response && (
            <div className="space-y-4">
              {/* Summary badges */}
              <div className="flex gap-2 flex-wrap">
                <Badge className="bg-green-100 text-green-700">
                  {response.summary.successCount} créés
                </Badge>
                {response.summary.skippedCount > 0 && (
                  <Badge variant="outline" className="text-gray-500">
                    {response.summary.skippedCount} déjà existants
                  </Badge>
                )}
                {response.summary.failureCount > 0 && (
                  <Badge className="bg-red-100 text-red-700">
                    {response.summary.failureCount} échec(s)
                  </Badge>
                )}
              </div>

              {/* Results table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2">Apprenant</th>
                      <th className="text-left px-3 py-2">Identifiant</th>
                      <th className="text-left px-3 py-2">Email</th>
                      <th className="text-center px-3 py-2">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {response.results.map((r) => (
                      <tr key={r.learnerId} className="border-t">
                        <td className="px-3 py-2 font-medium">{r.fullName}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.username ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">
                          {r.email ?? "—"}
                          {r.syntheticEmailUsed && (
                            <Badge variant="outline" className="ml-1 text-[9px] text-orange-600 border-orange-200">synth.</Badge>
                          )}
                        </td>
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

              {/* PDF download */}
              {response.pdfSignedUrl && (
                <a
                  href={response.pdfSignedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#374151] hover:opacity-90"
                >
                  <Download className="h-4 w-4" /> Télécharger PDF credentials
                </a>
              )}
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
