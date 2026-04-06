"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import {
  FileText,
  Download,
  Search,
  Calendar,
  Building2,
  File,
  FolderOpen,
  Filter,
} from "lucide-react";

interface TrainerDocument {
  id: string;
  name: string;
  file_url: string | null;
  content: string | null;
  created_at: string;
  session_id: string | null;
  session_title: string | null;
  session_start_date: string | null;
  client_name: string | null;
}

export default function TrainerContractsPage() {
  const supabase = createClient();

  const [documents, setDocuments] = useState<TrainerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");

  const fetchDocuments = useCallback(async () => {
    setLoading(true);

    // Get current user to find their trainer record
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    // Find trainer by matching email or user_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    if (!profile) {
      setLoading(false);
      return;
    }

    // Find trainer record
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("email", profile.email)
      .single();

    if (!trainer) {
      setLoading(false);
      return;
    }

    // Get all sessions for this trainer
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, title, start_date, training_id, trainings(title), clients:enrollments(client_id, clients(company_name))")
      .eq("trainer_id", trainer.id);

    const sessionIds = (sessions ?? []).map((s) => s.id);

    if (sessionIds.length === 0) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    // Get documents linked to those sessions
    const { data: docs } = await supabase
      .from("generated_documents")
      .select("*")
      .in("session_id", sessionIds)
      .order("created_at", { ascending: false });

    if (docs) {
      const mapped: TrainerDocument[] = docs.map((d: Record<string, unknown>) => {
        const session = (sessions ?? []).find((s) => s.id === d.session_id);
        const training = session?.trainings as { title?: string } | null;
        // Try to get client name from enrollments
        const enrollments = session?.clients as Array<{ clients?: { company_name?: string } }> | null;
        const firstClient = enrollments?.[0]?.clients?.company_name ?? null;

        return {
          id: d.id as string,
          name: d.name as string,
          file_url: d.file_url as string | null,
          content: d.content as string | null,
          created_at: d.created_at as string,
          session_id: d.session_id as string | null,
          session_title: session?.title ?? training?.title ?? null,
          session_start_date: session?.start_date ?? null,
          client_name: firstClient,
        };
      });
      setDocuments(mapped);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Get unique years from documents
  const years = Array.from(
    new Set(documents.map((d) => new Date(d.created_at).getFullYear()))
  ).sort((a, b) => b - a);

  const filtered = documents.filter((d) => {
    const matchSearch =
      search === "" ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.session_title?.toLowerCase().includes(search.toLowerCase()) ||
      d.client_name?.toLowerCase().includes(search.toLowerCase());
    const matchYear =
      yearFilter === "all" ||
      new Date(d.created_at).getFullYear().toString() === yearFilter;
    return matchSearch && matchYear;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mes Contrats & Documents</h1>
        <p className="text-sm text-gray-500 mt-1">
          Consultez vos contrats de prestation et documents liés à vos sessions
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher par nom, session, client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {years.length > 0 && (
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Année" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les années</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-full bg-blue-100 p-3">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{documents.length}</p>
              <p className="text-xs text-gray-500">Total documents</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-full bg-green-100 p-3">
              <Download className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">
                {documents.filter((d) => d.file_url).length}
              </p>
              <p className="text-xs text-gray-500">Téléchargeables</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border shadow-sm">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-full p-3" style={{ backgroundColor: "#e0f5f8" }}>
              <Calendar className="h-5 w-5" style={{ color: "#DC2626" }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">
                {new Set(documents.map((d) => d.session_id).filter(Boolean)).size}
              </p>
              <p className="text-xs text-gray-500">Sessions concernées</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents list */}
      <Card className="bg-white border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-700 flex items-center gap-2">
            <FolderOpen className="h-4 w-4" style={{ color: "#DC2626" }} />
            Documents ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <FolderOpen className="h-12 w-12 text-gray-300 mb-3" />
              <p className="font-medium text-gray-500">
                {documents.length === 0
                  ? "Aucun document disponible"
                  : "Aucun résultat pour cette recherche"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {documents.length === 0
                  ? "Les contrats et documents liés à vos sessions apparaîtront ici."
                  : "Essayez de modifier vos filtres."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 transition group"
                >
                  <div className="flex-shrink-0 h-11 w-11 rounded-lg bg-blue-50 flex items-center justify-center">
                    <File className="h-5 w-5 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {doc.name}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      {doc.session_title && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {doc.session_title}
                        </span>
                      )}
                      {doc.session_start_date && (
                        <span>{formatDate(doc.session_start_date)}</span>
                      )}
                      {doc.client_name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {doc.client_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-400 whitespace-nowrap">
                    {formatDate(doc.created_at)}
                  </span>
                  {doc.file_url ? (
                    <Button variant="outline" size="sm" className="gap-1.5" asChild>
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3.5 w-3.5" />
                        Télécharger
                      </a>
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-xs text-gray-400">
                      Pas de fichier
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
