"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useEntity } from "@/contexts/EntityContext";
import { getInitials } from "@/lib/utils";

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

  const [learners, setLearners] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
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

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const renderPagination = () => {
    const pages = [];
    const maxVisible = 7;
    let start = Math.max(1, page - 3);
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

    for (let i = start; i <= end; i++) pages.push(i);

    return (
      <div className="flex items-center justify-center gap-1 mt-8">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-2 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-40 hover:border-[#3DB5C5] hover:text-[#3DB5C5]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {start > 1 && <><button onClick={() => setPage(1)} className="px-3 py-1 rounded border border-gray-300 text-gray-600 hover:border-[#3DB5C5] hover:text-[#3DB5C5]">1</button><span className="text-gray-400">...</span></>}
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className={`px-3 py-1 rounded border text-sm font-medium ${p === page ? "text-white border-[#3DB5C5]" : "border-gray-300 text-gray-600 hover:border-[#3DB5C5] hover:text-[#3DB5C5]"}`}
            style={p === page ? { background: "#3DB5C5" } : {}}
          >
            {p}
          </button>
        ))}
        {end < totalPages && <><span className="text-gray-400">...</span><button onClick={() => setPage(totalPages)} className="px-3 py-1 rounded border border-gray-300 text-gray-600 hover:border-[#3DB5C5] hover:text-[#3DB5C5]">{totalPages}</button></>}
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="px-2 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-40 hover:border-[#3DB5C5] hover:text-[#3DB5C5]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-4">
        <Link href="/admin" className="text-[#3DB5C5] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/clients" className="text-[#3DB5C5] hover:underline">Clients</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Profils des Apprenants</span>
      </div>

      {/* Title */}
      <h1 className="text-gray-700 text-xl font-bold mb-6">Clients / Profils des Apprenants</h1>

      {/* Search bar */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Rechercher..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm flex-1 max-w-sm focus:outline-none focus:border-[#3DB5C5]"
        />
        <button
          onClick={handleSearch}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium uppercase"
          style={{ background: "#3DB5C5" }}
        >
          <Search className="h-4 w-4 inline mr-1" />
          Rechercher
        </button>
        <Link
          href="/admin/clients/apprenants/liste"
          className="border border-[#3DB5C5] text-[#3DB5C5] px-4 py-2 rounded-lg text-sm flex items-center"
        >
          Voir la liste complète
        </Link>
      </div>

      {/* Results count */}
      <p className="text-sm text-gray-500 mb-4">{total} apprenant{total !== 1 ? "s" : ""} trouvé{total !== 1 ? "s" : ""}</p>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3DB5C5] border-t-transparent" />
        </div>
      ) : learners.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium">Aucun apprenant trouvé</p>
          <p className="text-sm mt-1">Modifiez vos critères de recherche ou ajoutez des apprenants.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {learners.map((learner) => {
            const initials = getInitials(`${learner.first_name} ${learner.last_name}`);
            const companyName = learner.clients?.company_name ?? "—";
            return (
              <Link
                key={learner.id}
                href={`/admin/clients/apprenants/${learner.id}`}
                className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col items-center text-center hover:shadow-md hover:border-[#3DB5C5] transition-all"
              >
                {/* Avatar */}
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg mb-3"
                  style={{ background: "#3DB5C5" }}
                >
                  {initials}
                </div>
                {/* Name */}
                <p className="font-bold text-gray-800 text-sm">
                  {learner.first_name} {learner.last_name}
                </p>
                {/* Email */}
                <p className="text-xs text-gray-500 mt-1 truncate w-full" title={learner.email}>
                  {learner.email}
                </p>
                {/* Company */}
                <p className="text-xs text-gray-400 mt-1">{companyName}</p>
                {/* Reference */}
                <span className="mt-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                  Réf: 0000
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && renderPagination()}
    </div>
  );
}
