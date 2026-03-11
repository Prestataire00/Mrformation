"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Filter,
  Send,
  Mail,
  MoreHorizontal,
  Eye,
  Users,
  FileText,
  Calendar,
  CheckCircle,
  Clock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { cn, formatDate, STATUS_COLORS } from "@/lib/utils";
import type { CrmCampaign, CrmTag } from "@/lib/types";

type CampaignStatus = "draft" | "scheduled" | "sent" | "cancelled";
type TargetType = "all_clients" | "all_prospects" | "segment";

interface CrmCampaignWithTags extends CrmCampaign {
  segment_tags?: string[];
}

const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Brouillon",
  scheduled: "Planifiée",
  sent: "Envoyée",
  cancelled: "Annulée",
};

const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  all_clients: "Tous les clients",
  all_prospects: "Tous les prospects",
  segment: "Segment personnalisé",
};

const TARGET_TYPE_OPTIONS: TargetType[] = ["all_clients", "all_prospects", "segment"];

interface CampaignFormData {
  name: string;
  subject: string;
  body: string;
  target_type: TargetType;
  status: CampaignStatus;
  scheduled_at: string;
  segment_tags: string[];
}

const EMPTY_FORM: CampaignFormData = {
  name: "",
  subject: "",
  body: "",
  target_type: "all_clients",
  status: "draft",
  scheduled_at: "",
  segment_tags: [],
};

interface CampaignStats {
  totalSent: number;
  totalDrafted: number;
  thisMonth: number;
}

export default function CampaignsPage() {
  const supabase = createClient();
  const { toast } = useToast();

  const { entityId } = useEntity();
  const [campaigns, setCampaigns] = useState<CrmCampaignWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [allTags, setAllTags] = useState<CrmTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sending, setSending] = useState(false);
  const [stats, setStats] = useState<CampaignStats>({ totalSent: 0, totalDrafted: 0, thisMonth: 0 });

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all");

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CrmCampaign | null>(null);

  // Form
  const [formData, setFormData] = useState<CampaignFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof CampaignFormData, string>>>({});

  useEffect(() => {
    if (entityId === undefined) return;
    fetchCampaigns();
    fetchTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, search, statusFilter]);

  const fetchTags = useCallback(async () => {
    if (!entityId) return;
    const { data } = await supabase
      .from("crm_tags")
      .select("*")
      .eq("entity_id", entityId)
      .order("name");
    setAllTags((data as CrmTag[]) ?? []);
  }, [supabase, entityId]);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("crm_campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      if (entityId) query = query.eq("entity_id", entityId);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;
      const list = (data as CrmCampaign[]) ?? [];
      setCampaigns(list);

      // Stats from all campaigns
      let allQuery = supabase.from("crm_campaigns").select("status, created_at");
      if (entityId) allQuery = allQuery.eq("entity_id", entityId);
      const { data: allData } = await allQuery;
      if (allData) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const totalSent = allData.filter((c) => c.status === "sent").length;
        const totalDrafted = allData.filter((c) => c.status === "draft").length;
        const thisMonth = allData.filter((c) => c.created_at >= startOfMonth).length;
        setStats({ totalSent, totalDrafted, thisMonth });
      }
    } catch (err) {
      console.error("fetchCampaigns error:", err);
      toast({ title: "Erreur", description: "Impossible de charger les campagnes.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [supabase, entityId, statusFilter, search, toast]);

  function validateForm(): boolean {
    const errors: Partial<Record<keyof CampaignFormData, string>> = {};
    if (!formData.name.trim()) errors.name = "Le nom est requis.";
    if (!formData.subject.trim()) errors.subject = "L'objet est requis.";
    if (!formData.body.trim()) errors.body = "Le contenu est requis.";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCreate() {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        subject: formData.subject.trim(),
        body: formData.body.trim(),
        target_type: formData.target_type,
        status: formData.status,
        scheduled_at: formData.scheduled_at || null,
        sent_count: 0,
        segment_tags: formData.target_type === "segment" ? formData.segment_tags : [],
      };
      if (entityId) payload.entity_id = entityId;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) payload.created_by = user.id;

      const { error } = await supabase.from("crm_campaigns").insert([payload]);
      if (error) throw error;

      toast({ title: "Campagne créée", description: `"${formData.name}" a été créée.` });
      setAddDialogOpen(false);
      setFormData(EMPTY_FORM);
      fetchCampaigns();
    } catch (err) {
      console.error("handleCreate error:", err);
      toast({ title: "Erreur", description: "Impossible de créer la campagne.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!selectedCampaign || !validateForm()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("crm_campaigns")
        .update({
          name: formData.name.trim(),
          subject: formData.subject.trim(),
          body: formData.body.trim(),
          target_type: formData.target_type,
          status: formData.status,
          scheduled_at: formData.scheduled_at || null,
          segment_tags: formData.target_type === "segment" ? formData.segment_tags : [],
        })
        .eq("id", selectedCampaign.id);
      if (error) throw error;

      toast({ title: "Campagne modifiée", description: `"${formData.name}" a été mise à jour.` });
      setEditDialogOpen(false);
      setSelectedCampaign(null);
      setFormData(EMPTY_FORM);
      fetchCampaigns();
    } catch (err) {
      console.error("handleUpdate error:", err);
      toast({ title: "Erreur", description: "Impossible de modifier la campagne.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedCampaign) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("crm_campaigns").delete().eq("id", selectedCampaign.id);
      if (error) throw error;
      toast({ title: "Campagne supprimée", description: `"${selectedCampaign.name}" a été supprimée.` });
      setDeleteDialogOpen(false);
      setSelectedCampaign(null);
      fetchCampaigns();
    } catch (err) {
      console.error("handleDelete error:", err);
      toast({ title: "Erreur", description: "Impossible de supprimer cette campagne.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  async function handleSend() {
    if (!selectedCampaign) return;
    setSending(true);
    try {
      // Count recipients based on target type
      let recipientCount = 0;
      const targetType = selectedCampaign.target_type as TargetType;
      if (targetType === "all_clients") {
        let q = supabase.from("clients").select("id", { count: "exact", head: true });
        if (entityId) q = q.eq("entity_id", entityId);
        const { count } = await q;
        recipientCount = count ?? 0;
      } else if (targetType === "all_prospects") {
        let q = supabase.from("crm_prospects").select("id", { count: "exact", head: true });
        if (entityId) q = q.eq("entity_id", entityId);
        const { count } = await q;
        recipientCount = count ?? 0;
      } else if (targetType === "segment") {
        const campaignWithTags = selectedCampaign as CrmCampaignWithTags;
        const segTags = campaignWithTags.segment_tags ?? [];
        if (segTags.length > 0) {
          // Count prospects + clients with matching tags
          const { data: prospectTagRows } = await supabase
            .from("crm_prospect_tags")
            .select("prospect_id")
            .in("tag_id", segTags);
          const { data: clientTagRows } = await supabase
            .from("crm_client_tags")
            .select("client_id")
            .in("tag_id", segTags);
          const uniqueProspects = new Set((prospectTagRows ?? []).map((r) => r.prospect_id));
          const uniqueClients = new Set((clientTagRows ?? []).map((r) => r.client_id));
          recipientCount = uniqueProspects.size + uniqueClients.size;
        }
      }

      const { error } = await supabase
        .from("crm_campaigns")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          sent_count: recipientCount,
        })
        .eq("id", selectedCampaign.id);
      if (error) throw error;

      toast({
        title: "Campagne envoyée",
        description: `"${selectedCampaign.name}" envoyée à ${recipientCount} destinataire(s).`,
      });
      setSendDialogOpen(false);
      setSelectedCampaign(null);
      fetchCampaigns();
    } catch (err) {
      console.error("handleSend error:", err);
      toast({ title: "Erreur", description: "Impossible d'envoyer la campagne.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  function openEditDialog(campaign: CrmCampaign) {
    setSelectedCampaign(campaign);
    const campaignWithTags = campaign as CrmCampaignWithTags;
    setFormData({
      name: campaign.name,
      subject: campaign.subject ?? "",
      body: campaign.body ?? "",
      target_type: (campaign.target_type as TargetType) ?? "all_clients",
      status: campaign.status as CampaignStatus,
      scheduled_at: campaign.scheduled_at ?? "",
      segment_tags: campaignWithTags.segment_tags ?? [],
    });
    setFormErrors({});
    setEditDialogOpen(true);
  }

  function openDeleteDialog(campaign: CrmCampaign) {
    setSelectedCampaign(campaign);
    setDeleteDialogOpen(true);
  }

  function openViewDialog(campaign: CrmCampaign) {
    setSelectedCampaign(campaign);
    setViewDialogOpen(true);
  }

  function openSendDialog(campaign: CrmCampaign) {
    setSelectedCampaign(campaign);
    setSendDialogOpen(true);
  }

  function openAddDialog() {
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setAddDialogOpen(true);
  }

  function updateField(field: keyof CampaignFormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function toggleSegmentTag(tagId: string) {
    setFormData((prev) => ({
      ...prev,
      segment_tags: prev.segment_tags.includes(tagId)
        ? prev.segment_tags.filter((id) => id !== tagId)
        : [...prev.segment_tags, tagId],
    }));
  }

  const hasActiveFilters = search || statusFilter !== "all";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Campagnes Email</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez et envoyez vos campagnes de communication
          </p>
        </div>
        <Button onClick={openAddDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Nouvelle campagne
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <Send className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Campagnes envoyées</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalSent}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
              <FileText className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Brouillons</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalDrafted}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ce mois</p>
              <p className="text-2xl font-bold text-gray-900">{stats.thisMonth}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher une campagne…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as CampaignStatus | "all")}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="draft">Brouillon</SelectItem>
                  <SelectItem value="scheduled">Planifiée</SelectItem>
                  <SelectItem value="sent">Envoyée</SelectItem>
                  <SelectItem value="cancelled">Annulée</SelectItem>
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Campaign cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <Mail className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-gray-700">Aucune campagne trouvée</p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasActiveFilters ? "Essayez de modifier vos filtres." : "Créez votre première campagne email."}
            </p>
            {!hasActiveFilters && (
              <Button onClick={openAddDialog} className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Nouvelle campagne
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onEdit={() => openEditDialog(campaign)}
              onDelete={() => openDeleteDialog(campaign)}
              onView={() => openViewDialog(campaign)}
              onSend={() => openSendDialog(campaign)}
            />
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvelle campagne email</DialogTitle>
            <DialogDescription>Créez une nouvelle campagne de communication.</DialogDescription>
          </DialogHeader>
          <CampaignForm formData={formData} formErrors={formErrors} onUpdate={updateField} allTags={allTags} onToggleSegmentTag={toggleSegmentTag} />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={saving}>Annuler</Button></DialogClose>
            <Button onClick={handleCreate} disabled={saving} className="gap-2">
              {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Créer la campagne
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier la campagne</DialogTitle>
            <DialogDescription>Mettez à jour {selectedCampaign?.name}.</DialogDescription>
          </DialogHeader>
          <CampaignForm formData={formData} formErrors={formErrors} onUpdate={updateField} allTags={allTags} onToggleSegmentTag={toggleSegmentTag} />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={saving}>Annuler</Button></DialogClose>
            <Button onClick={handleUpdate} disabled={saving} className="gap-2">
              {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-violet-600" />
              {selectedCampaign?.name}
            </DialogTitle>
            <DialogDescription>
              Aperçu du contenu de la campagne
            </DialogDescription>
          </DialogHeader>
          {selectedCampaign && (
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge className={cn("border-0", STATUS_COLORS[selectedCampaign.status as string])}>
                  {CAMPAIGN_STATUS_LABELS[selectedCampaign.status as CampaignStatus]}
                </Badge>
                {selectedCampaign.target_type && (
                  <Badge variant="outline" className="gap-1">
                    <Users className="h-3 w-3" />
                    {TARGET_TYPE_LABELS[selectedCampaign.target_type as TargetType]}
                  </Badge>
                )}
                {selectedCampaign.sent_count > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Send className="h-3 w-3" />
                    {selectedCampaign.sent_count} envois
                  </Badge>
                )}
              </div>

              <Separator />

              <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Objet</p>
                  <p className="mt-1 font-medium text-gray-900">{selectedCampaign.subject ?? "—"}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contenu</p>
                  <div className="mt-2 rounded border bg-white p-4 text-sm text-gray-700 whitespace-pre-wrap min-h-[100px]">
                    {selectedCampaign.body ?? "Aucun contenu"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Créée le</p>
                  <p className="font-medium">{formatDate(selectedCampaign.created_at)}</p>
                </div>
                {selectedCampaign.scheduled_at && (
                  <div>
                    <p className="text-muted-foreground">Planifiée le</p>
                    <p className="font-medium">{formatDate(selectedCampaign.scheduled_at)}</p>
                  </div>
                )}
                {selectedCampaign.sent_at && (
                  <div>
                    <p className="text-muted-foreground">Envoyée le</p>
                    <p className="font-medium">{formatDate(selectedCampaign.sent_at)}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Fermer</Button>
            </DialogClose>
            {selectedCampaign?.status === "draft" || selectedCampaign?.status === "scheduled" ? (
              <Button
                onClick={() => { setViewDialogOpen(false); openSendDialog(selectedCampaign!); }}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                <Send className="h-4 w-4" />
                Envoyer
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Confirmation Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-green-600" />
              Envoyer la campagne
            </DialogTitle>
            <DialogDescription>
              Vous êtes sur le point d&apos;envoyer{" "}
              <span className="font-semibold text-gray-900">&quot;{selectedCampaign?.name}&quot;</span>{" "}
              à{" "}
              <span className="font-semibold text-gray-900">
                {selectedCampaign?.target_type ? TARGET_TYPE_LABELS[selectedCampaign.target_type as TargetType] : "la cible sélectionnée"}
              </span>.
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={sending}>Annuler</Button></DialogClose>
            <Button onClick={handleSend} disabled={sending} className="gap-2 bg-green-600 hover:bg-green-700">
              {sending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              <Send className="h-4 w-4" />
              Confirmer l&apos;envoi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer la campagne</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer{" "}
              <span className="font-semibold text-gray-900">&quot;{selectedCampaign?.name}&quot;</span> ?
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={deleting}>Annuler</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="gap-2">
              {deleting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Sub-components ----

interface CampaignCardProps {
  campaign: CrmCampaign;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
  onSend: () => void;
}

function CampaignCard({ campaign, onEdit, onDelete, onView, onSend }: CampaignCardProps) {
  const isSent = campaign.status === "sent";
  const isDraft = campaign.status === "draft";
  const isScheduled = campaign.status === "scheduled";
  const canSend = isDraft || isScheduled;

  return (
    <Card className="flex flex-col hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg",
              isSent ? "bg-green-100" : isDraft ? "bg-gray-100" : isScheduled ? "bg-blue-100" : "bg-red-100"
            )}>
              {isSent ? (
                <CheckCircle className={cn("h-4 w-4", "text-green-600")} />
              ) : isDraft ? (
                <FileText className="h-4 w-4 text-gray-600" />
              ) : isScheduled ? (
                <Clock className="h-4 w-4 text-blue-600" />
              ) : (
                <X className="h-4 w-4 text-red-600" />
              )}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold text-gray-900 truncate">{campaign.name}</CardTitle>
              {campaign.subject && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{campaign.subject}</p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onView} className="gap-2">
                <Eye className="h-4 w-4" />
                Voir le contenu
              </DropdownMenuItem>
              {!isSent && (
                <DropdownMenuItem onClick={onEdit} className="gap-2">
                  <Pencil className="h-4 w-4" />
                  Modifier
                </DropdownMenuItem>
              )}
              {canSend && (
                <DropdownMenuItem onClick={onSend} className="gap-2 text-green-600 focus:text-green-600">
                  <Send className="h-4 w-4" />
                  Envoyer
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="gap-2 text-red-600 focus:text-red-600">
                <Trash2 className="h-4 w-4" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="pt-0 flex-1 flex flex-col justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge className={cn("border-0 text-xs", STATUS_COLORS[campaign.status as string] ?? "bg-gray-100 text-gray-700")}>
            {CAMPAIGN_STATUS_LABELS[campaign.status as CampaignStatus] ?? campaign.status}
          </Badge>
          {campaign.target_type && (
            <Badge variant="outline" className="text-xs gap-1">
              <Users className="h-3 w-3" />
              {TARGET_TYPE_LABELS[campaign.target_type as TargetType]}
            </Badge>
          )}
          {campaign.sent_count > 0 && (
            <Badge variant="outline" className="text-xs gap-1 text-green-700 border-green-300">
              <Send className="h-3 w-3" />
              {campaign.sent_count} envois
            </Badge>
          )}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            Créée le {formatDate(campaign.created_at)}
          </p>
          {campaign.scheduled_at && (
            <p className="flex items-center gap-1.5 text-blue-600">
              <Clock className="h-3 w-3" />
              Planifiée le {formatDate(campaign.scheduled_at)}
            </p>
          )}
          {campaign.sent_at && (
            <p className="flex items-center gap-1.5 text-green-600">
              <CheckCircle className="h-3 w-3" />
              Envoyée le {formatDate(campaign.sent_at)}
            </p>
          )}
        </div>

        {canSend && (
          <Button
            size="sm"
            onClick={onSend}
            className="w-full gap-2 bg-green-600 hover:bg-green-700 mt-1"
          >
            <Send className="h-3.5 w-3.5" />
            Envoyer la campagne
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface CampaignFormProps {
  formData: CampaignFormData;
  formErrors: Partial<Record<keyof CampaignFormData, string>>;
  onUpdate: (field: keyof CampaignFormData, value: string) => void;
  allTags: CrmTag[];
  onToggleSegmentTag: (tagId: string) => void;
}

function CampaignForm({ formData, formErrors, onUpdate, allTags, onToggleSegmentTag }: CampaignFormProps) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nom de la campagne <span className="text-red-500">*</span></Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => onUpdate("name", e.target.value)}
          placeholder="Ex : Newsletter Janvier 2026"
          className={cn(formErrors.name && "border-red-500")}
        />
        {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subject">Objet de l&apos;email <span className="text-red-500">*</span></Label>
        <Input
          id="subject"
          value={formData.subject}
          onChange={(e) => onUpdate("subject", e.target.value)}
          placeholder="Ex : Découvrez nos nouvelles formations"
          className={cn(formErrors.subject && "border-red-500")}
        />
        {formErrors.subject && <p className="text-xs text-red-500">{formErrors.subject}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="body">Contenu de l&apos;email <span className="text-red-500">*</span></Label>
        <Textarea
          id="body"
          value={formData.body}
          onChange={(e) => onUpdate("body", e.target.value)}
          placeholder="Rédigez le contenu de votre email ici…"
          rows={6}
          className={cn("resize-none", formErrors.body && "border-red-500")}
        />
        {formErrors.body && <p className="text-xs text-red-500">{formErrors.body}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="target_type">Cible</Label>
          <Select value={formData.target_type} onValueChange={(v) => onUpdate("target_type", v)}>
            <SelectTrigger id="target_type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TARGET_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>{TARGET_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Statut</Label>
          <Select value={formData.status} onValueChange={(v) => onUpdate("status", v)}>
            <SelectTrigger id="status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Brouillon</SelectItem>
              <SelectItem value="scheduled">Planifiée</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {formData.status === "scheduled" && (
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="scheduled_at">Date d&apos;envoi planifiée</Label>
            <Input
              id="scheduled_at"
              type="datetime-local"
              value={formData.scheduled_at}
              onChange={(e) => onUpdate("scheduled_at", e.target.value)}
            />
          </div>
        )}

        {formData.target_type === "segment" && allTags.length > 0 && (
          <div className="col-span-2 space-y-1.5">
            <Label>Tags de segmentation</Label>
            <p className="text-xs text-muted-foreground">
              La campagne sera envoyée aux prospects et clients ayant au moins un de ces tags.
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              {allTags.map((tag) => {
                const selected = formData.segment_tags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => onToggleSegmentTag(tag.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      selected
                        ? "text-white border-transparent"
                        : "text-gray-600 border-gray-300 bg-white hover:bg-gray-50"
                    )}
                    style={selected ? { backgroundColor: tag.color } : undefined}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </button>
                );
              })}
            </div>
            {formData.segment_tags.length === 0 && (
              <p className="text-xs text-amber-600">Sélectionnez au moins un tag pour le segment.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
