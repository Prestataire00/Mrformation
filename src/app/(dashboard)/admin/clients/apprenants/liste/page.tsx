"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Download, ChevronLeft, ChevronRight, Plus, Loader2, Mail } from "lucide-react";
import { downloadXlsx } from "@/lib/export-xlsx";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useEntity } from "@/contexts/EntityContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface Learner {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  client_id?: string;
  clients?: { company_name: string } | null;
  sessions_count?: number;
}

const PAGE_SIZE = 15;

export default function ApprenantsListePage() {
  const supabase = createClient();
  const { toast } = useToast();

  const [learners, setLearners] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [nameFilter, setNameFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [sessionsMin, setSessionsMin] = useState("");
  const [debouncedName, setDebouncedName] = useState("");
  const [debouncedCompany, setDebouncedCompany] = useState("");

  const { entityId } = useEntity();

  // Add learner dialog
  const [addDialog, setAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({
    first_name: "", last_name: "", email: "", phone: "", client_id: "",
  });
  const [addSaving, setAddSaving] = useState(false);
  const [clients, setClients] = useState<Array<{ id: string; company_name: string }>>([]);

  // Mass email
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [massEmailDialog, setMassEmailDialog] = useState(false);
  const [massEmailForm, setMassEmailForm] = useState({ subject: "", body: "", templateId: "" });
  const [massTemplates, setMassTemplates] = useState<Array<{ id: string; name: string; subject: string; body: string }>>([]);
  const [sendingMass, setSendingMass] = useState(false);

  useEffect(() => {
    if (!entityId) return;
    supabase
      .from("clients")
      .select("id, company_name")
      .eq("entity_id", entityId)
      .order("company_name")
      .then(({ data }) => setClients(data ?? []));
    supabase
      .from("email_templates")
      .select("id, name, subject, body")
      .eq("entity_id", entityId)
      .then(({ data }) => setMassTemplates(data ?? []));
  }, [supabase, entityId]);

  // Debounce name filter (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedName(nameFilter);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [nameFilter]);

  // Debounce company filter (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCompany(companyFilter);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [companyFilter]);

  const fetchLearners = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("learners")
        .select("id, first_name, last_name, email, phone, client_id, clients(company_name)", { count: "exact" })
        .order("last_name", { ascending: true });

      if (debouncedName.trim()) {
        query = query.or(`first_name.ilike.%${debouncedName.trim()}%,last_name.ilike.%${debouncedName.trim()}%`);
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
  }, [supabase, debouncedName, page, toast]);

  useEffect(() => { fetchLearners(); }, [fetchLearners]);

  const handleDownloadExcel = () => {
    const headers = ["Nom", "Entreprise", "Téléphone", "Email", "Sessions"];
    const rows = learners.map((l) => [
      `${l.last_name} ${l.first_name}`,
      l.clients?.company_name ?? "",
      l.phone ?? "",
      l.email,
      l.sessions_count ?? 0,
    ]);
    downloadXlsx(headers, rows, "apprenants.xlsx");
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer ${name} ?`)) return;
    const { error } = await supabase.from("learners").delete().eq("id", id);
    if (error) {
      toast({ title: "Erreur", description: "Impossible de supprimer.", variant: "destructive" });
    } else {
      toast({ title: "Supprimé", description: `${name} a été supprimé.` });
      fetchLearners();
    }
  };

  const handleAddLearner = async () => {
    if (!addForm.first_name.trim() || !addForm.last_name.trim()) {
      toast({ title: "Prénom et nom sont requis", variant: "destructive" });
      return;
    }
    setAddSaving(true);
    const { error } = await supabase.from("learners").insert({
      entity_id: entityId,
      first_name: addForm.first_name.trim(),
      last_name: addForm.last_name.trim(),
      email: addForm.email.trim() || null,
      phone: addForm.phone.trim() || null,
      client_id: addForm.client_id || null,
    });
    setAddSaving(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Apprenant ajouté" });
      setAddDialog(false);
      setAddForm({ first_name: "", last_name: "", email: "", phone: "", client_id: "" });
      fetchLearners();
    }
  };

  async function handleMassEmail() {
    const targets = displayLearners.filter((l) => selected.has(l.id) && l.email);
    if (targets.length === 0) {
      toast({ title: "Aucun apprenant avec email sélectionné", variant: "destructive" });
      return;
    }
    setSendingMass(true);
    let sent = 0;
    for (const learner of targets) {
      try {
        const res = await fetch("/api/emails/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: learner.email, subject: massEmailForm.subject, body: massEmailForm.body }),
        });
        if (res.ok) sent++;
      } catch { /* continue */ }
    }
    setSendingMass(false);
    const ignored = selected.size - targets.length;
    toast({
      title: `${sent} email${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}${ignored > 0 ? `, ${ignored} sans email ignoré${ignored > 1 ? "s" : ""}` : ""}`,
    });
    setMassEmailDialog(false);
    setSelected(new Set());
    setMassEmailForm({ subject: "", body: "", templateId: "" });
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filteredLearners = debouncedCompany.trim()
    ? learners.filter((l) =>
        l.clients?.company_name?.toLowerCase().includes(debouncedCompany.toLowerCase())
      )
    : learners;

  const displayLearners = sessionsMin.trim()
    ? filteredLearners.filter((l) => (l.sessions_count ?? 0) >= parseInt(sessionsMin))
    : filteredLearners;

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-4">
        <Link href="/admin" className="text-[#DC2626] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/clients" className="text-[#DC2626] hover:underline">Clients</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/clients/apprenants" className="text-[#DC2626] hover:underline">Apprenants</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">Liste</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">Apprenants</h1>
          <span className="text-sm text-gray-400">{total}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode("list")} className={cn("px-2 py-1 text-xs rounded-md transition", viewMode === "list" ? "bg-white shadow-sm font-medium" : "text-gray-500")}>
              Liste
            </button>
            <button onClick={() => setViewMode("cards")} className={cn("px-2 py-1 text-xs rounded-md transition", viewMode === "cards" ? "bg-white shadow-sm font-medium" : "text-gray-500")}>
              Cards
            </button>
          </div>
          <button
            onClick={handleDownloadExcel}
            className="border border-[#DC2626] text-[#DC2626] px-4 py-2 rounded-lg text-sm flex items-center gap-1"
          >
            <Download className="h-4 w-4" />
            Télécharger en Excel
          </button>
          <Button
            onClick={() => setAddDialog(true)}
            style={{ background: "#DC2626" }}
            className="text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4 mr-2" /> Ajouter un apprenant
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nom de l&apos;apprenant</label>
            <input
              type="text"
              placeholder="Rechercher par nom..."
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626] w-52"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nom de l&apos;entreprise</label>
            <input
              type="text"
              placeholder="Rechercher par entreprise..."
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626] w-52"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Plus que... sessions</label>
            <input
              type="number"
              placeholder="Ex: 3"
              value={sessionsMin}
              onChange={(e) => setSessionsMin(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626] w-32"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#DC2626] border-t-transparent" />
        </div>
      ) : (
        <>
          {viewMode === "list" && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === displayLearners.length && displayLearners.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelected(new Set(displayLearners.map((l) => l.id)));
                          else setSelected(new Set());
                        }}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Nom</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Entreprise</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Tél</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Email</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Sessions</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayLearners.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                        Aucun apprenant trouvé
                      </td>
                    </tr>
                  ) : (
                    displayLearners.map((learner) => {
                      const fullName = `${learner.first_name} ${learner.last_name}`;
                      return (
                        <tr key={learner.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selected.has(learner.id)}
                              onChange={(e) => {
                                const next = new Set(selected);
                                if (e.target.checked) next.add(learner.id);
                                else next.delete(learner.id);
                                setSelected(next);
                              }}
                              className="rounded border-gray-300"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-800">{fullName}</td>
                          <td className="px-4 py-3 text-gray-600">{learner.clients?.company_name ?? "—"}</td>
                          <td className="px-4 py-3 text-gray-600">{learner.phone ?? "—"}</td>
                          <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]">{learner.email}</td>
                          <td className="px-4 py-3 text-gray-600">{learner.sessions_count ?? 0}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {learner.email && (
                                <button
                                  onClick={() => { setSelected(new Set([learner.id])); setMassEmailDialog(true); }}
                                  className="text-[#DC2626] hover:text-teal-700"
                                  title="Envoyer un email"
                                >
                                  <Mail className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <Link
                                href={`/admin/clients/apprenants/${learner.id}`}
                                className="text-[#DC2626] hover:underline text-xs font-medium"
                              >
                                Modifier
                              </Link>
                              <Link
                                href={`/admin/crm/quotes/new?learner_name=${encodeURIComponent(fullName)}`}
                                className="text-gray-500 hover:underline text-xs"
                              >
                                Créer un devis
                              </Link>
                              <button
                                onClick={() => handleDelete(learner.id, fullName)}
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
            </div>
          )}

          {viewMode === "cards" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {displayLearners.length === 0 ? (
                <p className="col-span-full text-center text-gray-400 py-12">Aucun apprenant trouvé</p>
              ) : (
                displayLearners.map((learner) => (
                  <Link key={learner.id} href={`/admin/clients/apprenants/${learner.id}`}
                    className="border rounded-lg p-3.5 hover:border-[#DC2626]/40 hover:shadow-sm transition-all bg-white flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                      {learner.first_name?.charAt(0)}{learner.last_name?.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 leading-tight">{learner.first_name} {learner.last_name}</p>
                      <p className="text-xs text-[#DC2626] mt-0.5 truncate">{learner.clients?.company_name || "Sans entreprise"}</p>
                      {learner.email && <p className="text-[10px] text-gray-400 mt-1 truncate">{learner.email}</p>}
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {page} sur {totalPages} — {total} résultats
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-600 disabled:opacity-40 hover:border-[#DC2626]"
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
                  style={p === page ? { background: "#DC2626", color: "white", borderColor: "#DC2626" } : { borderColor: "#d1d5db", color: "#4b5563" }}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-600 disabled:opacity-40 hover:border-[#DC2626] flex items-center gap-1"
            >
              Suivant <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {/* Dialog — Ajouter un apprenant */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un apprenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Prénom *</Label>
                <Input
                  value={addForm.first_name}
                  onChange={(e) => setAddForm((f) => ({ ...f, first_name: e.target.value }))}
                  placeholder="Jean"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nom *</Label>
                <Input
                  value={addForm.last_name}
                  onChange={(e) => setAddForm((f) => ({ ...f, last_name: e.target.value }))}
                  placeholder="Dupont"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="jean.dupont@exemple.fr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Téléphone</Label>
              <Input
                value={addForm.phone}
                onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="06 00 00 00 00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Entreprise</Label>
              <select
                value={addForm.client_id}
                onChange={(e) => setAddForm((f) => ({ ...f, client_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#DC2626] bg-white"
              >
                <option value="">— Aucune entreprise —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.company_name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Annuler</Button>
            <Button onClick={handleAddLearner} disabled={addSaving}>
              {addSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mass email dialog */}
      <Dialog open={massEmailDialog} onOpenChange={setMassEmailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Envoyer un email à {selected.size} apprenant{selected.size > 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {massTemplates.length > 0 && (
              <div className="space-y-1.5">
                <Label>Utiliser un modèle</Label>
                <select
                  value={massEmailForm.templateId}
                  onChange={(e) => {
                    const t = massTemplates.find((t) => t.id === e.target.value);
                    if (t) setMassEmailForm({ templateId: t.id, subject: t.subject, body: t.body });
                    else setMassEmailForm((f) => ({ ...f, templateId: "" }));
                  }}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#DC2626]"
                >
                  <option value="">— Email libre —</option>
                  {massTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Objet *</Label>
              <Input
                value={massEmailForm.subject}
                onChange={(e) => setMassEmailForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Objet de l'email"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Message *</Label>
              <Textarea
                value={massEmailForm.body}
                onChange={(e) => setMassEmailForm((f) => ({ ...f, body: e.target.value }))}
                rows={6}
                placeholder="Votre message..."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Les apprenants sans adresse email seront ignorés automatiquement.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMassEmailDialog(false)}>Annuler</Button>
            <Button
              onClick={handleMassEmail}
              disabled={sendingMass || !massEmailForm.subject.trim() || !massEmailForm.body.trim()}
            >
              {sendingMass && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Mail className="h-4 w-4 mr-2" /> Envoyer à tous
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating selection bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-lg px-6 py-3 flex items-center gap-4 z-50">
          <span className="text-sm font-medium text-gray-700">
            {selected.size} apprenant{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            onClick={() => setMassEmailDialog(true)}
            style={{ background: "#DC2626" }}
            className="text-white hover:opacity-90"
          >
            <Mail className="h-4 w-4 mr-1" /> Envoyer un email
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
            Désélectionner tout
          </Button>
        </div>
      )}
    </div>
  );
}
