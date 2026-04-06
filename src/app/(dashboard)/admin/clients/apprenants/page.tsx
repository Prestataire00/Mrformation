"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useEntity } from "@/contexts/EntityContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Learner {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  client_id?: string;
  clients?: { company_name: string } | null;
}

const PAGE_SIZE = 12;

export default function ApprenantsProfilesPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();
  const router = useRouter();

  const [learners, setLearners] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchLearners = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      let query = supabase
        .from("learners")
        .select("id, first_name, last_name, email, client_id, clients(company_name)", { count: "exact" })
        .eq("entity_id", entityId)
        .order("last_name", { ascending: true });

      if (search.trim()) {
        query = query.or(`first_name.ilike.%${search.trim()}%,last_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
      }

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      setLearners((data as unknown as Learner[]) ?? []);
      setTotal(count ?? 0);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les apprenants.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supabase, search, page, toast, entityId]);

  useEffect(() => { fetchLearners(); }, [fetchLearners]);

  // Unique companies from loaded learners for the filter
  const uniqueCompanies = useMemo(() => {
    const companies = learners
      .map((l) => l.clients?.company_name)
      .filter((c): c is string => !!c);
    return [...new Set(companies)].sort();
  }, [learners]);

  // Filter learners by company client-side
  const filteredLearners = useMemo(() => {
    if (companyFilter === "all") return learners;
    return learners.filter((l) => l.clients?.company_name === companyFilter);
  }, [learners, companyFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const renderPagination = () => {
    const pages = [];
    const maxVisible = 7;
    let start = Math.max(1, page - 3);
    const end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

    for (let i = start; i <= end; i++) pages.push(i);

    return (
      <div className="flex items-center justify-center gap-1 mt-8">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-2 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-40 hover:border-[#DC2626] hover:text-[#DC2626]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {start > 1 && <><button onClick={() => setPage(1)} className="px-3 py-1 rounded border border-gray-300 text-gray-600 hover:border-[#DC2626] hover:text-[#DC2626]">1</button><span className="text-gray-400">...</span></>}
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className={`px-3 py-1 rounded border text-sm font-medium ${p === page ? "text-white border-[#DC2626]" : "border-gray-300 text-gray-600 hover:border-[#DC2626] hover:text-[#DC2626]"}`}
            style={p === page ? { background: "#DC2626" } : {}}
          >
            {p}
          </button>
        ))}
        {end < totalPages && <><span className="text-gray-400">...</span><button onClick={() => setPage(totalPages)} className="px-3 py-1 rounded border border-gray-300 text-gray-600 hover:border-[#DC2626] hover:text-[#DC2626]">{totalPages}</button></>}
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="px-2 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-40 hover:border-[#DC2626] hover:text-[#DC2626]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header compact */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-gray-900">Apprenants</h1>
          <span className="text-xs text-gray-500"><span className="font-bold text-sm text-gray-900">{total}</span> profils</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="text-xs" onClick={() => router.push("/admin/clients/apprenants/liste")}>Vue liste</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={companyFilter} onValueChange={(v) => { setCompanyFilter(v); setPage(1); }}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Entreprise" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les entreprises</SelectItem>
            {uniqueCompanies.map((company) => (
              <SelectItem key={company} value={company}>{company}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#DC2626] border-t-transparent" />
        </div>
      ) : filteredLearners.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium">Aucun apprenant trouvé</p>
          <p className="text-sm mt-1">Modifiez vos critères de recherche ou ajoutez des apprenants.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredLearners.map((learner) => (
            <Link
              key={learner.id}
              href={`/admin/clients/apprenants/${learner.id}`}
              className="border rounded-lg p-3.5 hover:border-[#DC2626]/40 hover:shadow-sm transition-all bg-white flex items-start gap-3"
            >
              <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                {learner.first_name.charAt(0)}{learner.last_name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{learner.first_name} {learner.last_name}</p>
                {learner.clients?.company_name ? (
                  <p className="text-xs text-[#DC2626] mt-0.5 truncate">{learner.clients.company_name}</p>
                ) : (
                  <p className="text-xs text-gray-300 mt-0.5 italic">Sans entreprise</p>
                )}
                {learner.email && (
                  <p className="text-[10px] text-gray-400 mt-1 truncate">{learner.email}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && renderPagination()}
    </div>
  );
}
