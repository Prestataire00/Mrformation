"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2 } from "lucide-react";

interface LearnerFull {
  id: string;
  entity_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  client_id: string | null;
  profile_id: string | null;
  job_title: string | null;
  birth_date: string | null;
  birth_city: string | null;
  gender: "M" | "F" | "autre" | null;
  nationality: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  social_security_number: string | null;
  education_level: string | null;
  learner_type: string | null;
  loris_metadata: Record<string, string | number | null> | null;
  loris_external_id: string | null;
  created_at: string;
  updated_at: string;
  avatar_url: string | null;
  clients: { company_name: string } | null;
  welcome_email_sent_at: string | null;
}

interface Document {
  id: string;
  doc_type: string;
  label: string | null;
  status: string;
  file_url: string | null;
  created_at: string;
}

interface TabDocumentsProps {
  learner: LearnerFull;
}

const formatDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR") : "\u2014";

function docStatusColor(status: string): string {
  switch (status) {
    case "generated": return "bg-green-100 text-green-700";
    case "pending": return "bg-amber-100 text-amber-700";
    case "error": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function docStatusLabel(status: string): string {
  switch (status) {
    case "generated": return "Genere";
    case "pending": return "En attente";
    case "error": return "Erreur";
    case "draft": return "Brouillon";
    default: return status;
  }
}

export default function TabDocuments({ learner }: TabDocumentsProps) {
  const supabase = createClient();
  const { entityId } = useEntity();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("id, doc_type, label, status, file_url, created_at")
        .eq("owner_type", "learner")
        .eq("owner_id", learner.id)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });

      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        setDocuments([]);
      } else {
        setDocuments((data as Document[]) ?? []);
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les documents", variant: "destructive" });
    }
    setLoading(false);
  }, [learner.id, entityId, supabase, toast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          Documents
          <span className="text-xs font-normal text-gray-400">{documents.length} document{documents.length !== 1 ? "s" : ""}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Aucun document pour cet apprenant.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-400 uppercase tracking-wider">
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Libelle</th>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Statut</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-gray-400" />
                        {doc.doc_type}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-700">{doc.label || "\u2014"}</td>
                    <td className="py-2 pr-4 text-gray-500">{formatDate(doc.created_at)}</td>
                    <td className="py-2 pr-4">
                      <Badge className={docStatusColor(doc.status)}>{docStatusLabel(doc.status)}</Badge>
                    </td>
                    <td className="py-2 text-right">
                      {doc.file_url ? (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-300">\u2014</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
