"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useEntity } from "@/contexts/EntityContext";
import { sanitizeSearchInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BatchCredentialsAction from "@/components/credentials/BatchCredentialsAction";

interface Learner {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  client_id: string | null;
  profile_id: string | null;
  username: string | null;
  synthetic_email_used: boolean;
  clients: { company_name: string } | null;
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
  const [accessFilter, setAccessFilter] = useState<"all" | "with" | "without">("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchLearners = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      let query = supabase
        .from("learners")
        .select("id, first_name, last_name, email, client_id, profile_id, username, synthetic_email_used, clients(company_name)", { count: "exact" })
        .eq("entity_id", entityId)
        .order("last_name", { ascending: true });

      const safe = sanitizeSearchInput(search);
      if (safe) {
        query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%`);
      }

      if (accessFilter === "with") {
        query = query.not("profile_id", "is", null);
      } else if (accessFilter === "without") {
        query = query.is("profile_id", null);
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
  }, [supabase, search, page, accessFilter, toast, entityId]);

  useEffect(() => { fetchLearners(); }, [fetchLearners]);

  // Clear selection on filter/page change
  useEffect(() => { setSelectedIds(new Set()); }, [search, page, accessFilter, companyFilter]);

  const uniqueCompanies = useMemo(() => {
    const companies = learners
      .map((l) => l.clients?.company_name)
      .filter((c): c is string => !!c);
    return [...new Set(companies)].sort();
  }, [learners]);

  const filteredLearners = useMemo(() => {
    if (companyFilter === "all") return learners;
    return learners.filter((l) => l.clients?.company_name === companyFilter);
  }, [learners, companyFilter]);

  const selectableLearners = useMemo(
    () => filteredLearners.filter((l) => !l.profile_id),
    [filteredLearners],
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableLearners.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableLearners.map((l) => l.id)));
    }
  };

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
          className="px-2 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-40 hover:border-[#374151] hover:text-[#374151]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {start > 1 && (
          <>
            <button onClick={() => setPage(1)} className="px-3 py-1 rounded border border-gray-300 text-gray-600 hover:border-[#374151] hover:text-[#374151]">1</button>
            <span className="text-gray-400">...</span>
          </>
        )}
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className={`px-3 py-1 rounded border text-sm font-medium ${p === page ? "text-white border-[#374151]" : "border-gray-300 text-gray-600 hover:border-[#374151] hover:text-[#374151]"}`}
            style={p === page ? { background: "#374151" } : {}}
          >
            {p}
          </button>
        ))}
        {end < totalPages && (
          <>
            <span className="text-gray-400">...</span>
            <button onClick={() => setPage(totalPages)} className="px-3 py-1 rounded border border-gray-300 text-gray-600 hover:border-[#374151] hover:text-[#374151]">{totalPages}</button>
          </>
        )}
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="px-2 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-40 hover:border-[#374151] hover:text-[#374151]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-gray-900">Apprenants</h1>
          <span className="text-xs text-gray-500">
            <span className="font-bold text-sm text-gray-900">{total}</span> profils
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="text-xs" onClick={() => router.push("/admin/clients/apprenants/liste")}>
            Vue liste
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
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
        <Select value={accessFilter} onValueChange={(v) => { setAccessFilter(v as "all" | "with" | "without"); setPage(1); }}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Acc\u00e8s" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="with">Avec acc\u00e8s</SelectItem>
            <SelectItem value="without">Sans acc\u00e8s</SelectItem>
          </SelectContent>
        </Select>
        {selectableLearners.length > 0 && (
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={toggleSelectAll}>
            {selectedIds.size === selectableLearners.length ? "D\u00e9s\u00e9lectionner tout" : `S\u00e9lectionner tout sans acc\u00e8s (${selectableLearners.length})`}
          </Button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#374151] border-t-transparent" />
        </div>
      ) : filteredLearners.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium">Aucun apprenant trouv\u00e9</p>
          <p className="text-sm mt-1">Modifiez vos crit\u00e8res de recherche ou ajoutez des apprenants.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredLearners.map((learner) => {
            const hasAccess = !!learner.profile_id;
            const isSelected = selectedIds.has(learner.id);

            return (
              <div
                key={learner.id}
                className={`border rounded-lg p-3.5 bg-white flex items-start gap-3 transition-all ${
                  isSelected ? "border-[#374151] ring-1 ring-[#374151]/20" : "hover:border-[#374151]/40 hover:shadow-sm"
                }`}
              >
                {/* Checkbox for no-access learners */}
                <div className="pt-0.5">
                  {!hasAccess ? (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(learner.id)}
                      aria-label={`S\u00e9lectionner ${learner.first_name} ${learner.last_name}`}
                    />
                  ) : (
                    <div className="h-4 w-4" /> // spacer
                  )}
                </div>

                <Link
                  href={`/admin/clients/apprenants/${learner.id}`}
                  className="flex items-start gap-3 flex-1 min-w-0"
                >
                  <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                    {learner.first_name.charAt(0)}{learner.last_name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-gray-900 leading-tight truncate">
                        {learner.first_name} {learner.last_name}
                      </p>
                      {hasAccess ? (
                        <Badge className="bg-green-100 text-green-700 text-[9px] shrink-0">Actif</Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-400 text-[9px] shrink-0">Sans acc\u00e8s</Badge>
                      )}
                    </div>
                    {learner.clients?.company_name ? (
                      <p className="text-xs text-[#374151] mt-0.5 truncate">{learner.clients.company_name}</p>
                    ) : (
                      <p className="text-xs text-gray-300 mt-0.5 italic">Sans entreprise</p>
                    )}
                    {learner.email && !learner.synthetic_email_used && (
                      <p className="text-[10px] text-gray-400 mt-1 truncate">{learner.email}</p>
                    )}
                    {learner.username && (
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">@{learner.username}</p>
                    )}
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && renderPagination()}

      {/* Batch action footer */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-6 py-3 flex items-center justify-between z-40">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">
              {selectedIds.size} apprenant{selectedIds.size > 1 ? "s" : ""} s\u00e9lectionn\u00e9{selectedIds.size > 1 ? "s" : ""}
            </span>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setSelectedIds(new Set())}>
              D\u00e9s\u00e9lectionner
            </Button>
          </div>
          {selectedIds.size <= 100 ? (
            <BatchCredentialsAction
              selectedLearnerIds={[...selectedIds]}
              onComplete={async () => { setSelectedIds(new Set()); await fetchLearners(); }}
            />
          ) : (
            <span className="text-xs text-red-500">Max 100 apprenants par batch</span>
          )}
        </div>
      )}
    </div>
  );
}
