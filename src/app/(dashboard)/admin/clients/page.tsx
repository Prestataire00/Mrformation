"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import { CompanySearch, type CompanySearchResult } from "@/components/crm/CompanySearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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

interface ClientFormData {
  company_name: string;
  siret: string;
  address: string;
  city: string;
  postal_code: string;
  website: string;
  sector: string;
  status: ClientStatus;
  notes: string;
}

const EMPTY_FORM: ClientFormData = {
  company_name: "",
  siret: "",
  address: "",
  city: "",
  postal_code: "",
  website: "",
  sector: "",
  status: "prospect",
  notes: "",
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
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientWithCount | null>(null);

  // Form
  const [formData, setFormData] = useState<ClientFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ClientFormData, string>>>({});

  useEffect(() => {
    if (entityId === undefined) return;
    fetchClients();
    fetchStatusCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, search, statusFilter, page]);

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
      if (search.trim()) query = query.ilike("company_name", `%${search.trim()}%`);

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
  }, [supabase, entityId, statusFilter, search, page, toast]);

  function validateForm(): boolean {
    const errors: Partial<Record<keyof ClientFormData, string>> = {};
    if (!formData.company_name.trim()) {
      errors.company_name = "Le nom de l'entreprise est requis.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCreate() {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        company_name: formData.company_name.trim(),
        siret: formData.siret.trim() || null,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        postal_code: formData.postal_code.trim() || null,
        website: formData.website.trim() || null,
        sector: formData.sector || null,
        status: formData.status,
        notes: formData.notes.trim() || null,
      };
      if (entityId) payload.entity_id = entityId;

      const { error } = await supabase.from("clients").insert([payload]);
      if (error) throw error;

      toast({ title: "Client ajouté", description: `${formData.company_name} a été créé avec succès.` });
      setAddDialogOpen(false);
      setFormData(EMPTY_FORM);
      setFormErrors({});
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

  async function handleUpdate() {
    if (!selectedClient || !validateForm()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({
          company_name: formData.company_name.trim(),
          siret: formData.siret.trim() || null,
          address: formData.address.trim() || null,
          city: formData.city.trim() || null,
          postal_code: formData.postal_code.trim() || null,
          website: formData.website.trim() || null,
          sector: formData.sector || null,
          status: formData.status,
          notes: formData.notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedClient.id);

      if (error) throw error;

      toast({ title: "Client modifié", description: `${formData.company_name} a été mis à jour.` });
      setEditDialogOpen(false);
      setSelectedClient(null);
      setFormData(EMPTY_FORM);
      setFormErrors({});
      fetchClients();
      fetchStatusCounts();
    } catch (err) {
      console.error("handleUpdate error:", err);
      toast({ title: "Erreur", description: "Impossible de modifier le client.", variant: "destructive" });
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

  function handleCompanySelect(company: CompanySearchResult) {
    // Parse address into parts if possible (Pappers returns "12 Rue de la Paix")
    setFormData((prev) => ({
      ...prev,
      company_name: company.company_name || prev.company_name,
      siret: company.siret || prev.siret,
      address: company.address || prev.address,
      city: company.city || prev.city,
      postal_code: company.postal_code || prev.postal_code,
    }));
    // Clear any company_name error since it's now filled
    setFormErrors((prev) => ({ ...prev, company_name: undefined }));
  }

  function openAddDialog() {
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setAddDialogOpen(true);
  }

  function openEditDialog(client: ClientWithCount) {
    setSelectedClient(client);
    setFormData({
      company_name: client.company_name,
      siret: client.siret ?? "",
      address: client.address ?? "",
      city: client.city ?? "",
      postal_code: client.postal_code ?? "",
      website: client.website ?? "",
      sector: client.sector ?? "",
      status: client.status,
      notes: client.notes ?? "",
    });
    setFormErrors({});
    setEditDialogOpen(true);
  }

  function openDeleteDialog(client: ClientWithCount) {
    setSelectedClient(client);
    setDeleteDialogOpen(true);
  }

  function updateField(field: keyof ClientFormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: undefined }));
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
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez votre portefeuille clients ({total} au total)
          </p>
        </div>
        <Button onClick={openAddDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Ajouter un client
        </Button>
      </div>

      {/* Status filter cards */}
      <div className="grid grid-cols-3 gap-4">
        {statusFilterCards.map(({ status, label, colorClass }) => (
          <Card
            key={status}
            className={cn(
              "cursor-pointer transition-all hover:shadow-sm border",
              statusFilter === status && "ring-2 ring-primary"
            )}
            onClick={() => {
              setStatusFilter(statusFilter === status ? "all" : status);
              setPage(1);
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
                <Button onClick={openAddDialog} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Ajouter un client
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50/80">
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Entreprise</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">SIRET</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Ville</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Secteur</th>
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
                              <DropdownMenuItem onClick={() => openEditDialog(client)} className="gap-2">
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
                      className="gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Précédent
                    </Button>
                    <span className="text-sm font-medium px-2">{page} / {totalPages}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
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

      {/* Add Client Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajouter un client</DialogTitle>
            <DialogDescription>
              Renseignez les informations du nouveau client. Le nom de l&apos;entreprise est obligatoire.
            </DialogDescription>
          </DialogHeader>
          <ClientForm
            formData={formData}
            formErrors={formErrors}
            onUpdate={updateField}
            onCompanySelect={handleCompanySelect}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={saving}>Annuler</Button>
            </DialogClose>
            <Button onClick={handleCreate} disabled={saving} className="gap-2">
              {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Créer le client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le client</DialogTitle>
            <DialogDescription>
              Mettez à jour les informations de {selectedClient?.company_name}.
            </DialogDescription>
          </DialogHeader>
          <ClientForm formData={formData} formErrors={formErrors} onUpdate={updateField} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={saving}>Annuler</Button>
            </DialogClose>
            <Button onClick={handleUpdate} disabled={saving} className="gap-2">
              {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Enregistrer les modifications
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

// ---- ClientForm sub-component ----
interface ClientFormProps {
  formData: ClientFormData;
  formErrors: Partial<Record<keyof ClientFormData, string>>;
  onUpdate: (field: keyof ClientFormData, value: string) => void;
  onCompanySelect?: (company: CompanySearchResult) => void;
}

function ClientForm({ formData, formErrors, onUpdate, onCompanySelect }: ClientFormProps) {
  return (
    <div className="space-y-5 py-2">
      {/* Pappers company search */}
      {onCompanySelect && (
        <div className="space-y-1.5">
          <Label>Recherche entreprise (Pappers)</Label>
          <CompanySearch
            onSelect={onCompanySelect}
            placeholder="Tapez le nom ou SIRET pour auto-remplir le formulaire…"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="company_name">
          Nom de l&apos;entreprise <span className="text-red-500">*</span>
        </Label>
        <Input
          id="company_name"
          value={formData.company_name}
          onChange={(e) => onUpdate("company_name", e.target.value)}
          placeholder="Ex : Société Dupont & Associés"
          className={cn(formErrors.company_name && "border-red-500 focus-visible:ring-red-500")}
        />
        {formErrors.company_name && (
          <p className="text-xs text-red-500">{formErrors.company_name}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="siret">SIRET</Label>
          <Input
            id="siret"
            value={formData.siret}
            onChange={(e) => onUpdate("siret", e.target.value)}
            placeholder="12345678901234"
            maxLength={14}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Statut</Label>
          <Select value={formData.status} onValueChange={(v) => onUpdate("status", v)}>
            <SelectTrigger id="status">
              <SelectValue placeholder="Choisir un statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Actif</SelectItem>
              <SelectItem value="inactive">Inactif</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address">Adresse</Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(e) => onUpdate("address", e.target.value)}
          placeholder="Ex : 12 rue de la Paix"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="city">Ville</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => onUpdate("city", e.target.value)}
            placeholder="Ex : Paris"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="postal_code">Code postal</Label>
          <Input
            id="postal_code"
            value={formData.postal_code}
            onChange={(e) => onUpdate("postal_code", e.target.value)}
            placeholder="Ex : 75001"
            maxLength={5}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="website">Site web</Label>
          <Input
            id="website"
            value={formData.website}
            onChange={(e) => onUpdate("website", e.target.value)}
            placeholder="www.exemple.fr"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sector">Secteur d&apos;activité</Label>
          <Select value={formData.sector} onValueChange={(v) => onUpdate("sector", v)}>
            <SelectTrigger id="sector">
              <SelectValue placeholder="Choisir un secteur" />
            </SelectTrigger>
            <SelectContent>
              {SECTOR_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => onUpdate("notes", e.target.value)}
          placeholder="Informations complémentaires sur ce client…"
          rows={3}
          className="resize-none"
        />
      </div>
    </div>
  );
}
