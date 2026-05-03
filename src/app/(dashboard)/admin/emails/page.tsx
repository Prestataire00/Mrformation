"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import DOMPurify from "dompurify";
import { createClient } from "@/lib/supabase/client";
import { InsertVariableButton } from "@/components/editor/InsertVariableButton";
import { RelancesTab } from "@/components/emails/RelancesTab";
import { useEntity } from "@/contexts/EntityContext";
import { EmailTemplate, EmailHistory, Session, Client, Learner } from "@/lib/types";
import { cn, formatDateTime, truncate } from "@/lib/utils";
import { resolveVariables, findUnresolvedVariables } from "@/lib/utils/resolve-variables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
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
  Mail,
  Send,
  Eye,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  AlertTriangle,
  User,
} from "lucide-react";

type EmailStatus = "sent" | "failed" | "pending";

const EMAIL_TYPE_LABELS: Record<string, string> = {
  convocation: "Convocation",
  confirmation: "Confirmation",
  relance: "Relance",
  attestation: "Attestation",
  devis: "Devis",
  prospect: "Prospect",
  convention: "Convention",
  certificat: "Certificat",
  administratif: "Administratif",
  autre: "Autre",
  reminder_invoice_first: "Relance facture 1",
  reminder_invoice_second: "Relance facture 2",
  reminder_invoice_final: "Mise en demeure",
  reminder_quote_first: "Suivi devis",
  reminder_quote_second: "Relance devis",
  reminder_quote_final: "Dernière relance devis",
  reminder_opco: "Rappel OPCO",
};

const EMAIL_TYPE_COLORS: Record<string, string> = {
  convocation: "bg-blue-100 text-blue-700",
  confirmation: "bg-green-100 text-green-700",
  relance: "bg-orange-100 text-orange-700",
  attestation: "bg-purple-100 text-purple-700",
  devis: "bg-indigo-100 text-indigo-700",
  prospect: "bg-teal-100 text-teal-700",
  convention: "bg-amber-100 text-amber-700",
  certificat: "bg-pink-100 text-pink-700",
  administratif: "bg-slate-100 text-slate-700",
  autre: "bg-gray-100 text-gray-600",
};

const TEMPLATE_CATEGORIES = [
  { key: "all", label: "Tous" },
  { key: "formation", label: "Formation", types: ["convocation", "confirmation", "attestation"] },
  { key: "commercial", label: "Commercial", types: ["relance", "devis", "prospect"] },
  { key: "documents", label: "Documents", types: ["convention", "certificat", "administratif"] },
  { key: "autre", label: "Autre", types: ["autre"] },
] as const;

const STATUS_BADGE: Record<EmailStatus, { label: string; className: string; icon: React.ReactNode }> = {
  sent: {
    label: "Envoyé",
    className: "bg-green-100 text-green-700",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  failed: {
    label: "Échoué",
    className: "bg-red-100 text-red-700",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  pending: {
    label: "En attente",
    className: "bg-yellow-100 text-yellow-700",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
};

const AVAILABLE_VARIABLES = [
  { key: "{{nom_apprenant}}", label: "Nom complet de l'apprenant" },
  { key: "{{prenom_apprenant}}", label: "Prénom de l'apprenant" },
  { key: "{{nom_client}}", label: "Nom de l'entreprise" },
  { key: "{{titre_formation}}", label: "Titre de la formation" },
  { key: "{{date_formation}}", label: "Date de la formation" },
  { key: "{{date_debut}}", label: "Date de début" },
  { key: "{{date_fin}}", label: "Date de fin" },
  { key: "{{lieu}}", label: "Lieu de la formation" },
  { key: "{{duree_heures}}", label: "Durée en heures" },
  { key: "{{nom_formateur}}", label: "Nom du formateur" },
  { key: "{{email_apprenant}}", label: "Email de l'apprenant" },
  { key: "{{telephone_apprenant}}", label: "Téléphone de l'apprenant" },
  { key: "{{date_today}}", label: "Date du jour" },
  { key: "{{lien_connexion}}", label: "Lien de connexion" },
  { key: "{{date_limite}}", label: "Date limite de réponse" },
];

const PREVIEW_VARS: Record<string, string> = {
  "{{nom_apprenant}}": "DUPONT Jean",
  "{{prenom_apprenant}}": "Jean",
  "{{nom_client}}": "Entreprise ABC",
  "{{titre_formation}}": "Formation IA Générative",
  "{{date_formation}}": "15/04/2026",
  "{{date_debut}}": "15/04/2026",
  "{{date_fin}}": "16/04/2026",
  "{{lieu}}": "Paris 8ème",
  "{{duree_heures}}": "14",
  "{{nom_formateur}}": "Marie MARTIN",
  "{{email_apprenant}}": "jean.dupont@exemple.fr",
  "{{telephone_apprenant}}": "06 12 34 56 78",
  "{{date_today}}": new Date().toLocaleDateString("fr-FR"),
  "{{lien_connexion}}": "https://formation.exemple.fr/login",
  "{{date_limite}}": "10/04/2026",
};

function getPreview(text: string): string {
  let result = text;
  Object.entries(PREVIEW_VARS).forEach(([key, val]) => {
    result = result.replaceAll(key, val);
  });
  return result;
}

interface TemplateFormData {
  name: string;
  type: string;
  subject: string;
  body: string;
  attachment_doc_types: string[];
}

const ATTACHMENT_OPTIONS = [
  { value: "convocation", label: "Convocation" },
  { value: "convention_entreprise", label: "Convention entreprise" },
  { value: "programme_formation", label: "Programme de formation" },
  { value: "certificat_realisation", label: "Certificat de réalisation" },
  { value: "attestation_assiduite", label: "Attestation d'assiduité" },
  { value: "feuille_emargement", label: "Feuille d'émargement" },
  { value: "cgv", label: "CGV" },
  { value: "reglement_interieur", label: "Règlement intérieur" },
];

interface SendFormData {
  recipient_email: string;
  subject: string;
  body: string;
  template_id: string;
}

const emptyTemplateForm: TemplateFormData = {
  name: "",
  type: "convocation",
  subject: "",
  body: "",
  attachment_doc_types: [],
};

type EmailHistoryWithTemplate = EmailHistory & {
  template: { name: string; type: string } | null;
  sender: { first_name: string | null; last_name: string | null } | null;
};

export default function EmailsPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();

  // Templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateSearch, setTemplateSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // History state
  const [history, setHistory] = useState<EmailHistoryWithTemplate[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Template dialog
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormData>(emptyTemplateForm);
  const [saving, setSaving] = useState(false);

  // Templates Word custom de l'entité (mode docx_fidelity), pour cocher comme attachments auto
  const [wordTemplates, setWordTemplates] = useState<Array<{ id: string; name: string }>>([]);

  // Lien email_template ↔ formation_automation_rules : combien de rules utilisent chaque template
  type AutomationRuleInfo = { id: string; name: string | null; trigger_type: string; days_offset: number; is_enabled: boolean };
  const [rulesByTemplate, setRulesByTemplate] = useState<Record<string, AutomationRuleInfo[]>>({});

  // Si on ouvre la modale d'édition avec scroll initial sur la section attachments
  const [openOnAttachments, setOpenOnAttachments] = useState(false);

  // Tab actif (controlled pour permettre la navigation depuis les cards d'action)
  const [activeTab, setActiveTab] = useState<"templates" | "history" | "relances">("templates");
  const [activeField, setActiveField] = useState<"subject" | "body">("body");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Preview dialog
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  // Send dialog
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendForm, setSendForm] = useState<SendFormData>({ recipient_email: "", subject: "", body: "", template_id: "" });
  const [sending, setSending] = useState(false);
  const [sendAttachments, setSendAttachments] = useState<Array<{ filename: string; content: string; type: string }>>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [originalSubject, setOriginalSubject] = useState("");
  const [originalBody, setOriginalBody] = useState("");

  // Send dialog — context selectors
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedLearnerId, setSelectedLearnerId] = useState<string>("");

  // Delete template
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Resend
  const [resending, setResending] = useState<string | null>(null);

  // History detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<EmailHistoryWithTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    let query = supabase
      .from("email_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (entityId) query = query.eq("entity_id", entityId);
    const { data, error } = await query;
    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les modèles d'emails.", variant: "destructive" });
    } else {
      setTemplates((data as EmailTemplate[]) || []);
    }
    setTemplatesLoading(false);
  }, [entityId]);

  // Charge les templates Word custom (mode docx_fidelity) pour la sélection des attachments auto
  const fetchWordTemplates = useCallback(async () => {
    if (!entityId) return;
    const { data } = await supabase
      .from("document_templates")
      .select("id, name")
      .eq("entity_id", entityId)
      .eq("mode", "docx_fidelity")
      .order("name");
    setWordTemplates((data ?? []) as Array<{ id: string; name: string }>);
  }, [entityId]);

  // Charge les rules d'automation et regroupe par template_id pour afficher le badge "Utilisé par X automations"
  const fetchAutomationRules = useCallback(async () => {
    if (!entityId) return;
    const { data } = await supabase
      .from("formation_automation_rules")
      .select("id, name, trigger_type, days_offset, is_enabled, template_id")
      .eq("entity_id", entityId)
      .not("template_id", "is", null);
    const map: Record<string, AutomationRuleInfo[]> = {};
    for (const r of data ?? []) {
      const tplId = (r as Record<string, string>).template_id;
      if (!tplId) continue;
      if (!map[tplId]) map[tplId] = [];
      map[tplId].push({
        id: r.id as string,
        name: (r.name as string | null) ?? null,
        trigger_type: r.trigger_type as string,
        days_offset: (r.days_offset as number) ?? 0,
        is_enabled: (r.is_enabled as boolean) ?? true,
      });
    }
    setRulesByTemplate(map);
  }, [entityId]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    let query = supabase
      .from("email_history")
      .select("*, template:email_templates(name, type), sender:profiles!sent_by(first_name, last_name)")
      .order("sent_at", { ascending: false });
    if (entityId) query = query.eq("entity_id", entityId);
    const { data, error } = await query;
    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger l'historique.", variant: "destructive" });
    } else {
      setHistory((data as EmailHistoryWithTemplate[]) || []);
    }
    setHistoryLoading(false);
  }, [entityId]);

  // Fetch context data for send dialog selectors
  const fetchSendContext = useCallback(async () => {
    if (!entityId) return;
    const [sessRes, cliRes, leaRes] = await Promise.all([
      supabase.from("sessions").select("*, trainer:trainers(*)").eq("entity_id", entityId).order("start_date", { ascending: false }).limit(100),
      supabase.from("clients").select("*").eq("entity_id", entityId).order("company_name").limit(200),
      supabase.from("learners").select("*").eq("entity_id", entityId).order("last_name").limit(500),
    ]);
    if (sessRes.data) setSessions(sessRes.data as unknown as Session[]);
    if (cliRes.data) setClients(cliRes.data as unknown as Client[]);
    if (leaRes.data) setLearners(leaRes.data as unknown as Learner[]);
  }, [entityId]);

  useEffect(() => {
    fetchTemplates();
    fetchHistory();
    fetchWordTemplates();
    fetchAutomationRules();
  }, [fetchTemplates, fetchHistory, fetchWordTemplates, fetchAutomationRules]);

  // Re-resolve variables when context selection changes
  useEffect(() => {
    if (!sendDialogOpen || (!originalSubject && !originalBody)) return;

    const session = sessions.find((s) => s.id === selectedSessionId) || null;
    const client = clients.find((c) => c.id === selectedClientId) || null;
    const learner = learners.find((l) => l.id === selectedLearnerId) || null;

    if (!session && !client && !learner) {
      // Reset to original template text when no context selected
      setSendForm((prev) => ({
        ...prev,
        subject: originalSubject,
        body: originalBody,
      }));
      return;
    }

    const resolvedSubject = resolveVariables(originalSubject, { session, client, learner });
    const resolvedBody = resolveVariables(originalBody, { session, client, learner });
    setSendForm((prev) => ({
      ...prev,
      subject: resolvedSubject,
      body: resolvedBody,
    }));
  }, [selectedSessionId, selectedClientId, selectedLearnerId, sendDialogOpen, originalSubject, originalBody, sessions, clients, learners]);

  const filteredTemplates = templates.filter((t) => {
    const matchSearch =
      templateSearch === "" ||
      t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      t.subject.toLowerCase().includes(templateSearch.toLowerCase());
    // Category-based filtering
    const category = TEMPLATE_CATEGORIES.find((c) => c.key === typeFilter);
    const matchType = typeFilter === "all" || (category && "types" in category && (category.types as readonly string[]).includes(t.type || "autre"));
    return matchSearch && matchType;
  });

  const filteredHistory = history.filter((h) => {
    const matchSearch =
      historySearch === "" ||
      h.recipient_email.toLowerCase().includes(historySearch.toLowerCase()) ||
      h.subject.toLowerCase().includes(historySearch.toLowerCase()) ||
      h.template?.name.toLowerCase().includes(historySearch.toLowerCase());
    const matchStatus = statusFilter === "all" || h.status === statusFilter;
    const matchFrom = !dateFrom || new Date(h.sent_at) >= new Date(dateFrom);
    const matchTo = !dateTo || new Date(h.sent_at) <= new Date(dateTo + "T23:59:59");
    return matchSearch && matchStatus && matchFrom && matchTo;
  });

  // Learners filtered by selected client
  const filteredLearners = selectedClientId
    ? learners.filter((l) => l.client_id === selectedClientId)
    : learners;

  // Template CRUD
  const openAddTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm(emptyTemplateForm);
    setActiveField("body");
    setTemplateDialogOpen(true);
  };

  const openEditTemplate = (t: EmailTemplate) => {
    setEditingTemplate(t);
    setTemplateForm({
      name: t.name,
      type: (t.type || "autre") as string,
      subject: t.subject,
      body: t.body,
      attachment_doc_types: (t as unknown as Record<string, unknown>).attachment_doc_types as string[] || [],
    });
    setActiveField("body");
    setTemplateDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) { toast({ title: "Nom requis", variant: "destructive" }); return; }
    if (!templateForm.subject.trim()) { toast({ title: "Objet requis", variant: "destructive" }); return; }
    if (!templateForm.body.trim()) { toast({ title: "Corps requis", variant: "destructive" }); return; }
    setSaving(true);

    const allVars = [
      ...(templateForm.subject.match(/\{\{[^}]+\}\}/g) || []),
      ...(templateForm.body.match(/\{\{[^}]+\}\}/g) || []),
    ];
    const uniqueVars = [...new Set(allVars)];

    const payload = {
      name: templateForm.name.trim(),
      type: templateForm.type,
      subject: templateForm.subject.trim(),
      body: templateForm.body.trim(),
      variables: uniqueVars,
      attachment_doc_types: templateForm.attachment_doc_types,
    };

    if (editingTemplate) {
      const { error } = await supabase.from("email_templates").update(payload).eq("id", editingTemplate.id);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); setSaving(false); return; }
      toast({ title: "Modèle mis à jour" });
    } else {
      const { error } = await supabase.from("email_templates").insert({ ...payload, entity_id: entityId });
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); setSaving(false); return; }
      toast({ title: "Modèle créé" });
    }
    setSaving(false);
    setTemplateDialogOpen(false);
    await fetchTemplates();
  };

  const insertVariable = (variable: string) => {
    const el = activeField === "subject" ? subjectRef.current : bodyRef.current;
    const currentValue = activeField === "subject" ? templateForm.subject : templateForm.body;

    if (el) {
      const start = el.selectionStart ?? currentValue.length;
      const end = el.selectionEnd ?? currentValue.length;
      const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end);

      if (activeField === "subject") {
        setTemplateForm((f) => ({ ...f, subject: newValue }));
      } else {
        setTemplateForm((f) => ({ ...f, body: newValue }));
      }

      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    } else {
      if (activeField === "subject") {
        setTemplateForm((prev) => ({ ...prev, subject: prev.subject + variable }));
      } else {
        setTemplateForm((prev) => ({ ...prev, body: prev.body + variable }));
      }
    }
  };

  const openDeleteTemplate = (t: EmailTemplate) => {
    setTemplateToDelete(t);
    setDeleteDialogOpen(true);
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("email_templates").delete().eq("id", templateToDelete.id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); }
    else {
      toast({ title: "Modèle supprimé" });
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      await fetchTemplates();
    }
    setDeleting(false);
  };

  // Send email
  const openSendFromTemplate = (t: EmailTemplate) => {
    setOriginalSubject(t.subject);
    setOriginalBody(t.body);
    setSelectedSessionId("");
    setSelectedClientId("");
    setSelectedLearnerId("");
    setSendForm({
      recipient_email: "",
      subject: t.subject,
      body: t.body,
      template_id: t.id,
    });
    setSendDialogOpen(true);
    fetchSendContext();
  };

  const handleSendEmail = async () => {
    if (!sendForm.recipient_email.trim()) { toast({ title: "Email destinataire requis", variant: "destructive" }); return; }
    if (!sendForm.subject.trim()) { toast({ title: "Objet requis", variant: "destructive" }); return; }

    // Warn about unresolved variables
    const unresolved = findUnresolvedVariables(sendForm.subject + " " + sendForm.body);
    if (unresolved.length > 0) {
      const proceed = window.confirm(
        `⚠️ ${unresolved.length} variable(s) non résolue(s) :\n${unresolved.join(", ")}\n\nLes variables apparaîtront en l'état dans l'email.\n\nEnvoyer quand même ?`
      );
      if (!proceed) return;
    }

    setSending(true);

    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: sendForm.recipient_email.trim(),
          subject: sendForm.subject.trim(),
          body: sendForm.body.trim(),
          template_id: sendForm.template_id || undefined,
          attachments: sendAttachments.length > 0 ? sendAttachments : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Erreur lors de l'envoi",
          description: data.error ?? "Une erreur est survenue.",
          variant: "destructive",
        });
      } else if (data.simulated) {
        toast({
          title: "Email journalisé (non envoyé)",
          description: "Configurez RESEND_API_KEY pour activer l'envoi réel.",
          variant: "default",
        });
        setSendDialogOpen(false);
        await fetchHistory();
      } else {
        toast({ title: "Email envoyé", description: `Envoyé à ${sendForm.recipient_email}` });
        setSendDialogOpen(false);
        await fetchHistory();
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Impossible de contacter l'API d'envoi.", variant: "destructive" });
    }

    setSending(false);
  };

  const handleResend = async (item: EmailHistoryWithTemplate) => {
    setResending(item.id);

    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: item.recipient_email,
          subject: item.subject,
          body: item.body ?? "",
          template_id: item.template_id ?? undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ title: "Erreur lors du renvoi", description: data.error ?? "Une erreur est survenue.", variant: "destructive" });
      } else if (data.simulated) {
        toast({
          title: "Email journalisé (non renvoyé)",
          description: "Configurez RESEND_API_KEY pour activer l'envoi réel.",
          variant: "default",
        });
        await fetchHistory();
      } else {
        toast({ title: "Email renvoyé", description: `Renvoyé à ${item.recipient_email}` });
        await fetchHistory();
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Impossible de contacter l'API d'envoi.", variant: "destructive" });
    }

    setResending(null);
  };

  const sentCount = history.filter((h) => h.status === "sent").length;
  const failedCount = history.filter((h) => h.status === "failed").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emails</h1>
          <p className="text-sm text-gray-500 mt-1">
            {templates.length} modèle{templates.length !== 1 ? "s" : ""} —{" "}
            {history.length} envoi{history.length !== 1 ? "s" : ""}{" "}
            ({sentCount} réussi{sentCount !== 1 ? "s" : ""}{failedCount > 0 ? `, ${failedCount} échoué${failedCount !== 1 ? "s" : ""}` : ""})
          </p>
        </div>
        <Button onClick={openAddTemplate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nouveau modèle
        </Button>
      </div>

      {/* Actions rapides — point d'entrée principal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={openAddTemplate}
          className="group text-left p-5 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 hover:border-blue-400 hover:bg-blue-50 transition-all flex items-start gap-4"
        >
          <div className="shrink-0 p-3 rounded-lg bg-blue-100 group-hover:bg-blue-200 transition-colors">
            <Plus className="h-5 w-5 text-blue-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Créer un modèle d&apos;email</h3>
            <p className="text-sm text-gray-500 mt-1">Sujet, corps, variables, pièces jointes auto</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setSendForm({ recipient_email: "", subject: "", body: "", template_id: "" });
            setOriginalSubject("");
            setOriginalBody("");
            setSelectedSessionId("");
            setSelectedClientId("");
            setSelectedLearnerId("");
            setSendDialogOpen(true);
            fetchSendContext();
          }}
          className="group text-left p-5 rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 hover:bg-emerald-50 transition-all flex items-start gap-4"
        >
          <div className="shrink-0 p-3 rounded-lg bg-emerald-100 group-hover:bg-emerald-200 transition-colors">
            <Send className="h-5 w-5 text-emerald-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Envoyer un email maintenant</h3>
            <p className="text-sm text-gray-500 mt-1">Choix destinataire + modèle ou rédaction libre</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className="group text-left p-5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-50 transition-all flex items-start gap-4"
        >
          <div className="shrink-0 p-3 rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors relative">
            <Mail className="h-5 w-5 text-gray-700" />
            {failedCount > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-4 w-4 text-[10px] rounded-full bg-red-500 text-white font-semibold">
                {failedCount}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Voir l&apos;historique des envois</h3>
            <p className="text-sm text-gray-500 mt-1">
              Suivi des emails envoyés{failedCount > 0 ? `, ${failedCount} échec${failedCount > 1 ? "s" : ""} à vérifier` : ""}
            </p>
          </div>
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">Modèles d&apos;emails</TabsTrigger>
          <TabsTrigger value="history">
            Historique d&apos;envois
            {failedCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center h-4 w-4 text-xs rounded-full bg-red-500 text-white">
                {failedCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="relances">Relances automatiques</TabsTrigger>
        </TabsList>

        {/* TEMPLATES TAB */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Rechercher un modèle..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {TEMPLATE_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setTypeFilter(cat.key)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${typeFilter === cat.key ? "border-[#374151] bg-[#374151]/10 text-[#374151] font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {templatesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Mail className="h-12 w-12 text-gray-300 mb-3" />
              <p className="font-medium text-gray-600">Aucun modèle d&apos;email</p>
              <p className="text-sm text-gray-400 mt-1">Créez votre premier modèle.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTemplates.map((template) => {
                const tplExt = template as EmailTemplate & { attachment_doc_types?: string[] | null };
                const attachmentsCount = (tplExt.attachment_doc_types ?? []).length;
                const automationRules = rulesByTemplate[template.id] ?? [];
                const enabledAutomations = automationRules.filter((r) => r.is_enabled).length;
                return (
                <div
                  key={template.id}
                  className="group border rounded-xl bg-white p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={cn("p-2 rounded-lg shrink-0 mt-0.5", EMAIL_TYPE_COLORS[(template.type || "autre") as string])}>
                        <Mail className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900">{truncate(template.name, 50)}</p>
                          <Badge className={cn("text-xs font-normal", EMAIL_TYPE_COLORS[(template.type || "autre") as string])}>
                            {EMAIL_TYPE_LABELS[(template.type || "autre") as string]}
                          </Badge>
                          {attachmentsCount > 0 && (
                            <Badge className="text-xs font-normal bg-purple-100 text-purple-700 border-purple-200" title="Pièces jointes auto">
                              📎 {attachmentsCount} PJ
                            </Badge>
                          )}
                          {automationRules.length > 0 && (
                            <Badge
                              className={cn(
                                "text-xs font-normal cursor-help",
                                enabledAutomations > 0
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                  : "bg-gray-100 text-gray-600 border-gray-200"
                              )}
                              title={`Utilisé par ${automationRules.length} automation${automationRules.length > 1 ? "s" : ""} (${enabledAutomations} activée${enabledAutomations > 1 ? "s" : ""})`}
                            >
                              🤖 {enabledAutomations}/{automationRules.length} auto
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5 font-medium">
                          Objet: <span className="font-normal text-gray-500">{truncate(template.subject, 80)}</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          {truncate(template.body, 120)}
                        </p>
                        {template.variables && template.variables.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {template.variables.slice(0, 6).map((v) => (
                              <span key={v} className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                {v}
                              </span>
                            ))}
                            {template.variables.length > 6 && (
                              <span className="text-xs text-gray-400">+{template.variables.length - 6}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs h-8"
                        onClick={() => { setOpenOnAttachments(true); openEditTemplate(template); }}
                        title="Gérer les pièces jointes auto"
                      >
                        📎 Pièces jointes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => openSendFromTemplate(template)}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Utiliser
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => { setPreviewTemplate(template); setPreviewDialogOpen(true); }}
                            className="gap-2"
                          >
                            <Eye className="h-4 w-4" />
                            Aperçu
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditTemplate(template)} className="gap-2">
                            <Pencil className="h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openSendFromTemplate(template)} className="gap-2">
                            <Send className="h-4 w-4" />
                            Utiliser ce modèle
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => openDeleteTemplate(template)}
                            className="gap-2 text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Rechercher par destinataire, objet..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="sent">Envoyés</SelectItem>
                <SelectItem value="failed">Échoués</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400 shrink-0" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-36"
                placeholder="Du"
              />
              <span className="text-gray-400 text-sm">—</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-36"
                placeholder="Au"
              />
              {(dateFrom || dateTo || statusFilter !== "all" || historySearch) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => { setDateFrom(""); setDateTo(""); setStatusFilter("all"); setHistorySearch(""); }}
                >
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>

          {/* Stats summary */}
          <div className="grid grid-cols-3 gap-3">
            {(["sent", "failed", "pending"] as EmailStatus[]).map((status) => {
              const count = history.filter((h) => h.status === status).length;
              const s = STATUS_BADGE[status];
              return (
                <div key={status} className={cn("flex items-center gap-3 p-3 rounded-xl border", s.className.replace("text-", "border-").split(" ")[0] + " bg-white border")}>
                  <div className={cn("p-2 rounded-lg", s.className)}>
                    {s.icon}
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{count}</p>
                    <p className="text-xs text-gray-500">{s.label}{count !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* History table */}
          <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[160px]">Destinataire</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[200px]">Objet</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Modèle</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[140px]">Date d&apos;envoi</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historyLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                        <Mail className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                        <p className="font-medium">Aucun email trouvé</p>
                        <p className="text-xs mt-1">Modifiez vos filtres ou envoyez un premier email.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((item) => {
                      const statusInfo = STATUS_BADGE[item.status as EmailStatus] || STATUS_BADGE.pending;
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-gray-900 font-medium text-xs">{item.recipient_email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-gray-700 text-xs">{truncate(item.subject, 50)}</p>
                          </td>
                          <td className="px-4 py-3">
                            {item.template ? (
                              <div className="flex items-center gap-1.5">
                                <Badge className={cn("text-xs font-normal", EMAIL_TYPE_COLORS[(item.template.type || "autre") as string])}>
                                  {EMAIL_TYPE_LABELS[(item.template.type || "autre") as string]}
                                </Badge>
                                <span className="text-xs text-gray-500">{truncate(item.template.name, 20)}</span>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">Personnalisé</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={cn("text-xs font-normal inline-flex items-center gap-1", statusInfo.className)}>
                              {statusInfo.icon}
                              {statusInfo.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {formatDateTime(item.sent_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                onClick={() => { setDetailItem(item); setDetailDialogOpen(true); }}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Détails
                              </Button>
                              {item.status === "failed" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                  onClick={() => handleResend(item)}
                                  disabled={resending === item.id}
                                >
                                  <RefreshCw className={cn("h-3.5 w-3.5", resending === item.id && "animate-spin")} />
                                  {resending === item.id ? "Envoi..." : "Renvoyer"}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {!historyLoading && filteredHistory.length > 0 && (
              <div className="px-4 py-3 border-t bg-gray-50 text-xs text-gray-500">
                {filteredHistory.length} email{filteredHistory.length !== 1 ? "s" : ""} affiché{filteredHistory.length !== 1 ? "s" : ""}
                {history.length !== filteredHistory.length ? ` sur ${history.length}` : ""}
              </div>
            )}
          </div>
        </TabsContent>

        {/* RELANCES TAB */}
        <TabsContent value="relances" className="space-y-4">
          <RelancesTab />
        </TabsContent>
      </Tabs>

      {/* Template Add/Edit Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Modifier le modèle d'email" : "Nouveau modèle d'email"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="et_name">Nom <span className="text-red-500">*</span></Label>
                <Input
                  id="et_name"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Convocation standard"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="et_type">Type</Label>
                <Select
                  value={templateForm.type}
                  onValueChange={(v) => setTemplateForm((p) => ({ ...p, type: v as string }))}
                >
                  <SelectTrigger id="et_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="convocation">Convocation</SelectItem>
                    <SelectItem value="confirmation">Confirmation</SelectItem>
                    <SelectItem value="attestation">Attestation</SelectItem>
                    <SelectItem value="relance">Relance</SelectItem>
                    <SelectItem value="devis">Devis</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="convention">Convention</SelectItem>
                    <SelectItem value="certificat">Certificat</SelectItem>
                    <SelectItem value="administratif">Administratif</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Left: Form */}
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  {/* Variables panel */}
                  <div className="space-y-2 col-span-1">
                    <Label>Variables disponibles</Label>
                    <InsertVariableButton
                      context="email"
                      onInsert={(placeholder) => insertVariable(placeholder)}
                    />
                    <p className="text-xs text-gray-400">
                      Champ actif:{" "}
                      <span className="font-medium text-gray-600">
                        {activeField === "subject" ? "Objet" : "Corps"}
                      </span>
                    </p>
                  </div>

                  {/* Subject + Body */}
                  <div className="col-span-2 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="et_subject">
                        Objet <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="et_subject"
                        ref={subjectRef}
                        value={templateForm.subject}
                        onChange={(e) => setTemplateForm((p) => ({ ...p, subject: e.target.value }))}
                        onFocus={() => setActiveField("subject")}
                        placeholder="Ex: Convocation — {{titre_formation}} du {{date_formation}}"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="et_body">
                        Corps de l&apos;email <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        id="et_body"
                        ref={bodyRef}
                        value={templateForm.body}
                        onChange={(e) => setTemplateForm((p) => ({ ...p, body: e.target.value }))}
                        onFocus={() => setActiveField("body")}
                        rows={12}
                        className="text-sm resize-none"
                        placeholder={`Bonjour {{prenom_apprenant}},\n\nNous avons le plaisir de vous convoquer à la formation {{titre_formation}}...\n\nCordialement,`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Automatisations qui utilisent ce template */}
              {editingTemplate && (rulesByTemplate[editingTemplate.id]?.length ?? 0) > 0 && (
                <div className="space-y-2 col-span-3 border rounded-lg p-3 bg-emerald-50 border-emerald-200">
                  <Label className="text-xs flex items-center gap-2">
                    <span className="text-base">🤖</span>
                    Automatisations qui utilisent ce template
                  </Label>
                  <div className="space-y-1.5">
                    {(rulesByTemplate[editingTemplate.id] ?? []).map((r) => {
                      const triggerLabel = r.trigger_type === "session_start_minus_days"
                        ? `${r.days_offset}j avant le début de la session`
                        : r.trigger_type === "session_end_plus_days"
                          ? `${r.days_offset}j après la fin de la session`
                          : r.trigger_type;
                      return (
                        <div key={r.id} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", r.is_enabled ? "bg-emerald-500" : "bg-gray-300")} />
                            <span className="font-medium truncate">{r.name ?? "(sans nom)"}</span>
                            <span className="text-gray-500 text-[10px] shrink-0">— {triggerLabel}</span>
                          </div>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded shrink-0", r.is_enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500")}>
                            {r.is_enabled ? "Activée" : "Désactivée"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-emerald-800">
                    Ces règles déclenchent l&apos;envoi automatique de cet email. Modifie-les depuis la fiche formation correspondante (onglet Automation).
                  </p>
                </div>
              )}

              {/* Pièces jointes automatiques */}
              <div className="space-y-3 col-span-3">
                <div>
                  <Label className="text-xs">Documents système (générés depuis les templates par défaut)</Label>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {ATTACHMENT_OPTIONS.map(opt => (
                      <label key={opt.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={templateForm.attachment_doc_types.includes(opt.value)}
                          onChange={(e) => {
                            setTemplateForm(f => ({
                              ...f,
                              attachment_doc_types: e.target.checked
                                ? [...f.attachment_doc_types, opt.value]
                                : f.attachment_doc_types.filter(v => v !== opt.value),
                            }));
                          }}
                          className="h-3.5 w-3.5 rounded border-gray-300"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Templates Word custom (mode docx_fidelity) */}
                {wordTemplates.length > 0 && (
                  <div className="border-t pt-3">
                    <Label className="text-xs flex items-center gap-2">
                      <span className="inline-block px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-semibold">📄 Fidélité Word</span>
                      Mes modèles Word personnalisés
                    </Label>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {wordTemplates.map((tpl) => (
                        <label key={tpl.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={templateForm.attachment_doc_types.includes(tpl.id)}
                            onChange={(e) => {
                              setTemplateForm(f => ({
                                ...f,
                                attachment_doc_types: e.target.checked
                                  ? [...f.attachment_doc_types, tpl.id]
                                  : f.attachment_doc_types.filter(v => v !== tpl.id),
                              }));
                            }}
                            className="h-3.5 w-3.5 rounded border-gray-300"
                          />
                          {tpl.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">
                  Ces documents seront générés et joints au PDF lors de l&apos;envoi automatique.
                  Les variables {"{{nom_apprenant}}"}, {"{{titre_formation}}"}, etc. sont substituées automatiquement.
                </p>
              </div>

              {/* Right: Preview */}
              <div className="space-y-2">
                <Label>Prévisualisation</Label>
                <div className="border rounded-lg bg-white p-4 min-h-[300px]">
                  <div className="text-xs text-muted-foreground mb-3 pb-2 border-b space-y-1">
                    <p>De: <span className="font-medium">MR Formation &lt;noreply@mrformation.fr&gt;</span></p>
                    <p>Objet: <span className="font-medium text-gray-800">{getPreview(templateForm.subject) || "—"}</span></p>
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {getPreview(templateForm.body) || <span className="italic text-gray-400">Le contenu apparaîtra ici...</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSaveTemplate} disabled={saving}>
              {saving ? "Enregistrement..." : editingTemplate ? "Mettre à jour" : "Créer le modèle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Aperçu — {previewTemplate?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-3 bg-gray-50 rounded-lg border">
              <p className="text-xs font-medium text-gray-500 mb-1">Objet</p>
              <p className="text-sm font-medium text-gray-800">{previewTemplate?.subject}</p>
            </div>
            <div className="p-4 bg-white rounded-lg border min-h-[200px]">
              <p className="text-xs font-medium text-gray-500 mb-3">Corps</p>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {previewTemplate?.body}
              </div>
            </div>
            {previewTemplate?.variables && previewTemplate.variables.length > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-xs font-medium text-blue-700 mb-2">
                  {previewTemplate.variables.length} variable{previewTemplate.variables.length !== 1 ? "s" : ""} à remplacer
                </p>
                <div className="flex flex-wrap gap-1">
                  {previewTemplate.variables.map((v) => (
                    <span key={v} className="text-xs font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                setPreviewDialogOpen(false);
                if (previewTemplate) {
                  openSendFromTemplate(previewTemplate);
                }
              }}
            >
              <Send className="h-4 w-4" />
              Utiliser ce modèle
            </Button>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Envoyer un email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Context selectors for variable resolution */}
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg space-y-3">
              <p className="text-xs font-medium text-blue-700">
                Contexte (optionnel) — sélectionnez pour résoudre automatiquement les variables
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-blue-600">Session</Label>
                  <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue placeholder="Aucune" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucune</SelectItem>
                      {sessions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {truncate(s.title, 35)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!selectedSessionId && findUnresolvedVariables(sendForm.subject + " " + sendForm.body).some(v =>
                    v.includes("titre_formation") || v.includes("date_") || v.includes("lieu") || v.includes("formateur")
                  ) && (
                    <p className="text-[10px] text-amber-600">↑ Requis pour résoudre les variables formation</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-blue-600">Client</Label>
                  <Select value={selectedClientId} onValueChange={(v) => {
                    setSelectedClientId(v);
                    setSelectedLearnerId("");
                  }}>
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {truncate(c.company_name, 35)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!selectedClientId && findUnresolvedVariables(sendForm.subject + " " + sendForm.body).some(v =>
                    v.includes("nom_client") || v.includes("entreprise") || v.includes("client")
                  ) && (
                    <p className="text-[10px] text-amber-600">{"↑ Requis pour résoudre {{nom_client}}"}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-blue-600">Apprenant</Label>
                  <Select value={selectedLearnerId} onValueChange={setSelectedLearnerId}>
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      {filteredLearners.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.first_name} {l.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!selectedLearnerId && findUnresolvedVariables(sendForm.subject + " " + sendForm.body).some(v =>
                    v.includes("apprenant") || v.includes("prenom")
                  ) && (
                    <p className="text-[10px] text-amber-600">{"↑ Requis pour résoudre {{nom_apprenant}}"}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s_email">
                Email du destinataire <span className="text-red-500">*</span>
              </Label>
              <Input
                id="s_email"
                type="email"
                value={sendForm.recipient_email}
                onChange={(e) => setSendForm((p) => ({ ...p, recipient_email: e.target.value }))}
                placeholder="destinataire@exemple.fr"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s_subject">Objet <span className="text-red-500">*</span></Label>
              <Input
                id="s_subject"
                value={sendForm.subject}
                onChange={(e) => setSendForm((p) => ({ ...p, subject: e.target.value }))}
                placeholder="Objet de l'email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s_body">Corps de l&apos;email</Label>
              <Textarea
                id="s_body"
                value={sendForm.body}
                onChange={(e) => setSendForm((p) => ({ ...p, body: e.target.value }))}
                rows={10}
                className="text-sm"
              />
            </div>

            {/* Unresolved variables warning */}
            {findUnresolvedVariables(sendForm.subject + " " + sendForm.body).length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-700">Variables non résolues — sélectionnez un contexte ci-dessus</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {findUnresolvedVariables(sendForm.subject + " " + sendForm.body).map((v) => (
                      <span key={v} className="text-xs font-mono bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                        {v}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-amber-600 mt-1">
                    L&apos;envoi est possible mais les variables apparaîtront telles quelles.
                  </p>
                </div>
              </div>
            )}
          </div>
          {/* Pièces jointes manuelles */}
          <div className="space-y-2 px-1">
            <Label className="text-xs">Pièces jointes</Label>
            {sendAttachments.map((att, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5 text-xs">
                <span>{att.filename}</span>
                <button onClick={() => setSendAttachments(prev => prev.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700">✕</button>
              </div>
            ))}
            <label className="cursor-pointer">
              <input type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const base64 = (reader.result as string).split(",")[1];
                  setSendAttachments(prev => [...prev, { filename: file.name, content: base64, type: file.type }]);
                };
                reader.readAsDataURL(file);
                e.target.value = "";
              }} />
              <span className="inline-flex items-center gap-1 text-xs text-[#374151] hover:underline cursor-pointer">+ Ajouter une pièce jointe</span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Annuler</Button>
            <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-2">
              <Eye className="h-4 w-4" /> Prévisualiser
            </Button>
            <Button onClick={handleSendEmail} disabled={sending} className="gap-2">
              <Send className="h-4 w-4" />
              {sending ? "Envoi en cours..." : "Envoyer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prévisualisation de l&apos;email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 border rounded-lg p-4 bg-white">
            <div className="flex items-center gap-2 text-sm text-muted-foreground border-b pb-2">
              <span className="font-medium">De :</span> <span>contact@mrformation.fr</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground border-b pb-2">
              <span className="font-medium">À :</span> <span>{sendForm.recipient_email || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm border-b pb-2">
              <span className="font-medium text-muted-foreground">Objet :</span> <span className="font-semibold">{sendForm.subject || "—"}</span>
            </div>
            <div
              className="prose prose-sm max-w-none pt-2"
              style={{ fontFamily: "sans-serif", lineHeight: 1.6 }}
            >
              {sendForm.body.split("\n").map((line, i) => (
                <p key={i} className="mb-2 text-sm">{line || "\u00A0"}</p>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Détail de l&apos;envoi
            </DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-3 py-2">
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-lg border">
                  <p className="text-xs font-medium text-gray-500 mb-1">Destinataire</p>
                  <p className="text-sm text-gray-800">{detailItem.recipient_email}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border">
                  <p className="text-xs font-medium text-gray-500 mb-1">Date d&apos;envoi</p>
                  <p className="text-sm text-gray-800">{formatDateTime(detailItem.sent_at)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-lg border">
                  <p className="text-xs font-medium text-gray-500 mb-1">Statut</p>
                  <Badge className={cn("text-xs font-normal inline-flex items-center gap-1", STATUS_BADGE[detailItem.status as EmailStatus]?.className)}>
                    {STATUS_BADGE[detailItem.status as EmailStatus]?.icon}
                    {STATUS_BADGE[detailItem.status as EmailStatus]?.label}
                  </Badge>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border">
                  <p className="text-xs font-medium text-gray-500 mb-1">Envoyé par</p>
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                    <p className="text-sm text-gray-800">
                      {detailItem.sender
                        ? `${detailItem.sender.first_name || ""} ${detailItem.sender.last_name || ""}`.trim() || "—"
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>

              {detailItem.template && (
                <div className="p-3 bg-gray-50 rounded-lg border">
                  <p className="text-xs font-medium text-gray-500 mb-1">Modèle utilisé</p>
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-xs font-normal", EMAIL_TYPE_COLORS[(detailItem.template.type || "autre") as string])}>
                      {EMAIL_TYPE_LABELS[(detailItem.template.type || "autre") as string]}
                    </Badge>
                    <span className="text-sm text-gray-800">{detailItem.template.name}</span>
                  </div>
                </div>
              )}

              {/* Subject */}
              <div className="p-3 bg-gray-50 rounded-lg border">
                <p className="text-xs font-medium text-gray-500 mb-1">Objet</p>
                <p className="text-sm font-medium text-gray-800">{detailItem.subject}</p>
              </div>

              {/* Body */}
              <div className="p-4 bg-white rounded-lg border min-h-[150px]">
                <p className="text-xs font-medium text-gray-500 mb-3">Corps de l&apos;email</p>
                {detailItem.body?.includes("<") ? (
                  <div
                    className="text-sm prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(detailItem.body) }}
                  />
                ) : (
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {detailItem.body || <span className="italic text-gray-400">Aucun contenu</span>}
                  </div>
                )}
              </div>

              {/* Error message */}
              {detailItem.status === "failed" && detailItem.error_message && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-medium text-red-700 mb-1">Erreur</p>
                  <p className="text-sm text-red-600">{detailItem.error_message}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {(detailItem?.status === "failed" || detailItem?.status === "pending") && (
              <Button
                variant="outline"
                className="gap-2 text-orange-600 hover:text-orange-700"
                onClick={() => {
                  setDetailDialogOpen(false);
                  if (detailItem) handleResend(detailItem);
                }}
              >
                <RefreshCw className="h-4 w-4" />
                {detailItem?.status === "pending" ? "Envoyer maintenant" : "Renvoyer"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>Fermer</Button>
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
