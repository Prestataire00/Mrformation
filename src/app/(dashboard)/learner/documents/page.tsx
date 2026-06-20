"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileText, Loader2, Eye, CheckCircle, Clock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import DOMPurify from "dompurify";
import { renderSystemTemplate } from "@/lib/templates/registry";
import { resolveVariables } from "@/lib/utils/resolve-variables";
import { useEntity } from "@/contexts/EntityContext";

const DOC_LABELS: Record<string, string> = {
  convocation: "Convocation à la formation",
  certificat_realisation: "Certificat de réalisation",
  attestation_assiduite: "Attestation d'assiduité",
  feuille_emargement: "Feuille d'émargement",
  cgv: "CGV",
  politique_confidentialite: "Politique de confidentialité",
  reglement_interieur: "Règlement intérieur",
  programme_formation: "Programme de la formation",
  convention_entreprise: "Convention entreprise",
  convention_intervention: "Convention d'intervention",
};

interface DocRow {
  id: string;
  doc_type: string;
  is_sent: boolean;
  template_id: string | null;
  custom_label: string | null;
  file_url: string | null;
  session_id: string;
  session_title: string;
  session_start_date: string | null;
  session_end_date: string | null;
}

interface SessionGroup {
  session_id: string;
  session_title: string;
  session_start_date: string | null;
  session_end_date: string | null;
  docs: DocRow[];
}

export default function LearnerDocumentsPage() {
  const supabase = createClient();
  const { entity } = useEntity();
  const { toast } = useToast();
  const entityName = entity?.name || "MR FORMATION";

  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [learner, setLearner] = useState<{ id: string; first_name: string; last_name: string; email: string | null } | null>(null);

  // Preview : 2 modes selon que le PDF est déjà généré (file_url) ou non
  type PreviewState =
    | { open: true; kind: "pdf"; url: string; title: string }
    | { open: true; kind: "html"; html: string; title: string };
  const [previewDoc, setPreviewDoc] = useState<PreviewState | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: learnerData } = await supabase
        .from("learners")
        .select("id, first_name, last_name, email")
        .eq("profile_id", user.id)
        .single();

      if (!learnerData) {
        setLoading(false);
        return;
      }
      setLearner(learnerData);

      // Table unifiée `documents` : status != 'draft' = confirmé
      const { data: docsRaw } = await supabase
        .from("documents")
        .select("id, doc_type, status, template_id, source_id, metadata, file_url")
        .eq("source_table", "sessions")
        .eq("owner_id", learnerData.id)
        .eq("owner_type", "learner")
        .neq("status", "draft")
        .order("created_at", { ascending: true });

      // Adapter shape vers legacy attendue (is_sent + custom_label + session_id)
      const docs = (docsRaw ?? []).map((d) => ({
        id: d.id as string,
        doc_type: d.doc_type as string,
        is_sent: d.status === "sent" || d.status === "signed",
        template_id: d.template_id as string | null,
        custom_label: (d.metadata as { custom_label?: string } | null)?.custom_label ?? null,
        file_url: d.file_url as string | null,
        session_id: d.source_id as string,
      }));

      if (docs.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      // Fetch unique sessions
      const sessionIds = [...new Set(docs.map((d) => d.session_id))];
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, title, start_date, end_date")
        .in("id", sessionIds);

      const sessionMap = new Map(
        (sessions ?? []).map((s) => [s.id, s])
      );

      // Build grouped rows
      const groupMap = new Map<string, SessionGroup>();
      for (const doc of docs) {
        const session = sessionMap.get(doc.session_id);
        if (!groupMap.has(doc.session_id)) {
          groupMap.set(doc.session_id, {
            session_id: doc.session_id,
            session_title: session?.title || "Formation",
            session_start_date: session?.start_date || null,
            session_end_date: session?.end_date || null,
            docs: [],
          });
        }
        groupMap.get(doc.session_id)!.docs.push({
          ...doc,
          session_title: session?.title || "Formation",
          session_start_date: session?.start_date || null,
          session_end_date: session?.end_date || null,
        });
      }

      setGroups(Array.from(groupMap.values()));
    } catch {
      toast({ variant: "destructive", title: "Impossible de charger les documents" });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleView = async (doc: DocRow) => {
    const label = doc.custom_label || DOC_LABELS[doc.doc_type] || doc.doc_type;

    // Préfère le PDF déjà généré (file_url Supabase Storage) : mise en page A4
    // fidèle, signatures intégrées, identique à ce que l'admin télécharge.
    if (doc.file_url) {
      setPreviewDoc({ open: true, kind: "pdf", url: doc.file_url, title: label });
      return;
    }

    // 1) PDF généré par le MÊME moteur serveur que l'admin (rendu identique) :
    //    /api/documents/generate-from-template (autorisé au learner pour SES docs).
    if (learner) {
      setGeneratingPdf(true);
      try {
        const res = await fetch("/api/documents/generate-from-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doc_type: doc.template_id ? undefined : doc.doc_type,
            template_id: doc.template_id ?? undefined,
            context: { session_id: doc.session_id ?? undefined, learner_id: learner.id },
          }),
        });
        const data = await res.json();
        if (res.ok && data.pdfBase64) {
          const bytes = Uint8Array.from(atob(data.pdfBase64), (ch) => ch.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
          setPreviewDoc({ open: true, kind: "pdf", url, title: label });
          return;
        }
        console.warn("[documents] PDF serveur indisponible:", res.status, data?.error);
        toast({
          title: "Aperçu HTML (PDF serveur indisponible)",
          description: data?.error || `Erreur ${res.status}`,
          variant: "destructive",
        });
      } catch (err) {
        console.warn("[documents] génération PDF serveur échouée:", err);
        toast({
          title: "Aperçu HTML (PDF serveur indisponible)",
          description: err instanceof Error ? err.message : "Erreur réseau",
          variant: "destructive",
        });
      } finally {
        setGeneratingPdf(false);
      }
    }

    // 2) Repli : rendu HTML stylé du template (si la génération serveur échoue).
    let htmlContent: string | null = null;
    if (doc.template_id) {
      const { data: template } = await supabase
        .from("document_templates")
        .select("content")
        .eq("id", doc.template_id)
        .single();
      if (template?.content) {
        htmlContent = resolveVariables(template.content, {
          session: { title: doc.session_title, start_date: doc.session_start_date, end_date: doc.session_end_date } as any,
          learner: learner ? { ...learner, email: learner.email ?? undefined } as any : null,
          client: null,
          trainer: null,
        });
      }
    } else {
      htmlContent = renderSystemTemplate(doc.doc_type, {
        formation: { title: doc.session_title, start_date: doc.session_start_date, end_date: doc.session_end_date } as never,
        learner: learner ? { first_name: learner.first_name, last_name: learner.last_name, email: learner.email ?? undefined } : undefined,
        entityName,
        entity: entity ?? undefined,
      });
    }
    if (!htmlContent) return;
    setPreviewDoc({ open: true, kind: "html", html: DOMPurify.sanitize(htmlContent), title: label });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mes Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Documents confirmés par votre organisme de formation
        </p>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-gray-700">Aucun document disponible pour le moment</p>
            <p className="text-sm text-muted-foreground mt-1">
              Vos documents apparaîtront ici une fois confirmés par l&apos;administration.
            </p>
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.session_id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {group.session_title}
              </CardTitle>
              {group.session_start_date && (
                <p className="text-sm text-muted-foreground">
                  Du {new Date(group.session_start_date).toLocaleDateString("fr-FR")}
                  {group.session_end_date && ` au ${new Date(group.session_end_date).toLocaleDateString("fr-FR")}`}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {group.docs.map((doc) => {
                  const label = doc.custom_label || DOC_LABELS[doc.doc_type] || doc.doc_type;
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{label}</span>
                        {doc.is_sent ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" /> Envoyé
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs">
                            <Clock className="h-3 w-3 mr-1" /> Disponible
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleView(doc)}
                      >
                        <Eye className="h-3 w-3 mr-1" /> Voir
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Overlay de génération PDF */}
      {generatingPdf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg px-6 py-4 flex items-center gap-3 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-[#374151]" />
            <span className="text-sm text-gray-700">Génération du PDF…</span>
          </div>
        </div>
      )}

      {/* Preview Dialog — lecteur PDF natif (iframe) */}
      {previewDoc && (
        <Dialog
          open={previewDoc.open}
          onOpenChange={(open) => {
            if (!open) {
              if (previewDoc.kind === "pdf" && previewDoc.url.startsWith("blob:")) {
                URL.revokeObjectURL(previewDoc.url);
              }
              setPreviewDoc(null);
            }
          }}
        >
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{previewDoc.title}</DialogTitle>
            </DialogHeader>
            {previewDoc.kind === "pdf" ? (
              <iframe
                src={previewDoc.url}
                title={previewDoc.title}
                className="w-full flex-1 min-h-[70vh] border border-gray-200 rounded"
              />
            ) : (
              <div className="flex-1 overflow-y-auto bg-gray-100 rounded p-4">
                <div
                  className="prose prose-sm max-w-none bg-white mx-auto shadow-md rounded-sm"
                  style={{ width: "210mm", maxWidth: "100%", minHeight: "297mm", padding: "20mm 18mm", boxSizing: "border-box" }}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewDoc.html) }}
                />
              </div>
            )}
            <DialogFooter>
              {previewDoc.kind === "pdf" && (
                <a
                  href={previewDoc.url}
                  download={`${previewDoc.title}.pdf`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#374151] hover:bg-[#1f2937] rounded-md transition-colors"
                >
                  <Download className="h-4 w-4" /> Télécharger
                </a>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  if (previewDoc.kind === "pdf" && previewDoc.url.startsWith("blob:")) {
                    URL.revokeObjectURL(previewDoc.url);
                  }
                  setPreviewDoc(null);
                }}
              >
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
