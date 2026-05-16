"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useEntity } from "@/contexts/EntityContext";
import { FileText, ScrollText, Download, Loader2, Shield } from "lucide-react";

/**
 * Documents accessibles à l'entreprise cliente.
 *
 * Pour l'instant : juste les CGV (téléchargement direct). À terme, ajoutera
 * la liste des conventions/factures/devis liés aux formations achetées par
 * l'entreprise (lien `formation_companies`).
 */
export default function ClientDocumentsPage() {
  const { toast } = useToast();
  const { entity } = useEntity();
  const entityName = entity?.name || "MR FORMATION";
  const [downloadingCgv, setDownloadingCgv] = useState(false);
  const [downloadingRgpd, setDownloadingRgpd] = useState(false);

  const downloadStaticDoc = async (
    endpoint: string,
    filenamePrefix: string,
    setLoading: (b: boolean) => void,
  ) => {
    setLoading(true);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenamePrefix}-${entityName.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: "Téléchargement impossible",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadCgv = () =>
    downloadStaticDoc("/api/documents/generate-cgv", "CGV", setDownloadingCgv);
  const downloadRgpd = () =>
    downloadStaticDoc("/api/documents/generate-rgpd", "Politique-RGPD", setDownloadingRgpd);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Documents légaux et contractuels de votre organisme de formation.
        </p>
      </div>

      {/* Docs statiques entity-level (toujours disponibles) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-emerald-700" />
              Conditions Générales de Vente
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Document légal régissant la relation avec {entityName}.
            </p>
          </CardHeader>
          <CardContent>
            <Button
              onClick={downloadCgv}
              disabled={downloadingCgv}
              variant="default"
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              size="sm"
            >
              {downloadingCgv ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Télécharger les CGV
            </Button>
          </CardContent>
        </Card>

        <Card className="border-cyan-200 bg-cyan-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-cyan-700" />
              Politique RGPD
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Protection des données personnelles, conformité RGPD.
            </p>
          </CardHeader>
          <CardContent>
            <Button
              onClick={downloadRgpd}
              disabled={downloadingRgpd}
              variant="default"
              className="gap-2 bg-cyan-600 hover:bg-cyan-700"
              size="sm"
            >
              {downloadingRgpd ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Télécharger la Politique RGPD
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Placeholder pour docs formation (conventions/factures) — à venir */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            Documents par formation
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Conventions, factures et attestations liées à vos formations.
          </p>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground italic py-4 text-center">
            Disponible prochainement. En attendant, contactez votre organisme.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
