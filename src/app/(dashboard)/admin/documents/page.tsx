"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { DocumentTemplate, GeneratedDocument, Session, Client, Learner } from "@/lib/types";
import { cn, formatDate, formatDateTime, truncate } from "@/lib/utils";
import { resolveVariables as resolveVarsShared } from "@/lib/utils/resolve-variables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import dynamic from "next/dynamic";
const RichTextEditor = dynamic(
  () => import("@/components/editor/RichTextEditor").then(mod => mod.RichTextEditor),
  { ssr: false, loading: () => <div className="h-64 bg-gray-50 rounded-lg animate-pulse flex items-center justify-center text-sm text-gray-400">Chargement de l&apos;éditeur...</div> }
);
import { plainTextToHtml, isHtmlContent } from "@/lib/migrate-templates";
import { exportHtmlToPDF, exportToPDF } from "@/lib/pdf-export";
import { getDefaultTemplate } from "@/lib/document-templates-defaults";
import DOMPurifyLib from "dompurify";

// Safe sanitize — avoid hydration mismatch by always using the same function reference
function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurifyLib.sanitize(html);
}
import { useToast } from "@/components/ui/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  FileText,
  Download,
  Eye,
  Copy,
  Wand2,
  FileCheck,
  FileBadge,
  FileSignature,
  Receipt,
  File,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Upload,
  Building2,
  Users,
  GraduationCap,
  Send,
} from "lucide-react";
// exportToPDF already imported above

type DocumentType = "agreement" | "certificate" | "attendance" | "invoice" | "other";

const TYPE_LABELS: Record<DocumentType, string> = {
  agreement: "Contrat",
  certificate: "Certificat",
  attendance: "Émargement",
  invoice: "Facture",
  other: "Autre",
};

const TYPE_COLORS: Record<DocumentType, string> = {
  agreement: "bg-blue-100 text-blue-700",
  certificate: "bg-green-100 text-green-700",
  attendance: "bg-orange-100 text-orange-700",
  invoice: "bg-purple-100 text-purple-700",
  other: "bg-gray-100 text-gray-600",
};

const TypeIcon = ({ type }: { type: DocumentType }) => {
  if (type === "agreement") return <FileSignature className="h-4 w-4" />;
  if (type === "certificate") return <FileBadge className="h-4 w-4" />;
  if (type === "attendance") return <FileCheck className="h-4 w-4" />;
  if (type === "invoice") return <Receipt className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
};

const AVAILABLE_VARIABLES = [
  { key: "nom_client", label: "Nom de l'entreprise" },
  { key: "nom_apprenant", label: "Nom complet de l'apprenant" },
  { key: "prenom_apprenant", label: "Prénom de l'apprenant" },
  { key: "nom_formateur", label: "Nom du formateur" },
  { key: "titre_formation", label: "Titre de la formation" },
  { key: "date_formation", label: "Date de la formation" },
  { key: "date_debut", label: "Date de début" },
  { key: "date_fin", label: "Date de fin" },
  { key: "lieu", label: "Lieu de la formation" },
  { key: "duree_heures", label: "Durée en heures" },
  { key: "date_today", label: "Date du jour" },
  { key: "numero_facture", label: "Numéro de facture" },
  { key: "montant", label: "Montant HT" },
  { key: "signature_apprenant", label: "Signature de l'apprenant" },
  { key: "signature_formateur", label: "Signature du formateur" },
  { key: "email_apprenant", label: "Email de l'apprenant" },
  { key: "telephone_apprenant", label: "Téléphone de l'apprenant" },
];

const PREVIEW_VALUES: Record<string, string> = {
  "{{nom_client}}": "Entreprise DUPONT SAS",
  "{{nom_apprenant}}": "MARTIN Jean",
  "{{prenom_apprenant}}": "Jean",
  "{{nom_formateur}}": "Marie LECLERC",
  "{{titre_formation}}": "Formation IA Générative",
  "{{date_formation}}": "15/04/2026",
  "{{date_debut}}": "15/04/2026",
  "{{date_fin}}": "17/04/2026",
  "{{lieu}}": "Paris 8ème",
  "{{duree_heures}}": "21",
  "{{date_today}}": new Date().toLocaleDateString("fr-FR"),
  "{{numero_facture}}": "F-2026-042",
  "{{montant}}": "2 400,00 €",
  "{{signature_apprenant}}": "[Signature apprenant]",
  "{{signature_formateur}}": "[Signature formateur]",
  "{{email_apprenant}}": "jean.martin@exemple.fr",
  "{{telephone_apprenant}}": "06 12 34 56 78",
};

function getTemplatePreview(html: string): string {
  if (!html || html.replace(/<[^>]*>/g, "").trim() === "")
    return '<p style="color:#9ca3af;font-style:italic">Le contenu apparaîtra ici...</p>';
  let preview = html;
  Object.entries(PREVIEW_VALUES).forEach(([key, val]) => {
    preview = preview.replaceAll(
      key,
      `<span style="background:#dbeafe;color:#1d4ed8;padding:1px 4px;border-radius:3px;font-size:0.85em">${val}</span>`
    );
  });
  return preview;
}

// ── Official document types — matches exactly what TabConventionDocs uses ──

interface OfficialTemplate {
  id: string;
  name: string;
  category: "learner" | "company" | "trainer" | "common";
  categoryLabel: string;
  type: DocumentType;
  autoConfirmed: boolean;
}

const OFFICIAL_TEMPLATES: OfficialTemplate[] = [
  // Apprenant
  { id: "convocation", name: "CONVOCATION À LA FORMATION", category: "learner", categoryLabel: "Apprenant", type: "certificate", autoConfirmed: false },
  { id: "certificat_realisation", name: "CERTIFICAT DE RÉALISATION", category: "learner", categoryLabel: "Apprenant", type: "certificate", autoConfirmed: false },
  { id: "attestation_assiduite", name: "ATTESTATION D'ASSIDUITÉ", category: "learner", categoryLabel: "Apprenant", type: "attendance", autoConfirmed: false },
  { id: "feuille_emargement", name: "FEUILLE D'ÉMARGEMENT", category: "learner", categoryLabel: "Apprenant", type: "attendance", autoConfirmed: false },
  // Entreprise
  { id: "convention_entreprise", name: "CONVENTION ENTREPRISE", category: "company", categoryLabel: "Entreprise", type: "agreement", autoConfirmed: false },
  { id: "feuille_emargement_collectif", name: "FEUILLE D'ÉMARGEMENT COLLECTIF", category: "company", categoryLabel: "Entreprise", type: "attendance", autoConfirmed: false },
  { id: "planning_semaine", name: "PLANNING DE LA SEMAINE", category: "company", categoryLabel: "Entreprise", type: "attendance", autoConfirmed: false },
  // Formateur
  { id: "convention_intervention", name: "CONVENTION D'INTERVENTION", category: "trainer", categoryLabel: "Formateur", type: "agreement", autoConfirmed: false },
  { id: "contrat_sous_traitance", name: "CONTRAT CADRE DE SOUS-TRAITANCE", category: "trainer", categoryLabel: "Formateur", type: "agreement", autoConfirmed: false },
  // Communs (auto-confirmés)
  { id: "cgv", name: "CGV", category: "common", categoryLabel: "Commun", type: "other", autoConfirmed: true },
  { id: "politique_confidentialite", name: "POLITIQUE DE CONFIDENTIALITÉ", category: "common", categoryLabel: "Commun", type: "other", autoConfirmed: true },
  { id: "reglement_interieur", name: "RÈGLEMENT INTÉRIEUR", category: "common", categoryLabel: "Commun", type: "other", autoConfirmed: true },
  { id: "programme_formation", name: "PROGRAMME DE LA FORMATION", category: "common", categoryLabel: "Commun", type: "other", autoConfirmed: true },
];

const CATEGORY_COLORS: Record<string, string> = {
  learner: "bg-blue-100 text-blue-700",
  company: "bg-purple-100 text-purple-700",
  trainer: "bg-amber-100 text-amber-700",
  common: "bg-gray-100 text-gray-600",
};

// Starter templates for "Nouveau modèle" picker (subset for custom creation)
interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  type: DocumentType;
  variableCount: number;
  content: string;
}

function starterWrap(title: string, body: string): string {
  return `<h1>${title}</h1>\n${body}`;
}

const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "convocation",
    name: "Convocation à la formation",
    description: "Convoque un apprenant avec les détails pratiques",
    type: "certificate",
    variableCount: 9,
    content: starterWrap("CONVOCATION À LA FORMATION", `<p>Madame, Monsieur <strong>{{nom_apprenant}}</strong>,</p><p>Nous avons le plaisir de vous confirmer votre inscription à la formation <strong>{{titre_formation}}</strong>.</p><p>Du {{date_debut}} au {{date_fin}} — {{lieu}}</p><p>Cordialement,</p>`),
  },
  {
    id: "convention",
    name: "Convention de formation",
    description: "Convention entre l'organisme et l'entreprise",
    type: "agreement",
    variableCount: 8,
    content: starterWrap("CONVENTION DE FORMATION", `<p>Entre <strong>l'organisme de formation</strong> et <strong>{{nom_client}}</strong>.</p><p>Formation : {{titre_formation}}</p><p>Du {{date_debut}} au {{date_fin}} — {{duree_heures}}h</p>`),
  },
  {
    id: "certificat",
    name: "Certificat de réalisation",
    description: "Atteste la réalisation d'une formation",
    type: "certificate",
    variableCount: 7,
    content: starterWrap("CERTIFICAT DE RÉALISATION", `<p><strong>{{nom_apprenant}}</strong> a suivi la formation <strong>{{titre_formation}}</strong>.</p><p>Du {{date_debut}} au {{date_fin}} — {{duree_heures}}h</p><p><em>Fait le {{date_today}}</em></p>`),
  },
];

interface TemplateFormData {
  name: string;
  type: DocumentType;
  content: string;
  /**
   * - 'editable'      : contenu HTML éditable via l'éditeur Tiptap. PDF généré via HTML→CloudConvert.
   * - 'docx_fidelity' : .docx original stocké dans Storage. Pas d'édition côté plateforme.
   *                     PDF généré via .docx→CloudConvert (LibreOffice, fidélité ~99%).
   */
  mode: "editable" | "docx_fidelity";
  source_docx_url: string | null;
  source_docx_path: string | null;
}

interface GenerateFormData {
  template_id: string;
  session_id: string;
  client_id: string;
  learner_id: string;
  name: string;
}

const emptyTemplateForm: TemplateFormData = {
  name: "",
  type: "agreement",
  content: "",
  mode: "editable",
  source_docx_url: null,
  source_docx_path: null,
};

const emptyGenerateForm: GenerateFormData = {
  template_id: "",
  session_id: "",
  client_id: "",
  learner_id: "",
  name: "",
};

type GeneratedDocumentFull = GeneratedDocument & {
  template: { name: string; type: DocumentType; entity_id?: string } | null;
  session: { title: string; trainer?: { first_name: string; last_name: string } | null } | null;
  client: { company_name: string } | null;
  learner: { first_name: string; last_name: string } | null;
};

interface ClientDocument {
  id: string;
  client_id: string;
  name: string;
  type: string;
  file_url: string | null;
  notes: string | null;
  created_at: string;
  client?: { company_name: string } | null;
}

export default function DocumentsPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entity, entityId } = useEntity();

  // Templates state
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateSearch, setTemplateSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Generated docs state
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDocumentFull[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docSearch, setDocSearch] = useState("");

  // References
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);

  // Active tab
  const [activeTab, setActiveTab] = useState("official");

  // Template dialog
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [showStarterPicker, setShowStarterPicker] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormData>(emptyTemplateForm);
  const [saving, setSaving] = useState(false);

  // Delete template
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<DocumentTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Generate dialog
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState<GenerateFormData>(emptyGenerateForm);
  const [generating, setGenerating] = useState(false);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);

  // Signature availability for generate dialog
  const [sigAvailability, setSigAvailability] = useState<{ learner: boolean; trainer: boolean }>({ learner: false, trainer: false });

  // Preview template dialog
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<DocumentTemplate | null>(null);

  // Client documents state
  const [clientDocs, setClientDocs] = useState<ClientDocument[]>([]);
  const [clientDocsLoading, setClientDocsLoading] = useState(true);
  const [clientDocSearch, setClientDocSearch] = useState("");
  const CLIENT_DOC_TYPE_LABELS: Record<string, string> = {
    contract: "Contrat",
    agreement: "Convention",
    invoice: "Facture",
    quote: "Devis",
    bpf: "BPF",
    certificate: "Certificat",
    other: "Autre",
  };

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    let query = supabase
      .from("document_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (entityId) query = query.eq("entity_id", entityId);
    const { data, error } = await query;
    if (error) {
      console.error("fetchTemplates error:", error);
      toast({ title: "Erreur", description: "Impossible de charger les modèles.", variant: "destructive" });
    } else {
      setTemplates((data as DocumentTemplate[]) || []);
    }
    setTemplatesLoading(false);
  }, [entityId]);

  const fetchGeneratedDocs = useCallback(async () => {
    setDocsLoading(true);
    const { data, error } = await supabase
      .from("generated_documents")
      .select("*, template:document_templates(name, type, entity_id), session:sessions(title, trainer:trainers(first_name, last_name)), client:clients(company_name), learner:learners(first_name, last_name)")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchGeneratedDocs error:", error);
      toast({ title: "Erreur", description: "Impossible de charger les documents.", variant: "destructive" });
    } else {
      const all = (data as GeneratedDocumentFull[]) || [];
      const filtered = entityId ? all.filter((d) => d.template?.entity_id === entityId) : all;
      setGeneratedDocs(filtered);
    }
    setDocsLoading(false);
  }, [entityId]);

  const fetchRefs = useCallback(async () => {
    let sessionsQuery = supabase.from("sessions").select("id, title, start_date").order("start_date", { ascending: false });
    let clientsQuery = supabase.from("clients").select("id, company_name").order("company_name");
    let learnersQuery = supabase.from("learners").select("id, first_name, last_name").order("last_name");
    if (entityId) {
      sessionsQuery = sessionsQuery.eq("entity_id", entityId);
      clientsQuery = clientsQuery.eq("entity_id", entityId);
      learnersQuery = learnersQuery.eq("entity_id", entityId);
    }
    const [{ data: s }, { data: c }, { data: l }] = await Promise.all([sessionsQuery, clientsQuery, learnersQuery]);
    setSessions((s as Session[]) || []);
    setClients((c as Client[]) || []);
    setLearners((l as Learner[]) || []);
  }, [entityId]);

  const fetchClientDocs = useCallback(async () => {
    setClientDocsLoading(true);
    const { data, error } = await supabase
      .from("client_documents")
      .select("*, client:clients(company_name)")
      .order("created_at", { ascending: false });
    if (!error) setClientDocs((data as ClientDocument[]) || []);
    setClientDocsLoading(false);
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchGeneratedDocs();
    fetchRefs();
    fetchClientDocs();
  }, [fetchTemplates, fetchGeneratedDocs, fetchRefs, fetchClientDocs]);

  const filteredTemplates = templates.filter((t) => {
    const matchSearch =
      templateSearch === "" ||
      t.name.toLowerCase().includes(templateSearch.toLowerCase());
    const matchType = typeFilter === "all" || t.type === typeFilter;
    return matchSearch && matchType;
  });

  // Separate system vs custom templates
  const systemTemplates = filteredTemplates.filter((t) => (t as unknown as { is_system?: boolean }).is_system === true);
  const customTemplates = filteredTemplates.filter((t) => (t as unknown as { is_system?: boolean }).is_system !== true);

  // Map system_key to starter template content for system templates with empty content
  const SYSTEM_KEY_TO_STARTER: Record<string, string> = {};
  for (const s of STARTER_TEMPLATES) {
    SYSTEM_KEY_TO_STARTER[s.id] = s.content;
  }
  // Additional mappings for system_keys that differ from starter IDs
  SYSTEM_KEY_TO_STARTER["certificat_realisation"] = SYSTEM_KEY_TO_STARTER["certificat"] || "";
  SYSTEM_KEY_TO_STARTER["attestation_assiduite"] = SYSTEM_KEY_TO_STARTER["attestation"] || "";
  SYSTEM_KEY_TO_STARTER["convention_entreprise"] = SYSTEM_KEY_TO_STARTER["convention"] || "";
  SYSTEM_KEY_TO_STARTER["feuille_emargement_individuelle"] = SYSTEM_KEY_TO_STARTER["emargement"] || "";
  SYSTEM_KEY_TO_STARTER["feuille_emargement"] = SYSTEM_KEY_TO_STARTER["emargement"] || "";
  SYSTEM_KEY_TO_STARTER["politique_confidentialite"] = SYSTEM_KEY_TO_STARTER["politique_confidentialite"] || "";
  SYSTEM_KEY_TO_STARTER["programme_formation"] = SYSTEM_KEY_TO_STARTER["programme_formation"] || "";

  /** Get effective content for a template (fallback to starter for system templates) */
  function getTemplateContent(t: DocumentTemplate): string {
    if (t.content && t.content.replace(/<[^>]*>/g, "").trim() !== "") return t.content;
    const sysKey = (t as unknown as { system_key?: string }).system_key;
    if (sysKey && SYSTEM_KEY_TO_STARTER[sysKey]) return SYSTEM_KEY_TO_STARTER[sysKey];
    return "";
  }

  const filteredDocs = generatedDocs.filter((d) => {
    return (
      docSearch === "" ||
      d.name.toLowerCase().includes(docSearch.toLowerCase()) ||
      d.template?.name.toLowerCase().includes(docSearch.toLowerCase()) ||
      d.client?.company_name.toLowerCase().includes(docSearch.toLowerCase()) ||
      `${d.learner?.first_name} ${d.learner?.last_name}`.toLowerCase().includes(docSearch.toLowerCase())
    );
  });

  // Group documents by type for organized display
  const docsByType = Object.entries(TYPE_LABELS).map(([typeKey, typeLabel]) => ({
    type: typeKey as DocumentType,
    label: typeLabel,
    docs: filteredDocs.filter((d) => d.template?.type === typeKey),
  })).filter((g) => g.docs.length > 0);
  // Documents without a template type go in "Autre"
  const docsWithoutType = filteredDocs.filter((d) => !d.template?.type || !(d.template.type in TYPE_LABELS));
  if (docsWithoutType.length > 0) {
    const otherGroup = docsByType.find((g) => g.type === "other");
    if (otherGroup) otherGroup.docs.push(...docsWithoutType);
    else docsByType.push({ type: "other", label: "Autre", docs: docsWithoutType });
  }

  // Template CRUD
  const openAddTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm(emptyTemplateForm);
    setShowStarterPicker(true);
    setTemplateDialogOpen(true);
  };

  const handlePickStarter = (starter: StarterTemplate | null) => {
    if (starter) {
      setTemplateForm({
        name: starter.name,
        type: starter.type,
        content: starter.content,
        mode: "editable",
        source_docx_url: null,
        source_docx_path: null,
      });
    }
    setShowStarterPicker(false);
  };

  // Handler import .docx réutilisable (déclenchable depuis QuickActions ou bouton secondaire)
  const handleImportDocx = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".docx";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !entityId) return;
      toast({ title: "Import en cours..." });
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("entity_id", entityId);
        const res = await fetch("/api/documents/upload-template", { method: "POST", body: formData });
        const uploadResult = await res.json();
        if (!res.ok) throw new Error(uploadResult.error);

        // Mode "Fidélité Word" — le .docx original est conservé pour rendu LibreOffice fidèle.
        setEditingTemplate(null);
        setTemplateForm({
          name: file.name.replace(/\.docx$/i, ""),
          type: "other",
          content: "",
          mode: "docx_fidelity",
          source_docx_url: uploadResult.url,
          source_docx_path: uploadResult.path,
        });
        setShowStarterPicker(false);
        setTemplateDialogOpen(true);

        toast({
          title: "Document importé",
          description: "Mode Fidélité Word activé. L'aperçu PDF s'affiche dans la fenêtre.",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur import";
        toast({ title: "Erreur", description: msg, variant: "destructive" });
      }
    };
    input.click();
  };

  const openEditTemplate = (t: DocumentTemplate) => {
    setEditingTemplate(t);
    const effectiveContent = getTemplateContent(t);
    const tExt = t as DocumentTemplate & {
      mode?: "editable" | "docx_fidelity";
      source_docx_url?: string | null;
      source_docx_path?: string | null;
    };
    setTemplateForm({
      name: t.name,
      type: t.type as DocumentType,
      content: plainTextToHtml(effectiveContent),
      mode: tExt.mode === "docx_fidelity" ? "docx_fidelity" : "editable",
      source_docx_url: tExt.source_docx_url ?? null,
      source_docx_path: tExt.source_docx_path ?? null,
    });
    setTemplateDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) {
      toast({ title: "Nom requis", variant: "destructive" });
      return;
    }
    // Validation différente selon le mode
    if (templateForm.mode === "docx_fidelity") {
      if (!templateForm.source_docx_url) {
        toast({ title: "Aucun fichier .docx importé", variant: "destructive" });
        return;
      }
    } else if (!templateForm.content || templateForm.content.replace(/<[^>]*>/g, "").trim() === "") {
      toast({ title: "Contenu requis", variant: "destructive" });
      return;
    }
    setSaving(true);

    // Extract variables : depuis le HTML édité OU depuis le .docx source (à défaut, [])
    const variableMatches = templateForm.content.match(/\{\{[^}]+\}\}/g) || [];
    const uniqueVars = [...new Set(variableMatches)];

    const payload = {
      name: templateForm.name.trim(),
      type: templateForm.type,
      content: templateForm.content,
      variables: uniqueVars,
      mode: templateForm.mode,
      source_docx_url: templateForm.source_docx_url,
      source_docx_path: templateForm.source_docx_path,
    };

    console.log("[saveTemplate] payload", payload, "entityId", entityId);
    if (editingTemplate) {
      const { error } = await supabase.from("document_templates").update(payload).eq("id", editingTemplate.id);
      if (error) {
        console.error("[saveTemplate] UPDATE failed", error);
        toast({ title: "Erreur enregistrement", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Modèle mis à jour" });
    } else {
      const { data: inserted, error } = await supabase.from("document_templates").insert({ ...payload, entity_id: entityId }).select("id").single();
      if (error) {
        console.error("[saveTemplate] INSERT failed", error);
        toast({ title: "Erreur enregistrement", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      console.log("[saveTemplate] INSERT OK", inserted);
      toast({ title: "Modèle créé", description: `ID: ${inserted?.id?.slice(0, 8)}...` });
    }
    setSaving(false);
    setTemplateDialogOpen(false);
    await fetchTemplates();
  };

  const openDeleteTemplate = (t: DocumentTemplate) => {
    setTemplateToDelete(t);
    setDeleteDialogOpen(true);
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("document_templates").delete().eq("id", templateToDelete.id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); }
    else {
      toast({ title: "Modèle supprimé" });
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      await fetchTemplates();
    }
    setDeleting(false);
  };

  const handleExportTemplateAsPDF = async (tpl?: DocumentTemplate) => {
    const content = tpl ? getTemplateContent(tpl) : templateForm.content;
    const name = tpl?.name || templateForm.name || "Document";
    if (!content || content.replace(/<[^>]*>/g, "").trim() === "") {
      toast({ title: "Aucun contenu à exporter", variant: "destructive" });
      return;
    }
    const preview = getTemplatePreview(content);
    await exportHtmlToPDF(
      name,
      preview,
      `modele-${name.toLowerCase().replace(/\s+/g, "-")}.pdf`,
      entity?.name || "MR FORMATION"
    );
    toast({ title: "PDF exporté" });
  };

  // insertVariable is now handled by the RichTextEditor toolbar

  // Generate document — use shared variable resolution utility
  const resolveVariables = (content: string, data: {
    session?: Session | null;
    client?: Client | null;
    learner?: Learner | null;
  }): string => resolveVarsShared(content, data);

  const openGenerateDialog = () => {
    setGenerateForm(emptyGenerateForm);
    setPreviewContent("");
    setShowPreview(false);
    setGenerateDialogOpen(true);
  };

  const updatePreview = async (form: GenerateFormData) => {
    if (!form.template_id) { setPreviewContent(""); return; }
    const template = templates.find((t) => t.id === form.template_id);
    if (!template?.content) { setPreviewContent(""); return; }

    let sessionData: Session | null = null;
    let clientData: Client | null = null;
    let learnerData: Learner | null = null;

    if (form.session_id) {
      const { data } = await supabase.from("sessions").select("*").eq("id", form.session_id).single();
      sessionData = data as Session | null;
    }
    if (form.client_id) {
      const { data } = await supabase.from("clients").select("*").eq("id", form.client_id).single();
      clientData = data as Client | null;
    }
    if (form.learner_id) {
      const { data } = await supabase.from("learners").select("*").eq("id", form.learner_id).single();
      learnerData = data as Learner | null;
    }

    setPreviewContent(resolveVariables(template.content, { session: sessionData, client: clientData, learner: learnerData }));
    setShowPreview(true);

    // Check signature availability
    if (form.session_id) {
      const { data: sigData } = await supabase
        .from("signatures")
        .select("signer_type, signer_id")
        .eq("session_id", form.session_id);
      const hasLearner = sigData?.some((s: any) => s.signer_type === "learner" && s.signer_id === (form.learner_id || "")) ?? false;
      const hasTrainer = sigData?.some((s: any) => s.signer_type === "trainer") ?? false;
      setSigAvailability({ learner: hasLearner, trainer: hasTrainer });
    } else {
      setSigAvailability({ learner: false, trainer: false });
    }
  };

  const handleGenerate = async () => {
    if (!generateForm.template_id) {
      toast({ title: "Sélectionnez un modèle", variant: "destructive" });
      return;
    }
    if (!generateForm.name.trim()) {
      toast({ title: "Nom du document requis", variant: "destructive" });
      return;
    }
    setGenerating(true);

    const template = templates.find((t) => t.id === generateForm.template_id);
    if (!template) { setGenerating(false); return; }

    let sessionData: Session | null = null;
    let clientData: Client | null = null;
    let learnerData: Learner | null = null;

    if (generateForm.session_id) {
      const { data } = await supabase.from("sessions").select("*").eq("id", generateForm.session_id).single();
      sessionData = data as Session | null;
    }
    if (generateForm.client_id) {
      const { data } = await supabase.from("clients").select("*").eq("id", generateForm.client_id).single();
      clientData = data as Client | null;
    }
    if (generateForm.learner_id) {
      const { data } = await supabase.from("learners").select("*").eq("id", generateForm.learner_id).single();
      learnerData = data as Learner | null;
    }

    // Fetch signatures if template uses them
    let learnerSignatureSvg = "[Signature apprenant]";
    let trainerSignatureSvg = "[Signature formateur]";
    if (generateForm.session_id) {
      const { data: sigData } = await supabase
        .from("signatures")
        .select("signer_type, signer_id, signature_data")
        .eq("session_id", generateForm.session_id);
      if (sigData) {
        const learnerSig = sigData.find((s: any) => s.signer_type === "learner" && s.signer_id === (generateForm.learner_id || ""));
        const trainerSig = sigData.find((s: any) => s.signer_type === "trainer");
        if (learnerSig?.signature_data) learnerSignatureSvg = learnerSig.signature_data;
        if (trainerSig?.signature_data) trainerSignatureSvg = trainerSig.signature_data;
      }
    }

    const resolvedContent = resolveVariables(template.content || "", { session: sessionData, client: clientData, learner: learnerData });

    // Replace signature placeholders with actual SVG data
    const finalContent = resolvedContent
      .replaceAll("[Signature apprenant]", learnerSignatureSvg)
      .replaceAll("[Signature formateur]", trainerSignatureSvg);

    const { data: insertedDoc, error } = await supabase.from("generated_documents").insert({
      template_id: generateForm.template_id,
      session_id: generateForm.session_id || null,
      client_id: generateForm.client_id || null,
      learner_id: generateForm.learner_id || null,
      name: generateForm.name.trim(),
      content: finalContent,
      file_url: null,
    }).select("id").single();

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      // Link signatures to the generated document via document_id
      if (insertedDoc?.id && generateForm.session_id) {
        const sigIdsToLink: string[] = [];
        if (learnerSignatureSvg !== "[Signature apprenant]") {
          const { data: sigRows } = await supabase
            .from("signatures")
            .select("id")
            .eq("session_id", generateForm.session_id)
            .eq("signer_type", "learner")
            .eq("signer_id", generateForm.learner_id || "");
          if (sigRows) sigIdsToLink.push(...sigRows.map((r: any) => r.id));
        }
        if (trainerSignatureSvg !== "[Signature formateur]") {
          const { data: sigRows } = await supabase
            .from("signatures")
            .select("id")
            .eq("session_id", generateForm.session_id)
            .eq("signer_type", "trainer");
          if (sigRows) sigIdsToLink.push(...sigRows.map((r: any) => r.id));
        }
        if (sigIdsToLink.length > 0) {
          await supabase
            .from("signatures")
            .update({ document_id: insertedDoc.id })
            .in("id", sigIdsToLink);
        }
      }
      toast({ title: "Document généré", description: `"${generateForm.name}" a été créé.` });
      setGenerateDialogOpen(false);
      await fetchGeneratedDocs();
    }
    setGenerating(false);
  };

  const handleDownload = async (doc: GeneratedDocumentFull) => {
    if (doc.file_url) {
      window.open(doc.file_url, "_blank");
    } else if (doc.content) {
      if (isHtmlContent(doc.content)) {
        await exportHtmlToPDF(doc.name, doc.content, doc.name);
      } else {
        exportToPDF(doc.name, doc.content, doc.name);
      }
      toast({ title: "PDF généré", description: `"${doc.name}" a été téléchargé en PDF.` });
    } else {
      toast({ title: "Aucun contenu à télécharger", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-1">
            {OFFICIAL_TEMPLATES.length} templates officiels — {templates.length} modèle{templates.length !== 1 ? "s" : ""} personnalisés — {generatedDocs.length} document{generatedDocs.length !== 1 ? "s" : ""} générés
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/admin/settings/organization" className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1">
            <Building2 className="h-3 w-3" /> Infos organisme
          </a>
          <a href="/admin/documents/variables" className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1">
            Toutes les variables
          </a>
        </div>
      </div>

      {/* Actions rapides — point d'entrée principal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={handleImportDocx}
          className="group text-left p-5 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 hover:border-blue-400 hover:bg-blue-50 transition-all flex items-start gap-4"
        >
          <div className="shrink-0 p-3 rounded-lg bg-blue-100 group-hover:bg-blue-200 transition-colors">
            <Upload className="h-5 w-5 text-blue-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Importer un document Word</h3>
            <p className="text-sm text-gray-500 mt-1">
              Upload .docx — fidélité 99% (couleurs, tableaux, logos préservés)
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={openAddTemplate}
          className="group text-left p-5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-50 transition-all flex items-start gap-4"
        >
          <div className="shrink-0 p-3 rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
            <Plus className="h-5 w-5 text-gray-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Créer un modèle vierge</h3>
            <p className="text-sm text-gray-500 mt-1">
              Éditeur HTML avec variables dynamiques {"{{nom_apprenant}}"}, etc.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("custom");
            toast({
              title: "Choisissez un modèle",
              description: "Cliquez sur «Envoyer» depuis la carte du modèle voulu.",
            });
          }}
          className="group text-left p-5 rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 hover:bg-emerald-50 transition-all flex items-start gap-4"
        >
          <div className="shrink-0 p-3 rounded-lg bg-emerald-100 group-hover:bg-emerald-200 transition-colors">
            <Send className="h-5 w-5 text-emerald-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Envoyer à un apprenant</h3>
            <p className="text-sm text-gray-500 mt-1">
              Choisir un modèle + destinataire — envoi automatique avec PDF
            </p>
          </div>
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="official">Templates officiels</TabsTrigger>
          <TabsTrigger value="custom">Mes modèles</TabsTrigger>
          <TabsTrigger value="generated">Documents générés</TabsTrigger>
          <TabsTrigger value="client-docs" className="gap-2">
            <Building2 className="h-4 w-4" />
            Documents clients
          </TabsTrigger>
        </TabsList>

        {/* ═══ ONGLET 1 : TEMPLATES OFFICIELS ═══ */}
        <TabsContent value="official" className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 flex gap-2">
            <span className="shrink-0 mt-0.5">ℹ️</span>
            <span>Modèles de base fournis par la plateforme. Cliquez <strong>Utiliser comme base</strong> pour créer votre propre version personnalisée.</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Les {OFFICIAL_TEMPLATES.length} documents officiels utilisés dans les fiches formation. Identiques à ceux de l&apos;onglet Convention & Documents.
          </p>

          {(["learner", "company", "trainer", "common"] as const).map((cat) => {
            const catTemplates = OFFICIAL_TEMPLATES.filter((t) => t.category === cat);
            const catLabel = cat === "learner" ? "Documents Apprenant" : cat === "company" ? "Documents Entreprise" : cat === "trainer" ? "Documents Formateur" : "Documents Communs (auto-confirmés)";
            return (
              <div key={cat}>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{catLabel}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {catTemplates.map((ot) => {
                    // Find matching DB template for "Personnaliser"
                    const dbTemplate = templates.find((t) =>
                      (t as unknown as { system_key?: string }).system_key === ot.id || t.name.toLowerCase().includes(ot.name.toLowerCase().slice(0, 15))
                    );
                    return (
                      <Card key={ot.id} className="group hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className={cn("p-2 rounded-lg", TYPE_COLORS[ot.type])}>
                                <TypeIcon type={ot.type} />
                              </div>
                              <div>
                                <CardTitle className="text-sm">{ot.name}</CardTitle>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <Badge className={cn("text-xs font-normal", CATEGORY_COLORS[ot.category])}>
                                    {ot.categoryLabel}
                                  </Badge>
                                  {ot.autoConfirmed && (
                                    <Badge variant="outline" className="text-xs font-normal text-green-600 border-green-200">Auto-confirmé</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1"
                              onClick={() => {
                                try {
                                  const demoData = {
                                    formation: { id: "demo", title: "Formation IA Générative", start_date: "2026-04-15", end_date: "2026-04-17", planned_hours: 21, mode: "presentiel", location: "Paris", enrollments: [], formation_trainers: [], formation_time_slots: [], signatures: [] },
                                    entityName: entity?.name || "MR FORMATION",
                                  };
                                  const html = getDefaultTemplate(ot.id, demoData as unknown as Parameters<typeof getDefaultTemplate>[1]);
                                  if (html) {
                                    setPreviewTemplate({ id: ot.id, name: ot.name, type: ot.type, content: html, entity_id: "", created_at: "", updated_at: "", variables: [] } as DocumentTemplate);
                                    setPreviewDialogOpen(true);
                                  } else {
                                    toast({ title: "Aperçu non disponible pour ce type" });
                                  }
                                } catch (err) {
                                  console.error("[documents] preview error:", err);
                                  toast({ title: "Erreur de prévisualisation", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
                                }
                              }}
                            >
                              <Eye className="h-3 w-3" /> Aperçu
                            </Button>
                            {dbTemplate ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => openEditTemplate(dbTemplate)}
                              >
                                <Pencil className="h-3 w-3" /> Modifier ma version
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={async () => {
                                  try {
                                    const demoData = {
                                      formation: { id: "demo", title: "Formation", start_date: "2026-01-01", end_date: "2026-01-03", planned_hours: 21, mode: "presentiel", location: "Marseille", enrollments: [], formation_trainers: [], formation_time_slots: [], signatures: [] },
                                      entityName: entity?.name || "MR FORMATION",
                                    };
                                    const html = getDefaultTemplate(ot.id, demoData as unknown as Parameters<typeof getDefaultTemplate>[1]) || "";
                                    const { data: newTpl, error } = await supabase
                                      .from("document_templates")
                                      .insert({
                                        name: `${ot.name} (personnalisé)`,
                                        type: ot.type,
                                        content: html,
                                        entity_id: entityId,
                                        system_key: ot.id,
                                      })
                                      .select()
                                      .single();
                                    if (error) throw error;
                                    await fetchTemplates();
                                    setActiveTab("custom");
                                    openEditTemplate(newTpl as DocumentTemplate);
                                    toast({ title: "Modèle créé", description: `"${newTpl.name}" prêt à personnaliser` });
                                  } catch (err) {
                                    toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
                                  }
                                }}
                              >
                                <Copy className="h-3 w-3" /> Utiliser comme base
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* ═══ ONGLET 2 : MES MODÈLES (custom) ═══ */}
        <TabsContent value="custom" className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900 flex gap-2">
            <span className="shrink-0 mt-0.5">✏️</span>
            <span>Vos modèles personnalisés. Ils remplacent les modèles officiels dans vos formations quand ils sont associés.</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Rechercher un modèle..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  <SelectItem value="agreement">Contrat</SelectItem>
                  <SelectItem value="certificate">Certificat</SelectItem>
                  <SelectItem value="attendance">Émargement</SelectItem>
                  <SelectItem value="invoice">Facture</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={openAddTemplate} variant="outline" className="gap-2 shrink-0">
                <Plus className="h-4 w-4" />
                Nouveau modèle
              </Button>
              <Button
                variant="outline"
                className="gap-2 shrink-0"
                onClick={handleImportDocx}
              >
                <Upload className="h-4 w-4" />
                Importer .docx
              </Button>
            </div>
          </div>

          {templatesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-44 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : customTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileText className="h-12 w-12 text-gray-300 mb-3" />
              <p className="font-medium text-gray-600">Aucun modèle personnalisé</p>
              <p className="text-sm text-gray-400 mt-1">Créez votre premier modèle ou importez un .docx.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {customTemplates.map((template) => {
                const tplExt = template as DocumentTemplate & { mode?: "editable" | "docx_fidelity" };
                const isWordMode = tplExt.mode === "docx_fidelity";
                return (
                  <Card key={template.id} className="group hover:shadow-md transition-shadow flex flex-col">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={cn("p-2 rounded-lg shrink-0", TYPE_COLORS[template.type as DocumentType])}>
                            <TypeIcon type={template.type as DocumentType} />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-sm truncate">{truncate(template.name, 40)}</CardTitle>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <Badge className={cn("text-xs font-normal", TYPE_COLORS[template.type as DocumentType])}>
                                {TYPE_LABELS[template.type as DocumentType]}
                              </Badge>
                              {isWordMode ? (
                                <Badge className="text-xs font-normal bg-blue-100 text-blue-700 border-blue-200">
                                  📄 Fidélité Word
                                </Badge>
                              ) : (
                                <Badge className="text-xs font-normal bg-gray-100 text-gray-600 border-gray-200">
                                  ✍️ Éditable
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleExportTemplateAsPDF(template)} className="gap-2">
                              <Download className="h-4 w-4" />
                              Exporter PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditTemplate(template)} className="gap-2">
                              <Pencil className="h-4 w-4" />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openDeleteTemplate(template)} className="gap-2 text-red-600 focus:text-red-600">
                              <Trash2 className="h-4 w-4" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 flex-1 flex flex-col">
                      {!isWordMode && template.content && (
                        <CardDescription className="text-xs leading-relaxed line-clamp-3">
                          {truncate(template.content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " "), 120)}
                        </CardDescription>
                      )}
                      {isWordMode && (
                        <CardDescription className="text-xs leading-relaxed text-gray-500 italic">
                          Document Word — édité dans Word, rendu PDF fidèle au document d&apos;origine.
                        </CardDescription>
                      )}
                      <div className="mt-auto pt-3 border-t">
                        <p className="text-xs text-gray-400 mb-2">Créé le {formatDate(template.created_at)}</p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-8 text-xs gap-1"
                            onClick={() => { setPreviewTemplate(template); setPreviewDialogOpen(true); }}
                          >
                            <Eye className="h-3 w-3" />
                            Aperçu
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => {
                              if (isWordMode) {
                                // TODO Phase 3 : modal "Envoyer à un apprenant" qui utilise enqueueEmail
                                // avec descripteur uploaded_docx + variables {{xxx}} substituées via docxtemplater
                                toast({
                                  title: "Envoi à venir",
                                  description: "La fonctionnalité d'envoi direct depuis cette card est en cours de développement. Pour le moment, attache ce template à une session puis envoie depuis le module Emails.",
                                });
                                return;
                              }
                              setGenerateForm((prev) => ({ ...prev, template_id: template.id, name: `${template.name} — ${new Date().toLocaleDateString("fr-FR")}` }));
                              setShowPreview(false);
                              setPreviewContent("");
                              setGenerateDialogOpen(true);
                            }}
                          >
                            <Send className="h-3 w-3" />
                            Envoyer
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* GENERATED DOCUMENTS TAB */}
        <TabsContent value="generated" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Rechercher un document..."
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[180px]">Nom</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Session</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />Formateur</span>
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      <span className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" />Apprenant</span>
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Créé le</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {docsLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredDocs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                        <FileText className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="font-medium">Aucun document généré</p>
                        <p className="text-xs mt-1">Utilisez un modèle pour générer votre premier document.</p>
                      </td>
                    </tr>
                  ) : (
                    docsByType.flatMap((group) => [
                      // Type group header row
                      <tr key={`header-${group.type}`} className="bg-gray-50 border-t-2 border-gray-200">
                        <td colSpan={8} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <Badge className={cn("text-xs font-semibold", TYPE_COLORS[group.type])}>
                              <TypeIcon type={group.type} />
                              <span className="ml-1">{group.label}</span>
                            </Badge>
                            <span className="text-xs text-gray-400">{group.docs.length} document{group.docs.length > 1 ? "s" : ""}</span>
                          </div>
                        </td>
                      </tr>,
                      // Document rows for this type
                      ...group.docs.map((doc) => (
                        <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{truncate(doc.name, 38)}</p>
                            {doc.template && (
                              <p className="text-[11px] text-gray-400 mt-0.5">{truncate(doc.template.name, 30)}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {doc.session?.title ? truncate(doc.session.title, 28) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {doc.session?.trainer
                              ? `${doc.session.trainer.first_name} ${doc.session.trainer.last_name}`
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {doc.client?.company_name ? truncate(doc.client.company_name, 22) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {doc.learner ? `${doc.learner.first_name} ${doc.learner.last_name}` : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {formatDateTime(doc.created_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-xs"
                              onClick={() => handleDownload(doc)}
                            >
                              <Download className="h-3.5 w-3.5" />
                              PDF
                            </Button>
                          </td>
                        </tr>
                      )),
                    ])
                  )}
                </tbody>
              </table>
            </div>
            {!docsLoading && generatedDocs.length > 0 && (
              <div className="px-4 py-3 border-t bg-gray-50 text-xs text-gray-500 flex flex-wrap items-center gap-2">
                <span className="font-medium">{generatedDocs.length} document{generatedDocs.length !== 1 ? "s" : ""} au total</span>
                <span className="text-gray-300">|</span>
                {docsByType.map((g) => (
                  <span key={g.type} className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", TYPE_COLORS[g.type])}>
                    {g.label} : {g.docs.length}
                  </span>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
        {/* CLIENT DOCUMENTS TAB */}
        <TabsContent value="client-docs" className="space-y-4">
          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(CLIENT_DOC_TYPE_LABELS).map(([type, label]) => {
              const count = clientDocs.filter((d) => d.type === type).length;
              if (count === 0) return null;
              return (
                <Card key={type} className="p-3">
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}{count > 1 ? "s" : ""}</p>
                </Card>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Rechercher un document client..."
                value={clientDocSearch}
                onChange={(e) => setClientDocSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {clientDocsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (() => {
            const filtered = clientDocs.filter((d) =>
              clientDocSearch === "" ||
              d.name.toLowerCase().includes(clientDocSearch.toLowerCase()) ||
              d.client?.company_name?.toLowerCase().includes(clientDocSearch.toLowerCase())
            );

            // Group by client
            const byClient = filtered.reduce<Record<string, { company: string; docs: ClientDocument[] }>>((acc, doc) => {
              const key = doc.client_id;
              if (!acc[key]) acc[key] = { company: doc.client?.company_name || "Client inconnu", docs: [] };
              acc[key].docs.push(doc);
              return acc;
            }, {});

            if (filtered.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Building2 className="h-12 w-12 text-gray-300 mb-3" />
                  <p className="font-medium text-gray-600">Aucun document client</p>
                  <p className="text-sm text-gray-400 mt-1">Les documents clients (contrats, BPF, factures...) apparaissent ici.</p>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                {Object.entries(byClient).map(([clientId, { company, docs }]) => (
                  <div key={clientId} className="border rounded-lg overflow-hidden bg-white shadow-sm">
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b">
                      <Building2 className="h-4 w-4 text-gray-500" />
                      <span className="font-medium text-gray-800">{company}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">{docs.length} document{docs.length > 1 ? "s" : ""}</Badge>
                    </div>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-gray-100">
                        {docs.map((doc) => (
                          <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                                <span className="font-medium text-gray-900">{doc.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-xs font-normal">
                                {CLIENT_DOC_TYPE_LABELS[doc.type] || doc.type}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {doc.notes ? truncate(doc.notes, 40) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {formatDate(doc.created_at)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {doc.file_url ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs"
                                  onClick={() => window.open(doc.file_url!, "_blank")}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Ouvrir
                                </Button>
                              ) : (
                                <span className="text-xs text-gray-400">Aucun fichier</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* Template Add/Edit Dialog — Split Screen */}
      <Dialog open={templateDialogOpen} onOpenChange={(open) => { setTemplateDialogOpen(open); if (!open) setShowStarterPicker(false); }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate
                ? "Modifier le modèle"
                : showStarterPicker
                  ? "Nouveau modèle — choisir un point de départ"
                  : "Nouveau modèle de document"}
            </DialogTitle>
          </DialogHeader>

          {showStarterPicker && !editingTemplate ? (
            <div className="flex-1 overflow-y-auto px-1 py-4">
              <div className="grid grid-cols-3 gap-4">
                {/* Page vierge */}
                <button
                  onClick={() => handlePickStarter(null)}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-[#374151] hover:bg-[#374151]/5 transition-colors cursor-pointer group"
                >
                  <Plus className="h-8 w-8 mx-auto mb-3 text-gray-400 group-hover:text-[#374151]" />
                  <p className="font-medium text-gray-700">Page vierge</p>
                  <p className="text-sm text-gray-400 mt-1">Partir de zéro</p>
                </button>

                {/* Starter cards */}
                {STARTER_TEMPLATES.map((starter) => (
                  <button
                    key={starter.id}
                    onClick={() => handlePickStarter(starter)}
                    className="border border-gray-200 rounded-xl p-6 text-left hover:border-[#374151] hover:bg-[#374151]/5 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className={cn("p-2 rounded-lg", TYPE_COLORS[starter.type])}>
                        <TypeIcon type={starter.type} />
                      </div>
                      <Badge className={cn("text-xs font-normal", TYPE_COLORS[starter.type])}>
                        {TYPE_LABELS[starter.type]}
                      </Badge>
                    </div>
                    <p className="font-medium text-gray-700">{starter.name}</p>
                    <p className="text-sm text-gray-400 mt-1">{starter.description}</p>
                    <p className="text-xs text-gray-400 mt-3">{starter.variableCount} variables incluses</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Champs nom + type en haut pleine largeur */}
              <div className="grid grid-cols-2 gap-4 px-1 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="t_name">Nom <span className="text-red-500">*</span></Label>
                  <Input
                    id="t_name"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Ex: Contrat de formation standard"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t_type">Type</Label>
                  <Select value={templateForm.type} onValueChange={(v) => setTemplateForm((p) => ({ ...p, type: v as DocumentType }))}>
                    <SelectTrigger id="t_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agreement">Contrat</SelectItem>
                      <SelectItem value="certificate">Certificat</SelectItem>
                      <SelectItem value="attendance">Émargement</SelectItem>
                      <SelectItem value="invoice">Facture</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Mode "Fidélité Word" : aperçu PDF du .docx original via CloudConvert */}
              {templateForm.mode === "docx_fidelity" && templateForm.source_docx_url ? (
                <div className="flex flex-col flex-1 gap-2 px-1 pb-2 overflow-hidden min-h-0" style={{ minHeight: "400px" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200">Mode Fidélité Word</Badge>
                      <p className="text-xs text-gray-500">
                        Le PDF envoyé sera identique au .docx d&apos;origine (LibreOffice cloud).
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(templateForm.source_docx_url!, "_blank")}
                      className="h-7 text-xs gap-1"
                    >
                      <Download className="h-3 w-3" /> Télécharger le .docx
                    </Button>
                  </div>
                  <div className="flex-1 border rounded-lg overflow-hidden bg-gray-50">
                    <iframe
                      src={`/api/documents/preview-docx?url=${encodeURIComponent(templateForm.source_docx_url)}`}
                      className="w-full h-full"
                      title="Aperçu PDF du .docx"
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    Pour modifier ce document : éditez-le dans Word puis ré-importez la nouvelle version.
                  </p>
                </div>
              ) : (
                /* Mode "Éditable" : éditeur Tiptap + preview HTML live */
                <div className="flex flex-1 gap-4 px-1 pb-2 overflow-hidden min-h-0" style={{ minHeight: "400px" }}>
                  {/* Gauche — Éditeur */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <p className="text-xs font-medium text-gray-500 mb-2">Éditeur</p>
                    <div className="flex-1 overflow-y-auto border rounded-lg">
                      <RichTextEditor
                        content={templateForm.content}
                        onChange={(html) => setTemplateForm((p) => ({ ...p, content: html }))}
                        variables={AVAILABLE_VARIABLES}
                        placeholder="Saisissez le contenu du document..."
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {templateForm.content.match(/\{\{[^}]+\}\}/g)?.length || 0} variable{(templateForm.content.match(/\{\{[^}]+\}\}/g)?.length || 0) !== 1 ? "s" : ""} détectée{(templateForm.content.match(/\{\{[^}]+\}\}/g)?.length || 0) !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {/* Droite — Preview live */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-500">Aperçu</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExportTemplateAsPDF()}
                        className="h-6 text-xs gap-1"
                      >
                        <Download className="h-3 w-3" /> Exporter PDF
                      </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto border rounded-lg bg-white p-4">
                      <div
                        className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeHtml(getTemplatePreview(templateForm.content)),
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter className="px-1 pb-2">
                <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Annuler</Button>
                <Button onClick={handleSaveTemplate} disabled={saving}>
                  {saving ? "Enregistrement..." : editingTemplate ? "Mettre à jour" : "Créer le modèle"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Template Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Aperçu — {previewTemplate?.name}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const tplExt = previewTemplate as (DocumentTemplate & { mode?: "editable" | "docx_fidelity"; source_docx_url?: string | null }) | null;
            const isWordMode = tplExt?.mode === "docx_fidelity" && !!tplExt?.source_docx_url;
            return isWordMode ? (
              <div className="flex flex-col flex-1 min-h-0 gap-2 py-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200">📄 Mode Fidélité Word</Badge>
                  <p className="text-xs text-gray-500">PDF généré par CloudConvert (LibreOffice)</p>
                </div>
                <div className="flex-1 border rounded-lg overflow-hidden bg-gray-50">
                  <iframe
                    src={`/api/documents/preview-docx?url=${encodeURIComponent(tplExt!.source_docx_url!)}`}
                    className="w-full h-full"
                    title="Aperçu PDF"
                  />
                </div>
              </div>
            ) : (
              <div className="py-2 flex-1 overflow-y-auto">
                <div
                  className="p-6 border rounded-lg bg-white prose prose-sm max-w-none text-gray-700 leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(
                      getTemplatePreview(previewTemplate ? getTemplateContent(previewTemplate) : "") || "<p>Aucun contenu</p>"
                    ),
                  }}
                />
              </div>
            );
          })()}
          <DialogFooter>
            {(() => {
              const tplExt = previewTemplate as (DocumentTemplate & { mode?: "editable" | "docx_fidelity"; source_docx_url?: string | null }) | null;
              const isWordMode = tplExt?.mode === "docx_fidelity" && !!tplExt?.source_docx_url;
              return isWordMode ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => window.open(tplExt!.source_docx_url!, "_blank")}
                >
                  <Download className="h-4 w-4" />
                  Télécharger le .docx
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    if (previewTemplate?.content) {
                      navigator.clipboard.writeText(previewTemplate.content);
                      toast({ title: "Contenu copié" });
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copier
                </Button>
              );
            })()}
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Document Dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Générer un document
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="g_template">Modèle <span className="text-red-500">*</span></Label>
              <Select
                value={generateForm.template_id}
                onValueChange={(v) => {
                  const updated = { ...generateForm, template_id: v };
                  setGenerateForm(updated);
                  updatePreview(updated);
                }}
              >
                <SelectTrigger id="g_template">
                  <SelectValue placeholder="Sélectionner un modèle..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <Badge className={cn("text-xs font-normal", TYPE_COLORS[t.type as DocumentType])}>
                          {TYPE_LABELS[t.type as DocumentType]}
                        </Badge>
                        {t.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="g_name">Nom du document <span className="text-red-500">*</span></Label>
              <Input
                id="g_name"
                value={generateForm.name}
                onChange={(e) => setGenerateForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Contrat — Société ABC — Janvier 2026"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="g_session">Session (optionnel)</Label>
                <Select
                  value={generateForm.session_id || "none"}
                  onValueChange={(v) => {
                    const updated = { ...generateForm, session_id: v === "none" ? "" : v };
                    setGenerateForm(updated);
                    updatePreview(updated);
                  }}
                >
                  <SelectTrigger id="g_session">
                    <SelectValue placeholder="Aucune session" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune session</SelectItem>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {truncate(s.title, 30)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g_client">Client (optionnel)</Label>
                <Select
                  value={generateForm.client_id || "none"}
                  onValueChange={(v) => {
                    const updated = { ...generateForm, client_id: v === "none" ? "" : v };
                    setGenerateForm(updated);
                    updatePreview(updated);
                  }}
                >
                  <SelectTrigger id="g_client">
                    <SelectValue placeholder="Aucun client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun client</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {truncate(c.company_name, 30)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g_learner">Apprenant (optionnel)</Label>
                <Select
                  value={generateForm.learner_id || "none"}
                  onValueChange={(v) => {
                    const updated = { ...generateForm, learner_id: v === "none" ? "" : v };
                    setGenerateForm(updated);
                    updatePreview(updated);
                  }}
                >
                  <SelectTrigger id="g_learner">
                    <SelectValue placeholder="Aucun apprenant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun apprenant</SelectItem>
                    {learners.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.first_name} {l.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Signature availability indicator */}
            {generateForm.session_id && (
              <div className="flex items-center gap-4 text-xs p-3 rounded-lg bg-gray-50 border">
                <span className="font-medium text-gray-600">Signatures :</span>
                <span className={cn("flex items-center gap-1", sigAvailability.learner ? "text-green-600" : "text-gray-400")}>
                  {sigAvailability.learner ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  Apprenant {sigAvailability.learner ? "disponible" : "manquante"}
                </span>
                <span className={cn("flex items-center gap-1", sigAvailability.trainer ? "text-green-600" : "text-gray-400")}>
                  {sigAvailability.trainer ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  Formateur {sigAvailability.trainer ? "disponible" : "manquante"}
                </span>
              </div>
            )}

            {/* Preview */}
            {showPreview && previewContent && (
              <div className="space-y-1.5">
                <Label>Aperçu du document généré</Label>
                <div
                  className="p-4 border rounded-lg bg-gray-50 prose prose-sm max-w-none text-gray-700 leading-relaxed max-h-52 overflow-y-auto"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(previewContent),
                  }}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? "Génération..." : "Générer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Template Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer le modèle</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Supprimer <strong>&quot;{templateToDelete?.name}&quot;</strong> ? Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDeleteTemplate} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
