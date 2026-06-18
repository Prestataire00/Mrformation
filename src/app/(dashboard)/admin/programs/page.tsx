"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Program, ProgramContent, ProgramVersion } from "@/lib/types";
import {
  createProgram as createProgramService,
  updateProgram as updateProgramService,
  deleteProgram as deleteProgramService,
  toggleProgramActive as toggleProgramActiveService,
  fetchProgramVersions as fetchProgramVersionsService,
  createProgramVersion as createProgramVersionService,
  countProgramReferences as countProgramReferencesService,
  fetchProgramsUsageCounts as fetchProgramsUsageCountsService,
  auditOrphanLinks as auditOrphanLinksService,
  type ProgramReferenceCounts,
  type ProgramUsageCounts,
  type OrphanLinkCounts,
} from "@/lib/services/programs";
import {
  fetchPaginatedData,
  type PaginatedResult,
} from "@/lib/services/pagination";
import {
  programHubFormSchema,
  getProgramFormErrors,
  type ProgramHubFormInput,
} from "@/lib/validations/program";
import { BPF_FUNDING_LABELS, BPF_OBJECTIVE_LABELS } from "@/lib/bpf-labels";
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
import { NsfCodeCombobox } from "@/components/NsfCodeCombobox";
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
  Sparkles,
  Loader2 as Loader2Icon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
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

// E3-S03 : pagination serveur via fetchPaginatedData
const PAGE_SIZE = 12;

type ActiveFilter = "all" | "active" | "inactive";

const isActiveFilter = (v: string | null): v is ActiveFilter =>
  v === "all" || v === "active" || v === "inactive";

export default function ProgramsPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { entityId } = useEntity();

  // E3-S03 fix : init state depuis URL (search/page/filter) pour permettre
  // refresh, partage de lien, navigation back/forward sans perdre l'état.
  const initialSearch = searchParams?.get("search") ?? "";
  const initialFilterRaw = searchParams?.get("filter") ?? "all";
  const initialFilter: ActiveFilter = isActiveFilter(initialFilterRaw) ? initialFilterRaw : "all";
  const initialPageRaw = parseInt(searchParams?.get("page") ?? "1", 10);
  const initialPage = Number.isFinite(initialPageRaw) && initialPageRaw >= 1 ? initialPageRaw : 1;

  const [programs, setPrograms] = useState<Program[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // CONT-5 audit BMAD : counts d'usage par programme pour affichage badge.
  const [usageCounts, setUsageCounts] = useState<Record<string, ProgramUsageCounts>>({});
  // CONT-7 audit BMAD : count des orphelins (formations/sessions sans liens).
  const [orphanCounts, setOrphanCounts] = useState<OrphanLinkCounts | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(initialFilter);

  // E3-S03 : pagination serveur
  const [currentPage, setCurrentPage] = useState(initialPage);
  // Debounce search pour éviter une requête par frappe
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [formData, setFormData] = useState<ProgramFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [contentError, setContentError] = useState("");
  // Lot C audit BMAD : erreurs Zod par champ pour affichage sous chaque Input.
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ProgramHubFormInput, string>>>({});

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

  // AI extract from document
  const aiFileInputRef = useRef<HTMLInputElement>(null);
  const [aiExtracting, setAiExtracting] = useState(false);
  // Lot G audit BMAD : compte les références FK pour avertir l'utilisateur
  const [deleteCounts, setDeleteCounts] = useState<ProgramReferenceCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(false);

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [search]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter]);

  // E3-S03 fix : sync URL params (search/page/filter) — refresh / partage / back.
  // router.replace ne pousse pas dans l'historique → pas de spam back-button.
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (debouncedSearch) params.set("search", debouncedSearch);
    else params.delete("search");
    if (activeFilter !== "all") params.set("filter", activeFilter);
    else params.delete("filter");
    if (currentPage > 1) params.set("page", String(currentPage));
    else params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `/admin/programs?${qs}` : "/admin/programs", { scroll: false });
  }, [debouncedSearch, activeFilter, currentPage, router, searchParams]);

  // E3-S03 : fetch paginé serveur
  const fetchPrograms = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);

    const offset = (currentPage - 1) * PAGE_SIZE;

    // Build is_active filter for statusIn:
    // "is_active" is boolean in DB — Supabase .in() on booleans needs special handling.
    // We use statusIn with string values that Supabase/PostgREST converts.
    const statusIn =
      activeFilter === "active" ? ["true"] :
      activeFilter === "inactive" ? ["false"] :
      undefined;

    try {
      const result = await fetchPaginatedData<Program>(supabase, "programs", {
        filters: {
          entityId,
          search: debouncedSearch || undefined,
          searchColumn: "title",
          ...(statusIn && { statusIn, statusColumn: "is_active" }),
        },
        pageSize: PAGE_SIZE,
        offset,
      });

      setPrograms(result.data);
      setTotalCount(result.totalCount);

      // CONT-5 : charge les counts en arrière-plan (l'UI ne bloque pas).
      if (result.data.length > 0) {
        const ids = result.data.map((p) => p.id);
        const counts = await fetchProgramsUsageCountsService(supabase, ids);
        if (counts.ok) setUsageCounts(counts.countsByProgram);
      } else {
        setUsageCounts({});
      }

      // CONT-7 : audit orphelins (formations sans programme, sessions sans formation).
      const orphans = await auditOrphanLinksService(supabase, entityId);
      if (orphans.ok) setOrphanCounts(orphans.counts);
    } catch (err) {
      console.error("[programs] fetchPaginatedData failed:", err);
      toast({ title: "Erreur", description: "Impossible de charger les programmes.", variant: "destructive" });
    }

    setLoading(false);
  }, [entityId, supabase, toast, currentPage, debouncedSearch, activeFilter]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  // E3-S03 : pagination calculée côté serveur
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

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
    setFormErrors({});
    setBpfSectionOpen(false);
    setDialogOpen(true);
  };

  const handleAiExtractForNewProgram = async (file: File) => {
    setAiExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/programs/ai-extract", { method: "POST", body: fd });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `Erreur ${res.status}`);

      const e = result.extracted;
      // Build content JSON from modules
      const modules = Array.isArray(e.modules)
        ? e.modules.map((m: { title: string; duration_hours: number | null; topics: string; objectives?: string }, i: number) => ({
            id: i + 1,
            title: m.title || `Module ${i + 1}`,
            duration_hours: m.duration_hours ?? 0,
            objectives: m.objectives ? String(m.objectives).split("\n").filter(Boolean) : [],
            topics: m.topics ? String(m.topics).split("\n").filter(Boolean) : [],
          }))
        : [];

      const contentObj = {
        modules,
        target_audience: e.target_audience || undefined,
        prerequisites: e.prerequisites || undefined,
        team_description: e.team_description || undefined,
        evaluation_methods: e.evaluation_methods ? e.evaluation_methods.split("\n").filter(Boolean) : undefined,
        pedagogical_resources: e.pedagogical_resources ? e.pedagogical_resources.split("\n").filter(Boolean) : undefined,
        certification: (e.certification_results || e.certification_terms || e.certification_details)
          ? {
              results: e.certification_results || undefined,
              terms: e.certification_terms || undefined,
              details: e.certification_details || undefined,
            }
          : undefined,
      };

      setEditingProgram(null);
      setFormData({
        ...emptyForm,
        title: e.title || "",
        description: e.description || "",
        objectives: e.objectives || "",
        content: JSON.stringify(contentObj, null, 2),
        duration_hours: e.duration_hours != null ? String(e.duration_hours) : "",
      });
      setFormErrors({});
      setContentError("");
      setBpfSectionOpen(false);
      setDialogOpen(true);

      const moduleCount = modules.length;
      toast({
        title: "Programme extrait depuis le document",
        description: `${moduleCount} module${moduleCount > 1 ? "s" : ""} détecté${moduleCount > 1 ? "s" : ""}. Vérifiez et ajustez avant d'enregistrer.`,
      });
    } catch (err) {
      console.error("[ProgramsPage] ai-extract failed:", err);
      toast({
        title: "Extraction échouée",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setAiExtracting(false);
      if (aiFileInputRef.current) aiFileInputRef.current.value = "";
    }
  };

  const openEditDialog = (program: Program) => {
    setEditingProgram(program);
    setFormErrors({});
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
    // Lot C audit BMAD : validation Zod centralisée
    const parsed = programHubFormSchema.safeParse(formData);
    if (!parsed.success) {
      const errors = getProgramFormErrors<ProgramHubFormInput>(parsed);
      setFormErrors(errors);
      if (errors.content) setContentError(errors.content);
      toast({
        title: "Formulaire invalide",
        description: Object.values(errors)[0] || "Vérifiez les champs en rouge.",
        variant: "destructive",
      });
      return;
    }
    setFormErrors({});
    setContentError("");

    setSaving(true);
    const contentParsed = JSON.parse(formData.content) as ProgramContent;

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      objectives: formData.objectives.trim() || null,
      content: contentParsed,
      price: formData.price ? parseFloat(formData.price) : null,
      tva_rate: formData.tva_rate ? parseFloat(formData.tva_rate) : null,
      duration_hours: formData.duration_hours ? parseFloat(formData.duration_hours) : null,
      nsf_code: formData.nsf_code.trim() || null,
      nsf_label: formData.nsf_label.trim() || null,
      is_apprenticeship: formData.is_apprenticeship,
      bpf_objective: (formData.bpf_objective || null) as Program["bpf_objective"],
      bpf_funding_type: (formData.bpf_funding_type || null) as Program["bpf_funding_type"],
    };

    if (!entityId) {
      toast({ title: "Erreur", description: "Entité non chargée — réessayez.", variant: "destructive" });
      setSaving(false);
      return;
    }

    const servicePayload = {
      title: payload.title,
      description: payload.description,
      objectives: payload.objectives,
      content: payload.content,
      price: payload.price,
      tva_rate: payload.tva_rate,
      duration_hours: payload.duration_hours,
      nsf_code: payload.nsf_code,
      nsf_label: payload.nsf_label,
      is_apprenticeship: payload.is_apprenticeship,
      bpf_objective: payload.bpf_objective,
      bpf_funding_type: payload.bpf_funding_type,
    };
    if (editingProgram) {
      const result = await updateProgramService(supabase, editingProgram.id, entityId, servicePayload);
      if (!result.ok) {
        toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Programme mis à jour" });
    } else {
      const result = await createProgramService(supabase, entityId, servicePayload);
      if (!result.ok) {
        toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Programme créé", description: `"${servicePayload.title}" a été ajouté.` });
    }

    setSaving(false);
    setDialogOpen(false);
    await fetchPrograms();
  };

  const handleToggleActive = async (program: Program) => {
    if (!entityId) return;
    const result = await toggleProgramActiveService(supabase, program.id, entityId, !program.is_active);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
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
    const result = await fetchProgramVersionsService(supabase, program.id);
    if (!result.ok) {
      toast({ title: "Erreur", description: "Impossible de charger l'historique.", variant: "destructive" });
    } else {
      setVersions(result.versions);
    }
    setVersionsLoading(false);
  };

  const handleCreateVersion = async () => {
    if (!selectedProgram || !entityId) return;
    setCreatingVersion(true);

    const result = await createProgramVersionService(
      supabase,
      selectedProgram.id,
      entityId,
      selectedProgram.version,
      selectedProgram.content,
    );

    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
      setCreatingVersion(false);
      return;
    }

    toast({ title: `Version v${result.newVersion} créée`, description: selectedProgram.title });
    await fetchPrograms();
    const versionsResult = await fetchProgramVersionsService(supabase, selectedProgram.id);
    if (versionsResult.ok) setVersions(versionsResult.versions);
    setSelectedProgram((prev) => (prev ? { ...prev, version: result.newVersion } : null));
    setCreatingVersion(false);
  };

  const openDeleteDialog = async (program: Program) => {
    setProgramToDelete(program);
    setDeleteDialogOpen(true);
    setDeleteCounts(null);
    setCountsLoading(true);
    const result = await countProgramReferencesService(supabase, program.id);
    if (result.ok) setDeleteCounts(result.counts);
    setCountsLoading(false);
  };

  const handleSoftDelete = async () => {
    if (!programToDelete || !entityId) return;
    setDeleting(true);
    const result = await toggleProgramActiveService(supabase, programToDelete.id, entityId, false);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    } else {
      toast({
        title: "Programme désactivé",
        description: "Le programme reste accessible aux liens existants mais n'apparaît plus dans le catalogue.",
      });
      setDeleteDialogOpen(false);
      setProgramToDelete(null);
      setDeleteCounts(null);
      await fetchPrograms();
    }
    setDeleting(false);
  };

  const handleDelete = async () => {
    if (!programToDelete || !entityId) return;
    setDeleting(true);
    const result = await deleteProgramService(supabase, programToDelete.id, entityId);
    if (!result.ok) {
      toast({ title: "Erreur", description: result.error.message, variant: "destructive" });
    } else {
      toast({ title: "Programme supprimé" });
      setDeleteDialogOpen(false);
      setProgramToDelete(null);
      await fetchPrograms();
    }
    setDeleting(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* CONT-7 audit BMAD : bandeau de continuité */}
      {orphanCounts && (orphanCounts.formationsWithoutProgram > 0 || orphanCounts.sessionsWithoutTraining > 0) && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 flex items-start gap-3">
          <div className="text-amber-600 text-xl leading-none mt-0.5">⚠</div>
          <div className="text-xs text-amber-900 space-y-0.5">
            <p className="font-medium">Continuité Programme → Formation → Session</p>
            {orphanCounts.formationsWithoutProgram > 0 && (
              <p>
                <Link href="/admin/trainings" className="underline hover:text-amber-700">
                  {orphanCounts.formationsWithoutProgram} formation{orphanCounts.formationsWithoutProgram > 1 ? "s" : ""}
                </Link>{" "}
                sans programme rattaché — la doc générée (conventions, programmes PDF) sera incomplète.
              </p>
            )}
            {orphanCounts.sessionsWithoutTraining > 0 && (
              <p>
                <Link href="/admin/sessions" className="underline hover:text-amber-700">
                  {orphanCounts.sessionsWithoutTraining} session{orphanCounts.sessionsWithoutTraining > 1 ? "s" : ""}
                </Link>{" "}
                sans formation source — risque d'incohérence Qualiopi.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programmes pédagogiques</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount} programme{totalCount !== 1 ? "s" : ""}
            {activeFilter !== "all" && ` (filtre : ${activeFilter === "active" ? "actifs" : "inactifs"})`}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={aiFileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAiExtractForNewProgram(file);
            }}
          />
          <Button
            variant="outline"
            className="gap-2 text-violet-700 border-violet-200 hover:bg-violet-50"
            disabled={aiExtracting}
            onClick={() => aiFileInputRef.current?.click()}
          >
            {aiExtracting ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiExtracting ? "Extraction IA..." : "Nouveau depuis document"}
          </Button>
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
      ) : programs.length === 0 ? (
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
          {programs.map((program) => (
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
                        className="text-base leading-snug cursor-pointer hover:text-[#374151] transition-colors"
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
                    {/* CONT-5 + ELE-4 audit BMAD : badges usage formations / sessions / e-learnings */}
                    {(() => {
                      const counts = usageCounts[program.id];
                      if (!counts || (counts.trainings === 0 && counts.sessions === 0 && counts.elearnings === 0)) return null;
                      return (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {counts.trainings > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-1 border-blue-200 text-blue-700 bg-blue-50">
                              {counts.trainings} formation{counts.trainings > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {counts.sessions > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-1 border-emerald-200 text-emerald-700 bg-emerald-50">
                              {counts.sessions} session{counts.sessions > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {counts.elearnings > 0 && (
                            <Badge variant="outline" className="text-[10px] gap-1 border-purple-200 text-purple-700 bg-purple-50">
                              {counts.elearnings} e-learning{counts.elearnings > 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                      );
                    })()}
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
                  Historique des versions
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* E3-S03 : pagination serveur */}
      {!loading && totalCount > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-4">
          <p className="text-xs text-gray-500">
            Affichage {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalCount)} sur {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
            >
              Précédent
            </Button>
            <span className="text-xs text-gray-600">
              Page {safePage} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
            >
              Suivant
            </Button>
          </div>
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
                className={formErrors.title ? "border-red-400" : ""}
              />
              {formErrors.title && <p className="text-xs text-red-600">{formErrors.title}</p>}
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

                  <div className="space-y-1.5">
                    <Label htmlFor="p_nsf_code">Code NSF</Label>
                    <NsfCodeCombobox
                      id="p_nsf_code"
                      code={formData.nsf_code || null}
                      onChange={(code, label) => setFormData((prev) => ({
                        ...prev,
                        nsf_code: code || "",
                        nsf_label: label || "",
                      }))}
                      placeholder="Sélectionner un code NSF (Nomenclature des Spécialités de Formation)…"
                    />
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
                        {Object.entries(BPF_FUNDING_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
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
                        {Object.entries(BPF_OBJECTIVE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
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

      {/* Delete Confirmation Dialog — Lot G audit BMAD */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer le programme</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Programme : <strong>&quot;{programToDelete?.title}&quot;</strong>
            </p>

            {countsLoading ? (
              <p className="text-xs text-gray-400">Analyse des données liées…</p>
            ) : deleteCounts ? (
              (() => {
                const setNull = [
                  ["formation(s)", deleteCounts.trainings],
                  ["session(s)", deleteCounts.sessions],
                  ["cours e-learning", deleteCounts.elearning_courses],
                  ["devis CRM", deleteCounts.crm_quotes],
                ] as const;
                const cascade = [
                  ["inscription(s) au parcours", deleteCounts.program_enrollments],
                  ["version(s) archivée(s)", deleteCounts.program_versions],
                ] as const;
                const hasSetNull = setNull.some(([, c]) => (c ?? 0) > 0);
                const hasCascade = cascade.some(([, c]) => (c ?? 0) > 0);
                return (
                  <div className="space-y-2">
                    {hasSetNull && (
                      <div className="border border-amber-200 bg-amber-50 rounded-md p-3 text-xs space-y-1">
                        <p className="font-medium text-amber-900">⚠️ Liens qui seront cassés (silencieux) :</p>
                        {setNull.filter(([, c]) => (c ?? 0) > 0).map(([label, c]) => (
                          <p key={label} className="text-amber-800">• {c} {label} (le champ program_id sera mis à NULL)</p>
                        ))}
                      </div>
                    )}
                    {hasCascade && (
                      <div className="border border-red-200 bg-red-50 rounded-md p-3 text-xs space-y-1">
                        <p className="font-medium text-red-900">🗑️ Données qui seront supprimées définitivement :</p>
                        {cascade.filter(([, c]) => (c ?? 0) > 0).map(([label, c]) => (
                          <p key={label} className="text-red-800">• {c} {label}</p>
                        ))}
                      </div>
                    )}
                    {!hasSetNull && !hasCascade && (
                      <p className="text-xs text-green-700">Aucune donnée liée — la suppression est sans risque.</p>
                    )}
                    {(hasSetNull || hasCascade) && (
                      <p className="text-xs text-gray-600 mt-2">
                        💡 Pour préserver les liens existants, préférez <strong>Désactiver</strong> (le programme reste visible pour les formations / devis déjà créés mais disparaît du catalogue).
                      </p>
                    )}
                  </div>
                );
              })()
            ) : null}
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Annuler
            </Button>
            <div className="flex gap-2">
              {programToDelete?.is_active && (
                <Button variant="secondary" onClick={handleSoftDelete} disabled={deleting}>
                  {deleting ? "..." : "Désactiver"}
                </Button>
              )}
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Suppression..." : "Supprimer définitivement"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
