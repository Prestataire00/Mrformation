"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Program, ProgramVersion } from "@/lib/types";
import { cn, formatDate, formatDateTime, truncate } from "@/lib/utils";
import { useEntity } from "@/contexts/EntityContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  History,
  BookOpen,
  GitBranch,
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
  Eye,
  Upload,
  ChevronDown,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ProgramFormData {
  title: string;
  description: string;
  objectives: string;
  content: string;
  price: string;
  tva_rate: string;
  duration_hours: string;
  nsf_code: string;
  nsf_label: string;
  is_apprenticeship: boolean;
  bpf_objective: string;
  bpf_funding_type: string;
}

const emptyForm: ProgramFormData = {
  title: "",
  description: "",
  objectives: "",
  content: JSON.stringify(
    {
      modules: [
        {
          id: 1,
          title: "Module 1",
          duration_hours: 2,
          objectives: [],
          topics: [],
        },
      ],
    },
    null,
    2
  ),
  price: "",
  tva_rate: "20",
  duration_hours: "",
  nsf_code: "",
  nsf_label: "",
  is_apprenticeship: false,
  bpf_objective: "",
  bpf_funding_type: "",
};

export default function ProgramsPage() {
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();
  const { entityId } = useEntity();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [formData, setFormData] = useState<ProgramFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [contentError, setContentError] = useState("");

  // BPF section toggle
  const [bpfSectionOpen, setBpfSectionOpen] = useState(false);

  // Version history dialog
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [versions, setVersions] = useState<ProgramVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [programToDelete, setProgramToDelete] = useState<Program | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPrograms = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("programs")
      .select("*")
      .eq("entity_id", entityId)
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les programmes.", variant: "destructive" });
    } else {
      setPrograms((data as Program[]) || []);
    }
    setLoading(false);
  }, [entityId]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const filtered = programs.filter((p) => {
    const matchSearch =
      search === "" ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase()) ||
      p.objectives?.toLowerCase().includes(search.toLowerCase());
    const matchActive =
      activeFilter === "all" ||
      (activeFilter === "active" && p.is_active) ||
      (activeFilter === "inactive" && !p.is_active);
    return matchSearch && matchActive;
  });

  const validateContent = (raw: string): boolean => {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.modules || !Array.isArray(parsed.modules)) {
        setContentError("Le contenu doit avoir une clé \"modules\" de type tableau.");
        return false;
      }
      setContentError("");
      return true;
    } catch {
      setContentError("JSON invalide. Vérifiez la syntaxe.");
      return false;
    }
  };

  const openAddDialog = () => {
    setEditingProgram(null);
    setFormData(emptyForm);
    setContentError("");
    setBpfSectionOpen(false);
    setDialogOpen(true);
  };

  const openEditDialog = (program: Program) => {
    setEditingProgram(program);
    setFormData({
      title: program.title,
      description: program.description || "",
      objectives: program.objectives || "",
      content: program.content ? JSON.stringify(program.content, null, 2) : emptyForm.content,
      price: program.price != null ? String(program.price) : "",
      tva_rate: program.tva_rate != null ? String(program.tva_rate) : "20",
      duration_hours: program.duration_hours != null ? String(program.duration_hours) : "",
      nsf_code: program.nsf_code || "",
      nsf_label: program.nsf_label || "",
      is_apprenticeship: !!program.is_apprenticeship,
      bpf_objective: program.bpf_objective || "",
      bpf_funding_type: program.bpf_funding_type || "",
    });
    setContentError("");
    setBpfSectionOpen(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({ title: "Titre requis", variant: "destructive" });
      return;
    }
    if (!validateContent(formData.content)) return;

    setSaving(true);
    const contentParsed = JSON.parse(formData.content);

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      objectives: formData.objectives.trim() || null,
      content: contentParsed,
      updated_at: new Date().toISOString(),
      price: formData.price ? parseFloat(formData.price) : null,
      tva_rate: formData.tva_rate ? parseFloat(formData.tva_rate) : null,
      duration_hours: formData.duration_hours ? parseFloat(formData.duration_hours) : null,
      nsf_code: formData.nsf_code.trim() || null,
      nsf_label: formData.nsf_label.trim() || null,
      is_apprenticeship: formData.is_apprenticeship,
      bpf_objective: formData.bpf_objective || null,
      bpf_funding_type: formData.bpf_funding_type || null,
    };

    if (editingProgram) {
      const { error } = await supabase
        .from("programs")
        .update(payload)
        .eq("id", editingProgram.id);
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Programme mis à jour" });
    } else {
      const { error } = await supabase.from("programs").insert({
        ...payload,
        entity_id: entityId,
        version: 1,
        is_active: true,
      });
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Programme créé", description: `"${payload.title}" a été ajouté.` });
    }

    setSaving(false);
    setDialogOpen(false);
    await fetchPrograms();
  };

  const handleToggleActive = async (program: Program) => {
    const { error } = await supabase
      .from("programs")
      .update({ is_active: !program.is_active, updated_at: new Date().toISOString() })
      .eq("id", program.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: program.is_active ? "Programme désactivé" : "Programme activé",
        description: program.title,
      });
      await fetchPrograms();
    }
  };

  const openHistoryDialog = async (program: Program) => {
    setSelectedProgram(program);
    setHistoryDialogOpen(true);
    setVersionsLoading(true);
    const { data, error } = await supabase
      .from("program_versions")
      .select("*")
      .eq("program_id", program.id)
      .order("version", { ascending: false });
    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger l'historique.", variant: "destructive" });
    } else {
      setVersions((data as ProgramVersion[]) || []);
    }
    setVersionsLoading(false);
  };

  const handleCreateVersion = async () => {
    if (!selectedProgram) return;
    setCreatingVersion(true);

    const newVersion = selectedProgram.version + 1;

    // Save snapshot to program_versions
    const { error: vErr } = await supabase.from("program_versions").insert({
      program_id: selectedProgram.id,
      version: newVersion,
      content: selectedProgram.content,
    });

    if (vErr) {
      toast({ title: "Erreur", description: vErr.message, variant: "destructive" });
      setCreatingVersion(false);
      return;
    }

    // Update program version number
    const { error: pErr } = await supabase
      .from("programs")
      .update({ version: newVersion, updated_at: new Date().toISOString() })
      .eq("id", selectedProgram.id);

    if (pErr) {
      toast({ title: "Erreur", description: pErr.message, variant: "destructive" });
    } else {
      toast({ title: `Version v${newVersion} créée`, description: selectedProgram.title });
      await fetchPrograms();
      // Reload versions
      const { data } = await supabase
        .from("program_versions")
        .select("*")
        .eq("program_id", selectedProgram.id)
        .order("version", { ascending: false });
      setVersions((data as ProgramVersion[]) || []);
      setSelectedProgram((prev) =>
        prev ? { ...prev, version: newVersion } : null
      );
    }
    setCreatingVersion(false);
  };

  const openDeleteDialog = (program: Program) => {
    setProgramToDelete(program);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!programToDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("programs").delete().eq("id", programToDelete.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Programme supprimé" });
      setDeleteDialogOpen(false);
      setProgramToDelete(null);
      await fetchPrograms();
    }
    setDeleting(false);
  };

  const activeCount = programs.filter((p) => p.is_active).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programmes pédagogiques</h1>
          <p className="text-sm text-gray-500 mt-1">
            {programs.length} programme{programs.length !== 1 ? "s" : ""} —{" "}
            {activeCount} actif{activeCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/programs/import">
            <Button variant="outline" className="gap-2">
              <Upload className="h-4 w-4" />
              Importer PDF
            </Button>
          </Link>
          <Button onClick={openAddDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau programme
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher un programme..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 border rounded-lg p-1 bg-gray-50 w-fit">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                activeFilter === f
                  ? "bg-white shadow-sm text-gray-900 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {f === "all" ? "Tous" : f === "active" ? "Actifs" : "Inactifs"}
            </button>
          ))}
        </div>
      </div>

      {/* Programs Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="h-12 w-12 text-gray-300 mb-3" />
          <p className="font-medium text-gray-600">Aucun programme trouvé</p>
          <p className="text-sm text-gray-400 mt-1">
            {search || activeFilter !== "all"
              ? "Modifiez vos filtres"
              : "Créez votre premier programme pédagogique"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((program) => (
            <Card
              key={program.id}
              className={cn(
                "relative group hover:shadow-md transition-shadow",
                !program.is_active && "opacity-70"
              )}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle
                        className="text-base leading-snug cursor-pointer hover:text-[#DC2626] transition-colors"
                        onClick={() => router.push(`/admin/programs/${program.id}`)}
                      >
                        {truncate(program.title, 50)}
                      </CardTitle>
                      <Badge
                        variant="outline"
                        className="text-xs font-mono shrink-0 border-blue-200 text-blue-700 bg-blue-50"
                      >
                        v{program.version}
                      </Badge>
                    </div>
                    {program.description && (
                      <CardDescription className="mt-1 text-xs leading-relaxed">
                        {truncate(program.description, 100)}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/admin/programs/${program.id}`)} className="gap-2">
                        <Eye className="h-4 w-4" />
                        Voir
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEditDialog(program)} className="gap-2">
                        <Pencil className="h-4 w-4" />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openHistoryDialog(program)}
                        className="gap-2"
                      >
                        <History className="h-4 w-4" />
                        Historique des versions
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => openDeleteDialog(program)}
                        className="gap-2 text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {program.objectives && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      Objectifs
                    </p>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {truncate(program.objectives, 120)}
                    </p>
                  </div>
                )}

                {/* Modules count from content */}
                {program.content && typeof program.content === "object" && "modules" in program.content && Array.isArray((program.content as Record<string, unknown>).modules) && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>
                      {((program.content as Record<string, unknown>).modules as unknown[]).length} module
                      {((program.content as Record<string, unknown>).modules as unknown[]).length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Modifié le {formatDate(program.updated_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {program.is_active ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-gray-400" />
                    )}
                    <Switch
                      checked={program.is_active}
                      onCheckedChange={() => handleToggleActive(program)}
                      className="scale-75"
                    />
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-xs"
                  onClick={() => openHistoryDialog(program)}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Nouvelle version
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProgram ? "Modifier le programme" : "Nouveau programme pédagogique"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="p_title">
                Titre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="p_title"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Ex: Management d'équipe niveau 1"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p_desc">Description</Label>
              <Textarea
                id="p_desc"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                placeholder="Description générale du programme..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p_obj">Objectifs pédagogiques</Label>
              <Textarea
                id="p_obj"
                value={formData.objectives}
                onChange={(e) => setFormData((prev) => ({ ...prev, objectives: e.target.value }))}
                rows={3}
                placeholder="À l'issue de cette formation, les participants seront capables de..."
              />
            </div>


            {/* BPF & Financial Section */}
            <div className="border rounded-lg">
              <button
                type="button"
                onClick={() => setBpfSectionOpen((prev) => !prev)}
                className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors rounded-lg"
              >
                <span>Paramètres BPF & Financier</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-gray-400 transition-transform",
                    bpfSectionOpen && "rotate-180"
                  )}
                />
              </button>
              {bpfSectionOpen && (
                <div className="px-4 pb-4 space-y-4 border-t">
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="p_price">Prix HT (€)</Label>
                      <Input
                        id="p_price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                        placeholder="Ex: 1500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="p_tva">Taux TVA (%)</Label>
                      <Input
                        id="p_tva"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={formData.tva_rate}
                        onChange={(e) => setFormData((prev) => ({ ...prev, tva_rate: e.target.value }))}
                        placeholder="20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="p_duration">Durée (heures)</Label>
                    <Input
                      id="p_duration"
                      type="number"
                      min="0"
                      step="0.5"
                      value={formData.duration_hours}
                      onChange={(e) => setFormData((prev) => ({ ...prev, duration_hours: e.target.value }))}
                      placeholder="Ex: 14"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="p_nsf_code">Code NSF</Label>
                      <Input
                        id="p_nsf_code"
                        value={formData.nsf_code}
                        onChange={(e) => setFormData((prev) => ({ ...prev, nsf_code: e.target.value }))}
                        placeholder="Ex: 413"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="p_nsf_label">Libellé NSF</Label>
                      <Input
                        id="p_nsf_label"
                        value={formData.nsf_label}
                        onChange={(e) => setFormData((prev) => ({ ...prev, nsf_label: e.target.value }))}
                        placeholder="Ex: Développement des capacités comportementales"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 py-1">
                    <Switch
                      id="p_apprenticeship"
                      checked={formData.is_apprenticeship}
                      onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_apprenticeship: checked }))}
                    />
                    <Label htmlFor="p_apprenticeship" className="cursor-pointer">
                      Formation par apprentissage
                    </Label>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="p_funding">Source de financement BPF</Label>
                    <Select
                      value={formData.bpf_funding_type}
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, bpf_funding_type: value }))}
                    >
                      <SelectTrigger id="p_funding">
                        <SelectValue placeholder="Sélectionner une source..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Entreprises</SelectLabel>
                          <SelectItem value="entreprise_privee">Entreprise privée</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Fonds de formation</SelectLabel>
                          <SelectItem value="apprentissage">Contrats d&apos;apprentissage</SelectItem>
                          <SelectItem value="professionnalisation">Contrats de professionnalisation</SelectItem>
                          <SelectItem value="reconversion_alternance">Reconversion / alternance</SelectItem>
                          <SelectItem value="conge_transition">Congé / transition pro</SelectItem>
                          <SelectItem value="cpf">CPF</SelectItem>
                          <SelectItem value="dispositif_chomeurs">Dispositifs demandeurs d&apos;emploi</SelectItem>
                          <SelectItem value="non_salaries">Travailleurs non-salariés</SelectItem>
                          <SelectItem value="plan_developpement">Plan de développement</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Pouvoirs publics</SelectLabel>
                          <SelectItem value="pouvoir_public_agents">Pouvoirs publics (agents)</SelectItem>
                          <SelectItem value="instances_europeennes">Instances européennes</SelectItem>
                          <SelectItem value="etat">État</SelectItem>
                          <SelectItem value="conseil_regional">Conseils régionaux</SelectItem>
                          <SelectItem value="pole_emploi">Pôle emploi</SelectItem>
                          <SelectItem value="autres_publics">Autres publics</SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>Autres</SelectLabel>
                          <SelectItem value="individuel">Particulier</SelectItem>
                          <SelectItem value="organisme_formation">Organisme de formation</SelectItem>
                          <SelectItem value="autre">Autre</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="p_bpf_objective">Objectif BPF (F-3)</Label>
                    <Select
                      value={formData.bpf_objective}
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, bpf_objective: value }))}
                    >
                      <SelectTrigger id="p_bpf_objective">
                        <SelectValue placeholder="Sélectionner un objectif..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rncp_6_8">RNCP niveau 6-8 (Licence, Master, Doctorat...)</SelectItem>
                        <SelectItem value="rncp_5">RNCP niveau 5 (BTS, DUT...)</SelectItem>
                        <SelectItem value="rncp_4">RNCP niveau 4 (BAC pro, BT, BP...)</SelectItem>
                        <SelectItem value="rncp_3">RNCP niveau 3 (BEP, CAP...)</SelectItem>
                        <SelectItem value="rncp_2">RNCP niveau 2</SelectItem>
                        <SelectItem value="rncp_cqp">CQP sans niveau de qualification</SelectItem>
                        <SelectItem value="certification_rs">Certification / habilitation RS</SelectItem>
                        <SelectItem value="cqp_non_enregistre">CQP non enregistré RNCP/RS</SelectItem>
                        <SelectItem value="autre_pro">Autres formations professionnelles</SelectItem>
                        <SelectItem value="bilan_competences">Bilans de compétences</SelectItem>
                        <SelectItem value="vae">VAE (validation acquis expérience)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? "Enregistrement..."
                : editingProgram
                ? "Mettre à jour"
                : "Créer le programme"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historique — {selectedProgram?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Create new version */}
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div>
                <p className="text-sm font-medium text-blue-900">Version actuelle</p>
                <p className="text-xs text-blue-700">
                  v{selectedProgram?.version} — modifiée le{" "}
                  {formatDate(selectedProgram?.updated_at)}
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleCreateVersion}
                disabled={creatingVersion}
                className="gap-1.5"
              >
                <GitBranch className="h-3.5 w-3.5" />
                {creatingVersion
                  ? "Création..."
                  : `Créer v${(selectedProgram?.version || 0) + 1}`}
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide px-1">
                Versions archivées
              </p>
              {versionsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
                ))
              ) : versions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Aucune version archivée</p>
                  <p className="text-xs mt-1">
                    Créez une nouvelle version pour archiver l'état actuel.
                  </p>
                </div>
              ) : (
                versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-white hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className="font-mono text-xs border-gray-300 text-gray-600"
                      >
                        v{v.version}
                      </Badge>
                      <div>
                        <p className="text-sm text-gray-700">
                          Archivée le {formatDateTime(v.created_at)}
                        </p>
                        {v.content && typeof v.content === "object" && "modules" in v.content && Array.isArray((v.content as Record<string, unknown>).modules) && (
                          <p className="text-xs text-gray-400">
                            {((v.content as Record<string, unknown>).modules as unknown[]).length} module
                            {((v.content as Record<string, unknown>).modules as unknown[]).length !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDialogOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer le programme</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Supprimer{" "}
            <strong>&quot;{programToDelete?.title}&quot;</strong> ? Cette action est
            irréversible et supprimera toutes les versions archivées.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
