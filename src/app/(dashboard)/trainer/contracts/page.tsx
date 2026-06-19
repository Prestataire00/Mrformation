"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
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
  const { toast } = useToast();

  const [documents, setDocuments] = useState<TrainerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Résout la fiche formateur (trainers.id) depuis le profil.
    const { data: trainer } = await supabase
      .from("trainers")
      .select("id")
      .eq("profile_id", user.id)
      .single();
    if (!trainer) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    // Contrats du formateur : documents persistés et rattachés à SA fiche
    // (conventions d'intervention générées en admin). Cf. add_generated_documents_trainer_id.
    const { data: docs, error: docsError } = await supabase
      .from("generated_documents")
      .select("id, name, file_url, content, created_at, session_id")
      .eq("trainer_id", (trainer as { id: string }).id)
      .order("created_at", { ascending: false });

    if (docsError) {
      toast({ title: "Erreur", description: "Impossible de charger vos contrats.", variant: "destructive" });
      setDocuments([]);
      setLoading(false);
      return;
    }

    // Titres/dates de session pour l'affichage.
    const sessionIds = Array.from(
      new Set((docs ?? []).map((d) => d.session_id).filter(Boolean)),
    ) as string[];
    const sessionMap = new Map<string, { title: string | null; start_date: string | null }>();
    if (sessionIds.length > 0) {
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, title, start_date")
        .in("id", sessionIds);
      for (const s of sessions ?? []) {
        sessionMap.set(s.id as string, {
          title: (s.title as string) ?? null,
          start_date: (s.start_date as string) ?? null,
        });
      }
    }

    const mapped: TrainerDocument[] = (docs ?? []).map((d: Record<string, unknown>) => {
      const sess = d.session_id ? sessionMap.get(d.session_id as string) : null;
      return {
        id: d.id as string,
        name: d.name as string,
        file_url: d.file_url as string | null,
        content: d.content as string | null,
        created_at: d.created_at as string,
        session_id: d.session_id as string | null,
        session_title: sess?.title ?? null,
        session_start_date: sess?.start_date ?? null,
        client_name: null,
      };
    });
    setDocuments(mapped);

    setLoading(false);
  }, [supabase, toast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Revenir à la 1re page quand la recherche/le filtre change.
  useEffect(() => {
    setPage(1);
  }, [search, yearFilter]);

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

  // Pagination (client) — la liste peut grossir avec le temps.
  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
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
              <Calendar className="h-5 w-5" style={{ color: "#374151" }} />
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
            <FolderOpen className="h-4 w-4" style={{ color: "#374151" }} />
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
              {paged.map((doc) => (
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
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-100">
                  <span className="text-xs text-gray-500">
                    Page {currentPage} / {totalPages} · {filtered.length} document{filtered.length !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                    >
                      Précédent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
