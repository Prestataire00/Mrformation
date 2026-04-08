"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Building2,
  Plus,
  Search,
  Pencil,
  Trash2,
  Eye,
  Globe,
  MapPin,
  Filter,
  Users,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { useEntity } from "@/contexts/EntityContext";
import { useDebounce } from "@/hooks/useDebounce";
import { cn, formatDate, STATUS_COLORS } from "@/lib/utils";
import type { Client, ClientStatus } from "@/lib/types";

const STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Actif",
  inactive: "Inactif",
  prospect: "Prospect",
};

const SECTOR_OPTIONS = [
  "Industrie",
  "Services",
  "Commerce",
  "Santé",
  "Éducation",
  "BTP",
  "Transport",
  "Agriculture",
  "Informatique",
  "Finance",
  "Autre",
];

interface ClientWithCount extends Client {
  contacts_count: number;
}

const BPF_CATEGORY_LABELS: Record<string, string> = {
  entreprise_privee: "Entreprise privée",
  apprentissage: "Contrats d'apprentissage",
  professionnalisation: "Contrats de professionnalisation",
  reconversion_alternance: "Reconversion / alternance",
  conge_transition: "Congé / transition professionnelle",
  cpf: "Compte personnel de formation (CPF)",
  dispositif_chomeurs: "Dispositifs demandeurs d'emploi",
  non_salaries: "Dispositifs travailleurs non-salariés",
  plan_developpement: "Plan de développement des compétences",
  pouvoir_public_agents: "Pouvoirs publics (formation agents)",
  instances_europeennes: "Instances européennes",
  etat: "État",
  conseil_regional: "Conseils régionaux",
  pole_emploi: "Pôle emploi",
  autres_publics: "Autres ressources publiques",
  individuel: "Particulier / Individuel",
  organisme_formation: "Organisme de formation",
  autre: "Autre",
};

const PAGE_SIZE = 10;

interface StatusCounts {
  active: number;
  inactive: number;
  prospect: number;
}

export default function ClientsPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const router = useRouter();

  const { entityId } = useEntity();
  const [clients, setClients] = useState<ClientWithCount[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({
    active: 0,
    inactive: 0,
    prospect: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Filters & pagination
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Inline add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormData, setAddFormData] = useState({ company_name: "", siret: "", sector: "", email: "", phone: "" });
  const [addFormError, setAddFormError] = useState("");

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientWithCount | null>(null);

  useEffect(() => {
    if (entityId === undefined) return;
    fetchClients();
    fetchStatusCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, debouncedSearch, statusFilter, page]);

  const fetchStatusCounts = useCallback(async () => {
    const statuses: ClientStatus[] = ["active", "inactive", "prospect"];
    const counts: StatusCounts = { active: 0, inactive: 0, prospect: 0 };

    await Promise.all(
      statuses.map(async (s) => {
        let query = supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("status", s);
        if (entityId) query = query.eq("entity_id", entityId);
        const { count } = await query;
        counts[s] = count ?? 0;
      })
    );

    setStatusCounts(counts);
  }, [supabase, entityId]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("clients")
        .select(`*, contacts(id)`, { count: "exact" })
        .order("company_name", { ascending: true });

      if (entityId) query = query.eq("entity_id", entityId);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (debouncedSearch.trim()) query = query.ilike("company_name", `%${debouncedSearch.trim()}%`);

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      const mapped: ClientWithCount[] = (data ?? []).map((c: Record<string, unknown>) => ({
        ...(c as unknown as Client),
        contacts_count: Array.isArray(c.contacts) ? (c.contacts as unknown[]).length : 0,
      }));

      setClients(mapped);
      setTotal(count ?? 0);
    } catch (err) {
      console.error("fetchClients error:", err);
      toast({
        title: "Erreur",
        description: "Impossible de charger les clients.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [supabase, entityId, statusFilter, debouncedSearch, page, toast]);

  async function handleCreate() {
    if (!addFormData.company_name.trim()) {
      setAddFormError("Le nom de l'entreprise est requis.");
      return;
    }
    setAddFormError("");
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        company_name: addFormData.company_name.trim(),
        siret: addFormData.siret.trim() || null,
        sector: addFormData.sector || null,
        email: addFormData.email.trim() || null,
        phone: addFormData.phone.trim() || null,
        status: "prospect",
      };
      if (entityId) payload.entity_id = entityId;

      const { error } = await supabase.from("clients").insert([payload]);
      if (error) throw error;

      toast({ title: "Client ajouté", description: `${addFormData.company_name} a été créé avec succès.` });
      setShowAddForm(false);
      setAddFormData({ company_name: "", siret: "", sector: "", email: "", phone: "" });
      setPage(1);
      fetchClients();
      fetchStatusCounts();
    } catch (err) {
      console.error("handleCreate error:", err);
      toast({ title: "Erreur", description: "Impossible de créer le client.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedClient) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("clients").delete().eq("id", selectedClient.id);
      if (error) throw error;

      toast({ title: "Client supprimé", description: `${selectedClient.company_name} a été supprimé.` });
      setDeleteDialogOpen(false);
      setSelectedClient(null);
      fetchClients();
      fetchStatusCounts();
    } catch (err) {
      console.error("handleDelete error:", err);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer ce client. Il est peut-être lié à des données existantes.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  function openDeleteDialog(client: ClientWithCount) {
    setSelectedClient(client);
    setDeleteDialogOpen(true);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const statusFilterCards: { status: ClientStatus; label: string; colorClass: string }[] = [
    { status: "active", label: "Actifs", colorClass: "text-green-700" },
    { status: "inactive", label: "Inactifs", colorClass: "text-gray-600" },
    { status: "prospect", label: "Prospects", colorClass: "text-blue-700" },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-gray-900">Entreprises</h1>
          <span className="text-xs text-gray-500"><span className="font-bold text-sm text-gray-900">{clients.length}</span> entreprises</span>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(true)} style={{ background: "#374151" }} className="text-white gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </Button>
      </div>

      {/* Inline Add Form */}
      {showAddForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Nouvelle entreprise</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowAddForm(false); setAddFormError(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label htmlFor="add_company_name" className="text-xs">Nom de l&apos;entreprise <span className="text-red-500">*</span></Label>
                <Input
                  id="add_company_name"
                  value={addFormData.company_name}
                  onChange={(e) => { setAddFormData(prev => ({ ...prev, company_name: e.target.value })); setAddFormError(""); }}
                  placeholder="Nom"
                  className={cn("h-8 text-sm", addFormError && "border-red-500")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="add_siret" className="text-xs">SIRET</Label>
                <Input
                  id="add_siret"
                  value={addFormData.siret}
                  onChange={(e) => setAddFormData(prev => ({ ...prev, siret: e.target.value }))}
                  placeholder="12345678901234"
                  maxLength={14}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="add_sector" className="text-xs">Secteur</Label>
                <Select value={addFormData.sector} onValueChange={(v) => setAddFormData(prev => ({ ...prev, sector: v }))}>
                  <SelectTrigger id="add_sector" className="h-8 text-sm">
                    <SelectValue placeholder="Secteur" />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTOR_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="add_email" className="text-xs">Email</Label>
                <Input
                  id="add_email"
                  type="email"
                  value={addFormData.email}
                  onChange={(e) => setAddFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="contact@exemple.fr"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="add_phone" className="text-xs">Téléphone</Label>
                <Input
                  id="add_phone"
                  value={addFormData.phone}
                  onChange={(e) => setAddFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="01 23 45 67 89"
                  className="h-8 text-sm"
                />
              </div>
            </div>
            {addFormError && <p className="text-xs text-red-500">{addFormError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowAddForm(false); setAddFormError(""); setAddFormData({ company_name: "", siret: "", sector: "", email: "", phone: "" }); }}>
                Annuler
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={saving} style={{ background: "#374151" }} className="text-white gap-1.5 text-xs">
                {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                Créer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status filter cards */}
      <div className="grid grid-cols-3 gap-4">
        {statusFilterCards.map(({ status, label, colorClass }) => (
          <Card
            key={status}
            role="button"
            tabIndex={0}
            aria-label={`Filtrer par statut ${label}`}
            aria-pressed={statusFilter === status}
            className={cn(
              "cursor-pointer transition-all hover:shadow-sm border",
              statusFilter === status && "ring-2 ring-primary"
            )}
            onClick={() => {
              setStatusFilter(statusFilter === status ? "all" : status);
              setPage(1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setStatusFilter(statusFilter === status ? "all" : status);
                setPage(1);
              }
            }}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <Badge className={cn("border-0 text-xs", STATUS_COLORS[status])}>
                {STATUS_LABELS[status]}
              </Badge>
              <span className={cn("text-2xl font-bold", colorClass)}>
                {statusCounts[status]}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom d'entreprise…"
                aria-label="Rechercher par nom d'entreprise"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Select
                value={statusFilter}
                onValueChange={(v) => { setStatusFilter(v as ClientStatus | "all"); setPage(1); }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="active">Actif</SelectItem>
                  <SelectItem value="inactive">Inactif</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                </SelectContent>
              </Select>
              {(search || statusFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSearch(""); setStatusFilter("all"); setPage(1); }}
                >
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium text-gray-700">Aucun client trouvé</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search || statusFilter !== "all"
                  ? "Essayez de modifier vos critères de recherche."
                  : "Commencez par ajouter votre premier client."}
              </p>
              {!search && statusFilter === "all" && (
                <Button onClick={() => setShowAddForm(true)} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Ajouter une entreprise
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Liste des clients">
                  <thead>
                    <tr className="border-b bg-gray-50/80">
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Entreprise</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">SIRET</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Ville</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Secteur</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Catégorie BPF</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Statut</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Contacts</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Ajouté le</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {clients.map((client) => (
                      <tr key={client.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 font-semibold text-sm">
                              {client.company_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/admin/clients/${client.id}`}
                                className="font-medium text-gray-900 hover:text-violet-600 transition-colors block truncate"
                              >
                                {client.company_name}
                              </Link>
                              {client.website && (
                                <a
                                  href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-violet-500 mt-0.5"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Globe className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{client.website}</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {client.siret ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          <div className="flex items-center gap-1">
                            {client.city && <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                            <span>{client.city ?? "—"}</span>
                            {client.postal_code && (
                              <span className="text-muted-foreground text-xs ml-1">({client.postal_code})</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{client.sector ?? "—"}</td>
                        <td className="px-4 py-3">
                          {client.bpf_category ? (
                            <Badge variant="outline" className="font-normal text-xs">
                              {BPF_CATEGORY_LABELS[client.bpf_category] ?? client.bpf_category}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={cn("border-0 font-medium", STATUS_COLORS[client.status])}>
                            {STATUS_LABELS[client.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-gray-700">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            {client.contacts_count}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {formatDate(client.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-2">
                                  <Eye className="h-4 w-4" />
                                  Voir le détail
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/admin/clients/${client.id}`)} className="gap-2">
                                <Pencil className="h-4 w-4" />
                                Modifier
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => openDeleteDialog(client)}
                                className="gap-2 text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                                Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} sur {total} clients
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      aria-label="Page précédente"
                      className="gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Précédent
                    </Button>
                    <span className="text-sm font-medium px-2" aria-live="polite">Page {page} sur {totalPages}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      aria-label="Page suivante"
                      className="gap-1"
                    >
                      Suivant
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer le client</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer{" "}
              <span className="font-semibold text-gray-900">{selectedClient?.company_name}</span> ?
              Cette action est irréversible et supprimera également tous les contacts associés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>Annuler</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
              {deleting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
