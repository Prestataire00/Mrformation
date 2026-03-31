"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Download, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";
import { useToast } from "@/components/ui/use-toast";
import { useEntity } from "@/contexts/EntityContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Trainer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  type?: string;
  bio?: string;
  hourly_rate?: number;
}

const PAGE_SIZE = 15;

export default function TrainersListePage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();

  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<Trainer | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchTrainers = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      let query = supabase
        .from("trainers")
        .select("id, first_name, last_name, email, phone, type, bio, hourly_rate", { count: "exact" })
        .eq("entity_id", entityId)
        .order("last_name", { ascending: true });

      if (search.trim()) {
        query = query.or(`first_name.ilike.%${search.trim()}%,last_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
      }

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      setTrainers((data as unknown as Trainer[]) ?? []);
      setTotal(count ?? 0);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les formateurs.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supabase, search, page, toast, entityId]);

  useEffect(() => { fetchTrainers(); }, [fetchTrainers]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("trainers")
        .update({
          first_name: editItem.first_name,
          last_name: editItem.last_name,
          email: editItem.email,
          phone: editItem.phone || null,
        })
        .eq("id", editItem.id);
      if (error) throw error;
      toast({ title: "Modifié", description: "Le formateur a été mis à jour." });
      setEditItem(null);
      fetchTrainers();
    } catch {
      toast({ title: "Erreur", description: "Impossible de modifier.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer ${name} ?`)) return;
    const { error } = await supabase.from("trainers").delete().eq("id", id);
    if (error) {
      toast({ title: "Erreur", description: "Impossible de supprimer.", variant: "destructive" });
    } else {
      toast({ title: "Supprimé", description: `${name} a été supprimé.` });
      fetchTrainers();
    }
  };

  const handleDownloadExcel = async () => {
    if (!entityId) return;
    // Fetch ALL trainers (not just current page)
    const { data } = await supabase
      .from("trainers")
      .select("first_name, last_name, email, phone, type")
      .eq("entity_id", entityId)
      .order("last_name", { ascending: true });
    const all = data ?? [];
    const headers = ["Nom", "Téléphone", "Email", "Type"];
    const rows = all.map((t: Record<string, string | null>) => [
      `${t.last_name} ${t.first_name}`,
      t.phone ?? "",
      t.email ?? "",
      t.type === "internal" ? "Interne" : t.type === "external" ? "Externe" : "",
    ]);
    downloadXlsx(headers, rows, "formateurs.xlsx");
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-4">
        <Link href="/admin" className="text-[#3DB5C5] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/trainers" className="text-[#3DB5C5] hover:underline">Formateurs</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Liste complète</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-gray-700 text-xl font-bold">Formateurs / Tous Les Formateurs</h1>
        <button
          onClick={handleDownloadExcel}
          className="border border-[#3DB5C5] text-[#3DB5C5] px-4 py-2 rounded-lg text-sm flex items-center gap-1"
        >
          <Download className="h-4 w-4" />
          Télécharger en Excel
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Rechercher un formateur..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm w-80 focus:outline-none focus:border-[#3DB5C5]"
        />
        <button
          onClick={handleSearch}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium uppercase flex items-center gap-1"
          style={{ background: "#3DB5C5" }}
        >
          <Search className="h-4 w-4" />
          Rechercher
        </button>
      </div>

      {/* Count */}
      <p className="text-sm text-gray-500 mb-3">{total} formateur{total !== 1 ? "s" : ""}</p>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3DB5C5] border-t-transparent" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Nom</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tél</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {trainers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    Aucun formateur trouvé
                  </td>
                </tr>
              ) : (
                trainers.map((trainer) => {
                  const fullName = `${trainer.first_name} ${trainer.last_name}`;
                  const typeLabel = trainer.type === "internal" ? "Interne" : trainer.type === "external" ? "Externe" : "—";
                  return (
                    <tr key={trainer.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        <Link href={`/admin/trainers/${trainer.id}`} className="hover:text-[#3DB5C5]">
                          {fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{trainer.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{trainer.email}</td>
                      <td className="px-4 py-3 text-gray-600">{typeLabel}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setEditItem({ ...trainer })}
                            className="text-[#3DB5C5] hover:underline text-xs font-medium"
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => handleDelete(trainer.id, fullName)}
                            className="text-red-500 hover:underline text-xs"
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Page {page} sur {totalPages} — {total} résultats</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-600 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className="px-3 py-1.5 rounded border text-sm font-medium"
                  style={p === page ? { background: "#3DB5C5", color: "white", borderColor: "#3DB5C5" } : { borderColor: "#d1d5db", color: "#4b5563" }}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-600 disabled:opacity-40 flex items-center gap-1"
            >
              Suivant <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier le formateur</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Prénom</label>
                  <input
                    type="text"
                    value={editItem.first_name}
                    onChange={(e) => setEditItem((p) => p ? { ...p, first_name: e.target.value } : p)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nom</label>
                  <input
                    type="text"
                    value={editItem.last_name}
                    onChange={(e) => setEditItem((p) => p ? { ...p, last_name: e.target.value } : p)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  value={editItem.email}
                  onChange={(e) => setEditItem((p) => p ? { ...p, email: e.target.value } : p)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Téléphone</label>
                <input
                  type="tel"
                  value={editItem.phone ?? ""}
                  onChange={(e) => setEditItem((p) => p ? { ...p, phone: e.target.value } : p)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select
                  value={editItem.type ?? "internal"}
                  onChange={(e) => setEditItem((p) => p ? { ...p, type: e.target.value } : p)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5]"
                >
                  <option value="internal">Interne</option>
                  <option value="external">Externe</option>
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setEditItem(null)} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm">
              Annuler
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className="text-white px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "#3DB5C5" }}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
