"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileText, Loader2, Eye, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import DOMPurify from "dompurify";
import { getDefaultTemplate } from "@/lib/document-templates-defaults";
import { resolveVariables } from "@/lib/utils/resolve-variables";
import { useEntity } from "@/contexts/EntityContext";

const DOC_LABELS: Record<string, string> = {
  convocation: "Convocation à la formation",
  certificat_realisation: "Certificat de réalisation",
  attestation_assiduite: "Attestation d'assiduité",
  feuille_emargement: "Feuille d'émargement",
  micro_certificat: "Micro-certificat",
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
  const entityName = entity?.name || "MR FORMATION";

  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [learner, setLearner] = useState<{ id: string; first_name: string; last_name: string; email: string | null } | null>(null);

  // Preview
  const [previewDoc, setPreviewDoc] = useState<{
    open: boolean;
    html: string;
    title: string;
  } | null>(null);

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

      const { data: docs } = await supabase
        .from("formation_convention_documents")
        .select("id, doc_type, is_sent, template_id, custom_label, session_id")
        .eq("owner_id", learnerData.id)
        .eq("owner_type", "learner")
        .eq("is_confirmed", true)
        .order("created_at", { ascending: true });

      if (!docs || docs.length === 0) {
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
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleView = async (doc: DocRow) => {
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
      htmlContent = getDefaultTemplate(doc.doc_type, {
        formation: { title: doc.session_title, start_date: doc.session_start_date, end_date: doc.session_end_date } as any,
        learner: learner ? { first_name: learner.first_name, last_name: learner.last_name, email: learner.email ?? undefined } : undefined,
        entityName,
      });
    }

    if (!htmlContent) return;

    const label = doc.custom_label || DOC_LABELS[doc.doc_type] || doc.doc_type;
    setPreviewDoc({
      open: true,
      html: DOMPurify.sanitize(htmlContent),
      title: label,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
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

      {/* Preview Dialog — lecture seule, pas de téléchargement */}
      {previewDoc && (
        <Dialog open={previewDoc.open} onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{previewDoc.title}</DialogTitle>
            </DialogHeader>
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: previewDoc.html }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewDoc(null)}>
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
