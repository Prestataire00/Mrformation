"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Building2,
  User,
  Users,
  FileText,
  History,
  Plus,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Globe,
  MapPin,
  Star,
  Calendar,
  BookOpen,
  CheckCircle,
  MoreHorizontal,
  Save,
  X,
  Upload,
  Download,
  File,
  FolderOpen,
  Loader2,
  Send,
  TrendingUp,
  Clock,
  Target,
  UserPlus,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { useEntity } from "@/contexts/EntityContext";
import { cn, formatDate, getInitials, STATUS_COLORS, SESSION_STATUS_LABELS } from "@/lib/utils";
import type { Client, Contact, ClientStatus } from "@/lib/types";

import TasksSection from "./_components/TasksSection";
import CommentsSection from "./_components/CommentsSection";
import EmailSection from "./_components/EmailSection";

// ---- Types ----
const STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Actif",
  inactive: "Inactif",
  prospect: "Prospect",
};

const STATUS_ICONS: Record<ClientStatus, string> = {
  active: "bg-green-500",
  inactive: "bg-gray-400",
  prospect: "bg-amber-500",
};

const SECTOR_OPTIONS = [
  "Industrie", "Services", "Commerce", "Santé", "Éducation",
  "BTP", "Transport", "Agriculture", "Informatique", "Finance", "Autre",
];

const MODE_LABELS: Record<string, string> = {
  presentiel: "Présentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

interface Learner {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  created_at: string;
  enrollments_count: number;
}

interface SessionHistory {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  mode: string;
  status: string;
  trainer_first_name: string | null;
  trainer_last_name: string | null;
  enrolled_learners: number;
}

interface ActivityEntry {
  id: string;
  action: string;
  resource_type: string | null;
  created_at: string;
  user_first_name: string | null;
  user_last_name: string | null;
}

interface ClientDocument {
  id: string;
  name: string;
  type: string;
  file_url: string | null;
  notes: string | null;
  created_at: string;
}

interface ContactFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  job_title: string;
  is_primary: boolean;
}

interface ClientFormData {
  company_name: string;
  siret: string;
  address: string;
  city: string;
  postal_code: string;
  website: string;
  sector: string;
  naf_code: string;
  status: ClientStatus;
  notes: string;
  phone: string;
  email: string;
  opco: string;
  funding_type: string;
  country: string;
  bpf_category: string;
}

const EMPTY_CONTACT_FORM: ContactFormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  job_title: "",
  is_primary: false,
};

// ---- Page ----
export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();

  // Data
  const [client, setClient] = useState<Client | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Client edit
  const [editingClient, setEditingClient] = useState(false);

  // Add learner inline
  const [showAddLearner, setShowAddLearner] = useState(false);
  const [newLearner, setNewLearner] = useState({ first_name: "", last_name: "", email: "", job_title: "" });

  // Enroll learner
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrollingLearner, setEnrollingLearner] = useState<any>(null);
  const [enrollSessionId, setEnrollSessionId] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [clientForm, setClientForm] = useState<ClientFormData>({
    company_name: "",
    siret: "",
    address: "",
    city: "",
    postal_code: "",
    website: "",
    sector: "",
    naf_code: "",
    status: "active",
    notes: "",
    phone: "",
    email: "",
    opco: "",
    funding_type: "",
    country: "France",
    bpf_category: "",
  });
  const [clientErrors, setClientErrors] = useState<Partial<Record<keyof ClientFormData, string>>>({});

  // Documents
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [docForm, setDocForm] = useState({ name: "", type: "contract", notes: "" });
  const [savingDoc, setSavingDoc] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // Contact dialogs
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editContactDialogOpen, setEditContactDialogOpen] = useState(false);
  const [deleteContactDialogOpen, setDeleteContactDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactForm, setContactForm] = useState<ContactFormData>(EMPTY_CONTACT_FORM);
  const [contactErrors, setContactErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});
  const [savingContact, setSavingContact] = useState(false);
  const [deletingContact, setDeletingContact] = useState(false);

  useEffect(() => {
    if (clientId) {
      fetchAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([
      fetchClient(),
      fetchContacts(),
      fetchLearners(),
      fetchSessions(),
      fetchActivity(),
      fetchDocuments(),
    ]);
    setLoading(false);
  }

  const fetchClient = useCallback(async () => {
    if (!entityId) return;
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .eq("entity_id", entityId)
      .single();

    if (error || !data) {
      toast({ title: "Erreur", description: "Client introuvable.", variant: "destructive" });
      router.push("/admin/clients");
      return;
    }
    setClient(data as Client);
    setClientForm({
      company_name: data.company_name,
      siret: data.siret ?? "",
      address: data.address ?? "",
      city: data.city ?? "",
      postal_code: data.postal_code ?? "",
      website: data.website ?? "",
      sector: data.sector ?? "",
      naf_code: data.naf_code ?? "",
      status: data.status as ClientStatus,
      notes: data.notes ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      opco: data.opco ?? "",
      funding_type: data.funding_type ?? "",
      country: data.country ?? "France",
      bpf_category: data.bpf_category ?? "",
    });
  }, [supabase, clientId, entityId, router, toast]);

  const fetchContacts = useCallback(async () => {
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .order("last_name", { ascending: true });

    if (!error) setContacts((data as Contact[]) ?? []);
  }, [supabase, clientId]);

  const fetchLearners = useCallback(async () => {
    if (!entityId) return;
    const { data, error } = await supabase
      .from("learners")
      .select(`*, enrollments(id)`)
      .eq("client_id", clientId)
      .eq("entity_id", entityId)
      .order("last_name", { ascending: true });

    if (!error) {
      const mapped: Learner[] = (data ?? []).map((l: Record<string, unknown>) => ({
        id: l.id as string,
        first_name: l.first_name as string,
        last_name: l.last_name as string,
        email: l.email as string | null,
        phone: l.phone as string | null,
        job_title: l.job_title as string | null,
        created_at: l.created_at as string,
        enrollments_count: Array.isArray(l.enrollments) ? (l.enrollments as unknown[]).length : 0,
      }));
      setLearners(mapped);
    }
  }, [supabase, clientId, entityId]);

  async function handleAddLearner() {
    if (!newLearner.first_name.trim() || !newLearner.last_name.trim() || !entityId) return;
    const { error } = await supabase.from("learners").insert({
      entity_id: entityId,
      client_id: clientId,
      first_name: newLearner.first_name.trim(),
      last_name: newLearner.last_name.trim(),
      email: newLearner.email.trim() || null,
      job_title: newLearner.job_title.trim() || null,
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Apprenant ajouté" });
      setNewLearner({ first_name: "", last_name: "", email: "", job_title: "" });
      setShowAddLearner(false);
      fetchLearners();
    }
  }

  function handleEnrollLearner(learner: any) {
    setEnrollingLearner(learner);
    setEnrollSessionId("");
    setEnrollDialogOpen(true);
  }

  async function handleConfirmEnroll() {
    if (!enrollingLearner || !enrollSessionId) return;
    setEnrolling(true);
    const { error } = await supabase.from("enrollments").insert({
      session_id: enrollSessionId,
      learner_id: enrollingLearner.id,
      client_id: clientId,
      status: "registered",
    });
    setEnrolling(false);
    if (error) {
      if (error.code === "23505") toast({ title: "Déjà inscrit à cette session", variant: "destructive" });
      else toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${enrollingLearner.first_name} inscrit à la formation` });
      setEnrollDialogOpen(false);
      fetchLearners();
      fetchSessions();
    }
  }

  const fetchSessions = useCallback(async () => {
    const { data, error } = await supabase
      .from("enrollments")
      .select(`
        session_id,
        sessions (
          id,
          title,
          start_date,
          end_date,
          mode,
          status,
          trainers (first_name, last_name),
          enrollments (id)
        )
      `)
      .eq("client_id", clientId);

    if (!error && data) {
      const seen = new Set<string>();
      const mapped: SessionHistory[] = [];

      for (const row of data as Record<string, unknown>[]) {
        const s = row.sessions as Record<string, unknown> | null;
        if (!s || seen.has(s.id as string)) continue;
        seen.add(s.id as string);
        const trainer = s.trainers as { first_name?: string; last_name?: string } | null;
        const enrollments = s.enrollments as unknown[] | null;
        mapped.push({
          id: s.id as string,
          title: s.title as string,
          start_date: s.start_date as string,
          end_date: s.end_date as string,
          mode: s.mode as string,
          status: s.status as string,
          trainer_first_name: trainer?.first_name ?? null,
          trainer_last_name: trainer?.last_name ?? null,
          enrolled_learners: enrollments?.length ?? 0,
        });
      }

      mapped.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
      setSessions(mapped);
    }
  }, [supabase, clientId]);

  const fetchActivity = useCallback(async () => {
    const { data, error } = await supabase
      .from("activity_logs")
      .select(`id, action, resource_type, created_at, profiles(first_name, last_name)`)
      .eq("resource_id", clientId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error) {
      const mapped: ActivityEntry[] = (data ?? []).map((a: Record<string, unknown>) => {
        const p = a.profiles as { first_name?: string; last_name?: string } | null;
        return {
          id: a.id as string,
          action: a.action as string,
          resource_type: a.resource_type as string | null,
          created_at: a.created_at as string,
          user_first_name: p?.first_name ?? null,
          user_last_name: p?.last_name ?? null,
        };
      });
      setActivity(mapped);
    }
  }, [supabase, clientId]);

  // ---- Documents ----
  const fetchDocuments = useCallback(async () => {
    const { data, error } = await supabase
      .from("client_documents")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setDocuments(data as ClientDocument[]);
    }
  }, [supabase, clientId]);

  async function handleAddDocument() {
    if (!docForm.name.trim()) return;
    setSavingDoc(true);
    const { error } = await supabase.from("client_documents").insert({
      client_id: clientId,
      name: docForm.name.trim(),
      type: docForm.type,
      notes: docForm.notes.trim() || null,
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Document ajouté" });
      setDocDialogOpen(false);
      setDocForm({ name: "", type: "contract", notes: "" });
      await fetchDocuments();
    }
    setSavingDoc(false);
  }

  async function handleDeleteDocument(docId: string) {
    setDeletingDocId(docId);
    const { error } = await supabase.from("client_documents").delete().eq("id", docId);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Document supprimé" });
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    }
    setDeletingDocId(null);
  }

  const DOC_TYPE_LABELS: Record<string, string> = {
    contract: "Contrat",
    agreement: "Convention",
    invoice: "Facture",
    quote: "Devis",
    bpf: "BPF",
    certificate: "Attestation",
    other: "Autre",
  };

  const DOC_TYPE_COLORS: Record<string, string> = {
    contract: "bg-blue-100 text-blue-700",
    agreement: "bg-purple-100 text-purple-700",
    invoice: "bg-green-100 text-green-700",
    quote: "bg-amber-100 text-amber-700",
    bpf: "bg-teal-100 text-teal-700",
    certificate: "bg-indigo-100 text-indigo-700",
    other: "bg-gray-100 text-gray-600",
  };

  // ---- Client update ----
  function validateClientForm(): boolean {
    const errors: Partial<Record<keyof ClientFormData, string>> = {};
    if (!clientForm.company_name.trim()) errors.company_name = "Le nom est requis.";
    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSaveClient() {
    if (!validateClientForm()) return;
    setSavingClient(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .update({
          company_name: clientForm.company_name.trim(),
          siret: clientForm.siret.trim() || null,
          address: clientForm.address.trim() || null,
          city: clientForm.city.trim() || null,
          postal_code: clientForm.postal_code.trim() || null,
          website: clientForm.website.trim() || null,
          sector: clientForm.sector || null,
          naf_code: clientForm.naf_code.trim() || null,
          status: clientForm.status,
          notes: clientForm.notes.trim() || null,
          phone: clientForm.phone.trim() || null,
          email: clientForm.email.trim() || null,
          opco: clientForm.opco.trim() || null,
          funding_type: clientForm.funding_type || null,
          country: clientForm.country.trim() || "France",
          bpf_category: clientForm.bpf_category || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", clientId)
        .select()
        .single();

      if (error) throw error;
      setClient(data as Client);
      setEditingClient(false);
      toast({ title: "Client mis à jour", description: "Les informations ont été enregistrées." });
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur", description: "Impossible de mettre à jour le client.", variant: "destructive" });
    } finally {
      setSavingClient(false);
    }
  }

  function cancelEditClient() {
    if (!client) return;
    setClientForm({
      company_name: client.company_name,
      siret: client.siret ?? "",
      address: client.address ?? "",
      city: client.city ?? "",
      postal_code: client.postal_code ?? "",
      website: client.website ?? "",
      sector: client.sector ?? "",
      naf_code: client.naf_code ?? "",
      status: client.status,
      notes: client.notes ?? "",
      phone: (client as any).phone ?? "",
      email: (client as any).email ?? "",
      opco: (client as any).opco ?? "",
      funding_type: (client as any).funding_type ?? "",
      country: (client as any).country ?? "France",
      bpf_category: (client as any).bpf_category ?? "",
    });
    setClientErrors({});
    setEditingClient(false);
  }

  // ---- Contact CRUD ----
  function validateContactForm(): boolean {
    const errors: Partial<Record<keyof ContactFormData, string>> = {};
    if (!contactForm.first_name.trim()) errors.first_name = "Le prénom est requis.";
    if (!contactForm.last_name.trim()) errors.last_name = "Le nom est requis.";
    if (contactForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactForm.email)) {
      errors.email = "L'email n'est pas valide.";
    }
    setContactErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCreateContact() {
    if (!validateContactForm()) return;
    setSavingContact(true);
    try {
      if (contactForm.is_primary) {
        await supabase
          .from("contacts")
          .update({ is_primary: false })
          .eq("client_id", clientId)
          .eq("is_primary", true);
      }

      const { error } = await supabase.from("contacts").insert([{
        client_id: clientId,
        first_name: contactForm.first_name.trim(),
        last_name: contactForm.last_name.trim(),
        email: contactForm.email.trim() || null,
        phone: contactForm.phone.trim() || null,
        job_title: contactForm.job_title.trim() || null,
        is_primary: contactForm.is_primary,
      }]);

      if (error) throw error;

      toast({ title: "Contact ajouté", description: `${contactForm.first_name} ${contactForm.last_name} a été ajouté.` });
      setContactDialogOpen(false);
      setContactForm(EMPTY_CONTACT_FORM);
      setContactErrors({});
      fetchContacts();
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur", description: "Impossible d'ajouter le contact.", variant: "destructive" });
    } finally {
      setSavingContact(false);
    }
  }

  async function handleUpdateContact() {
    if (!selectedContact || !validateContactForm()) return;
    setSavingContact(true);
    try {
      if (contactForm.is_primary && !selectedContact.is_primary) {
        await supabase
          .from("contacts")
          .update({ is_primary: false })
          .eq("client_id", clientId)
          .eq("is_primary", true);
      }

      const { error } = await supabase
        .from("contacts")
        .update({
          first_name: contactForm.first_name.trim(),
          last_name: contactForm.last_name.trim(),
          email: contactForm.email.trim() || null,
          phone: contactForm.phone.trim() || null,
          job_title: contactForm.job_title.trim() || null,
          is_primary: contactForm.is_primary,
        })
        .eq("id", selectedContact.id);

      if (error) throw error;

      toast({ title: "Contact modifié", description: "Les informations du contact ont été mises à jour." });
      setEditContactDialogOpen(false);
      setSelectedContact(null);
      setContactForm(EMPTY_CONTACT_FORM);
      setContactErrors({});
      fetchContacts();
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur", description: "Impossible de modifier le contact.", variant: "destructive" });
    } finally {
      setSavingContact(false);
    }
  }

  async function handleDeleteContact() {
    if (!selectedContact) return;
    setDeletingContact(true);
    try {
      const { error } = await supabase.from("contacts").delete().eq("id", selectedContact.id);
      if (error) throw error;
      toast({ title: "Contact supprimé", description: `${selectedContact.first_name} ${selectedContact.last_name} a été supprimé.` });
      setDeleteContactDialogOpen(false);
      setSelectedContact(null);
      fetchContacts();
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur", description: "Impossible de supprimer le contact.", variant: "destructive" });
    } finally {
      setDeletingContact(false);
    }
  }

  async function handleCreateClientAccess() {
    const primaryEmail = contacts.find((c: Contact) => c.email)?.email;
    const primaryContact = contacts[0];
    if (!primaryEmail || !primaryContact) {
      toast({ title: "Aucun contact avec email", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch("/api/admin/create-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: primaryEmail,
          first_name: primaryContact.first_name,
          last_name: primaryContact.last_name,
          role: "client",
          entity_type: "client",
          entity_type_id: clientId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: `Accès créé — MDP: ${data.password}`, description: `Email envoyé à ${data.email}` });
        // Auto-send email
        await fetch("/api/emails/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: data.email,
            subject: "Vos accès plateforme formation",
            body: `Bonjour ${primaryContact.first_name},\n\nVotre accès client à la plateforme a été créé.\n\nEmail: ${data.email}\nMot de passe: ${data.password}\n\nConnectez-vous: ${data.login_url}\n\nCordialement,\nL'équipe formation`,
          }),
        });
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  }

  function openAddContactDialog() {
    setContactForm(EMPTY_CONTACT_FORM);
    setContactErrors({});
    setContactDialogOpen(true);
  }

  function openEditContactDialog(contact: Contact) {
    setSelectedContact(contact);
    setContactForm({
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      job_title: contact.job_title ?? "",
      is_primary: contact.is_primary,
    });
    setContactErrors({});
    setEditContactDialogOpen(true);
  }

  function openDeleteContactDialog(contact: Contact) {
    setSelectedContact(contact);
    setDeleteContactDialogOpen(true);
  }

  function updateContactField(field: keyof ContactFormData, value: string | boolean) {
    setContactForm((prev) => ({ ...prev, [field]: value }));
    if (typeof value === "string" && contactErrors[field]) {
      setContactErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
          <p className="text-sm text-muted-foreground">Chargement du client…</p>
        </div>
      </div>
    );
  }

  if (!client) return null;

  const primaryContact = contacts.find((c) => c.is_primary);
  const upcomingSessions = sessions.filter((s) => new Date(s.start_date) >= new Date());

  return (
    <div className="space-y-6 p-6">
      {/* ===== HERO HEADER ===== */}
      <div className="relative rounded-2xl bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 p-6 text-white overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-1/4 w-32 h-32 bg-white/5 rounded-full translate-y-1/2" />

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/admin/clients">
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-white/70 hover:text-white hover:bg-white/10">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur text-2xl font-bold">
                {client.company_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">{client.company_name}</h1>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-medium">
                    <span className={cn("h-2 w-2 rounded-full", STATUS_ICONS[client.status])} />
                    {STATUS_LABELS[client.status]}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-1.5 text-sm text-white/70">
                  {client.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {client.city}{client.postal_code ? ` (${client.postal_code})` : ""}
                    </span>
                  )}
                  {client.sector && <span>{client.sector}</span>}
                  {client.siret && (
                    <span className="font-mono text-xs bg-white/10 px-2 py-0.5 rounded">
                      SIRET: {client.siret}
                    </span>
                  )}
                  {client.website && (
                    <a
                      href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {client.website}
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingClient(true)}
                className="text-white/70 hover:text-white hover:bg-white/10 gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                Modifier
              </Button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {[
              { label: "Contacts", value: contacts.length, icon: User, color: "from-blue-400/20 to-blue-500/20" },
              { label: "Apprenants", value: learners.length, icon: Users, color: "from-emerald-400/20 to-emerald-500/20" },
              { label: "Sessions", value: sessions.length, icon: Calendar, color: "from-amber-400/20 to-amber-500/20" },
              { label: "Documents", value: documents.length, icon: FileText, color: "from-rose-400/20 to-rose-500/20" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div
                key={label}
                className={cn("rounded-xl bg-gradient-to-br p-4 backdrop-blur border border-white/10", color)}
              >
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-white/60" />
                  <span className="text-2xl font-bold">{value}</span>
                </div>
                <p className="text-xs text-white/60 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== QUICK ACTIONS ===== */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="gap-1.5 text-xs"
          style={{ background: "#3DB5C5" }}
          onClick={() => {
            const tabsList = document.querySelector('[data-state="active"][value="emails"]') || document.querySelector('[value="emails"]');
            if (tabsList) (tabsList as HTMLElement).click();
          }}
        >
          <Send className="h-3.5 w-3.5" />
          Envoyer un email
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={() => {
            const tabsList = document.querySelector('[value="documents"]');
            if (tabsList) (tabsList as HTMLElement).click();
          }}
        >
          <FileText className="h-3.5 w-3.5" />
          Documents
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={() => setContactDialogOpen(true)}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Ajouter un contact
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleCreateClientAccess}>
          <Key className="h-3.5 w-3.5" /> Accès plateforme
        </Button>
      </div>

      {/* ===== QUICK INFO BAR ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Primary contact */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {primaryContact ? (
                <>
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-violet-100 text-violet-700 text-sm font-semibold">
                      {getInitials(primaryContact.first_name, primaryContact.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-500 fill-amber-400" />
                      Contact principal
                    </p>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {primaryContact.first_name} {primaryContact.last_name}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {primaryContact.email && (
                        <a href={`mailto:${primaryContact.email}`} className="text-[11px] text-violet-600 hover:underline truncate">
                          {primaryContact.email}
                        </a>
                      )}
                      {primaryContact.phone && (
                        <a href={`tel:${primaryContact.phone}`} className="text-[11px] text-muted-foreground hover:text-gray-900">
                          {primaryContact.phone}
                        </a>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Contact principal</p>
                    <p className="text-sm font-medium">Aucun défini</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Next session */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {upcomingSessions.length > 0 ? (
                <>
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <Calendar className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Prochaine session
                    </p>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {upcomingSessions[upcomingSessions.length - 1].title}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDate(upcomingSessions[upcomingSessions.length - 1].start_date)}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Calendar className="h-5 w-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Prochaine session</p>
                    <p className="text-sm font-medium text-gray-500">Aucune planifiée</p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick stats */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Activité récente</p>
                <div className="flex items-center gap-4 mt-0.5">
                  <div>
                    <span className="text-lg font-bold text-gray-900">{activity.length}</span>
                    <span className="text-[11px] text-muted-foreground ml-1">actions</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Créé le {formatDate(client.created_at)}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== MAIN TABS ===== */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-0 flex-wrap">
          {[
            { value: "overview", label: "Vue d'ensemble", icon: Building2 },
            { value: "formations", label: `Formations (${sessions.length})`, icon: Calendar },
            { value: "communication", label: "Communication", icon: Send },
            { value: "documents", label: `Documents (${documents.length})`, icon: FolderOpen },
          ].map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 font-medium text-muted-foreground data-[state=active]:text-primary gap-1.5"
            >
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ════ Tab: Vue d'ensemble ════ */}
        <TabsContent value="overview" className="mt-6 space-y-8">

          {/* ── Contacts section ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Contacts ({contacts.length})</h3>
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => setContactDialogOpen(true)}>
                <Plus className="h-3 w-3" /> Contact
              </Button>
            </div>
            {contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center border rounded-lg border-dashed">
                <User className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="font-medium text-gray-700">Aucun contact enregistré</p>
                <p className="text-sm text-muted-foreground mt-1">Ajoutez le premier contact de ce client.</p>
                <Button onClick={openAddContactDialog} className="mt-4 gap-1.5" size="sm">
                  <Plus className="h-4 w-4" />
                  Ajouter un contact
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className={cn(
                      "rounded-lg border p-4 space-y-3 transition-shadow hover:shadow-sm",
                      contact.is_primary && "border-amber-200 bg-amber-50/50"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarFallback className={cn(
                            "text-sm font-semibold",
                            contact.is_primary ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-700"
                          )}>
                            {getInitials(contact.first_name, contact.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-sm text-gray-900 truncate">
                              {contact.first_name} {contact.last_name}
                            </p>
                            {contact.is_primary && (
                              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400 flex-shrink-0" />
                            )}
                          </div>
                          {contact.job_title && (
                            <p className="text-xs text-muted-foreground truncate">{contact.job_title}</p>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => openEditContactDialog(contact)} className="gap-2">
                            <Pencil className="h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => openDeleteContactDialog(contact)}
                            className="gap-2 text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="space-y-1.5">
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-xs text-violet-600 hover:underline">
                          <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{contact.email}</span>
                        </a>
                      )}
                      {contact.phone && (
                        <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gray-900">
                          <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                          {contact.phone}
                        </a>
                      )}
                      {!contact.email && !contact.phone && (
                        <p className="text-xs text-muted-foreground italic">Aucune coordonnée</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-gray-100" />

          {/* ── Apprenants section ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Apprenants ({learners.length})</h3>

            {showAddLearner ? (
              <div className="border rounded-lg p-4 bg-gray-50/50 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase">Ajouter un apprenant</p>
                <div className="flex items-center gap-3">
                  <Input placeholder="Prénom *" value={newLearner.first_name} onChange={e => setNewLearner(f => ({...f, first_name: e.target.value}))} className="h-8 text-sm flex-1" autoFocus />
                  <Input placeholder="Nom *" value={newLearner.last_name} onChange={e => setNewLearner(f => ({...f, last_name: e.target.value}))} className="h-8 text-sm flex-1" />
                  <Input placeholder="Email" value={newLearner.email} onChange={e => setNewLearner(f => ({...f, email: e.target.value}))} className="h-8 text-sm flex-1" />
                  <Input placeholder="Poste" value={newLearner.job_title} onChange={e => setNewLearner(f => ({...f, job_title: e.target.value}))} className="h-8 text-sm w-32" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowAddLearner(false)}>Annuler</Button>
                  <Button size="sm" className="text-xs h-7" disabled={!newLearner.first_name.trim() || !newLearner.last_name.trim()} onClick={handleAddLearner}>Ajouter</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">{learners.length} apprenant{learners.length !== 1 ? "s" : ""}</span>
                <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setShowAddLearner(true)}>
                  <UserPlus className="h-3.5 w-3.5" /> Ajouter un apprenant
                </Button>
              </div>
            )}

            {learners.length === 0 && !showAddLearner ? (
              <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg border-dashed">
                <Users className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Aucun apprenant rattaché</p>
                <p className="text-xs text-gray-400 mt-1">Ajoutez les employés de cette entreprise qui participeront aux formations</p>
              </div>
            ) : (
              <div className="space-y-2">
                {learners.map((learner) => (
                  <div key={learner.id} className="border rounded-lg p-3 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                          {learner.first_name.charAt(0)}{learner.last_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/admin/clients/apprenants/${learner.id}`} className="text-sm font-medium text-gray-900 hover:text-[#3DB5C5] hover:underline">
                            {learner.first_name} {learner.last_name}
                          </Link>
                          <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                            {learner.email && <span>{learner.email}</span>}
                            {learner.job_title && <span>{learner.job_title}</span>}
                            <span>{learner.enrollments_count} formation{learner.enrollments_count !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleEnrollLearner(learner)} className="text-[10px] text-[#3DB5C5] hover:underline px-1.5 py-0.5">Inscrire</button>
                        <Link href={`/admin/clients/apprenants/${learner.id}`} className="text-[10px] text-gray-500 hover:text-gray-700 px-1.5 py-0.5">Voir</Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Enroll dialog */}
            {enrollDialogOpen && enrollingLearner && (
              <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Inscrire {enrollingLearner.first_name} {enrollingLearner.last_name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <Label>Formation</Label>
                    <Select value={enrollSessionId} onValueChange={setEnrollSessionId}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sélectionner une session..." /></SelectTrigger>
                      <SelectContent>
                        {sessions.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.title}{s.start_date ? ` (${formatDate(s.start_date)})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>Annuler</Button>
                    <Button onClick={handleConfirmEnroll} disabled={!enrollSessionId || enrolling}>
                      {enrolling ? "Inscription..." : "Inscrire"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <hr className="border-gray-100" />

          {/* ── Info section ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Informations client</h3>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-base font-semibold">Informations générales</CardTitle>
                    {!editingClient ? (
                      <Button variant="outline" size="sm" onClick={() => setEditingClient(true)} className="gap-1.5">
                        <Pencil className="h-3.5 w-3.5" />
                        Modifier
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={cancelEditClient} disabled={savingClient} className="gap-1.5">
                          <X className="h-3.5 w-3.5" />
                          Annuler
                        </Button>
                        <Button size="sm" onClick={handleSaveClient} disabled={savingClient} className="gap-1.5">
                          {savingClient
                            ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            : <Save className="h-3.5 w-3.5" />
                          }
                          Enregistrer
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-1.5">
                      <Label>Nom de l&apos;entreprise <span className="text-red-500">*</span></Label>
                      {editingClient ? (
                        <>
                          <Input
                            value={clientForm.company_name}
                            onChange={(e) => setClientForm((f) => ({ ...f, company_name: e.target.value }))}
                            className={cn(clientErrors.company_name && "border-red-500")}
                          />
                          {clientErrors.company_name && <p className="text-xs text-red-500">{clientErrors.company_name}</p>}
                        </>
                      ) : (
                        <p className="text-sm font-medium text-gray-900">{client.company_name}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>SIRET</Label>
                        {editingClient ? (
                          <Input
                            value={clientForm.siret}
                            onChange={(e) => setClientForm((f) => ({ ...f, siret: e.target.value }))}
                            placeholder="14 chiffres"
                            maxLength={14}
                          />
                        ) : (
                          <p className="text-sm text-gray-700 font-mono">{client.siret ?? "—"}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Statut</Label>
                        {editingClient ? (
                          <Select
                            value={clientForm.status}
                            onValueChange={(v) => setClientForm((f) => ({ ...f, status: v as ClientStatus }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Actif</SelectItem>
                              <SelectItem value="inactive">Inactif</SelectItem>
                              <SelectItem value="prospect">Prospect</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={cn("border-0", STATUS_COLORS[client.status])}>
                            {STATUS_LABELS[client.status]}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-1.5">
                      <Label>Adresse</Label>
                      {editingClient ? (
                        <Input
                          value={clientForm.address}
                          onChange={(e) => setClientForm((f) => ({ ...f, address: e.target.value }))}
                          placeholder="Rue, numéro…"
                        />
                      ) : (
                        <p className="text-sm text-gray-700">{client.address ?? "—"}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Ville</Label>
                        {editingClient ? (
                          <Input
                            value={clientForm.city}
                            onChange={(e) => setClientForm((f) => ({ ...f, city: e.target.value }))}
                          />
                        ) : (
                          <p className="text-sm text-gray-700">{client.city ?? "—"}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Code postal</Label>
                        {editingClient ? (
                          <Input
                            value={clientForm.postal_code}
                            onChange={(e) => setClientForm((f) => ({ ...f, postal_code: e.target.value }))}
                            maxLength={5}
                          />
                        ) : (
                          <p className="text-sm text-gray-700">{client.postal_code ?? "—"}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Téléphone</Label>
                        {editingClient ? (
                          <Input
                            value={clientForm.phone}
                            onChange={(e) => setClientForm((f) => ({ ...f, phone: e.target.value }))}
                            placeholder="01 23 45 67 89"
                          />
                        ) : (
                          <p className="text-sm text-gray-700">{(client as any).phone ?? "—"}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Email</Label>
                        {editingClient ? (
                          <Input
                            type="email"
                            value={clientForm.email}
                            onChange={(e) => setClientForm((f) => ({ ...f, email: e.target.value }))}
                            placeholder="contact@entreprise.fr"
                          />
                        ) : (
                          <p className="text-sm text-gray-700">{(client as any).email ?? "—"}</p>
                        )}
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Site web</Label>
                        {editingClient ? (
                          <Input
                            value={clientForm.website}
                            onChange={(e) => setClientForm((f) => ({ ...f, website: e.target.value }))}
                            placeholder="www.exemple.fr"
                          />
                        ) : client.website ? (
                          <a
                            href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-violet-600 hover:underline flex items-center gap-1"
                          >
                            <Globe className="h-3.5 w-3.5" />
                            {client.website}
                          </a>
                        ) : (
                          <p className="text-sm text-gray-700">—</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Secteur d&apos;activité</Label>
                        {editingClient ? (
                          <Select
                            value={clientForm.sector}
                            onValueChange={(v) => setClientForm((f) => ({ ...f, sector: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choisir un secteur" />
                            </SelectTrigger>
                            <SelectContent>
                              {SECTOR_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-sm text-gray-700">{client.sector ?? "—"}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Code NAF</Label>
                        {editingClient ? (
                          <Input
                            value={clientForm.naf_code}
                            onChange={(e) => setClientForm((f) => ({ ...f, naf_code: e.target.value }))}
                            placeholder="Ex : 8559A"
                          />
                        ) : (
                          <p className="text-sm text-gray-700">{client.naf_code ?? "—"}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Notes</Label>
                      {editingClient ? (
                        <Textarea
                          value={clientForm.notes}
                          onChange={(e) => setClientForm((f) => ({ ...f, notes: e.target.value }))}
                          rows={4}
                          className="resize-none"
                          placeholder="Notes internes sur ce client…"
                        />
                      ) : (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {client.notes ?? <span className="text-muted-foreground italic">Aucune note.</span>}
                        </p>
                      )}
                    </div>

                    <Separator />

                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Financement</h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>OPCO</Label>
                        {editingClient ? (
                          <Input
                            value={clientForm.opco}
                            onChange={(e) => setClientForm((f) => ({ ...f, opco: e.target.value }))}
                            placeholder="Nom de l'OPCO"
                          />
                        ) : (
                          <p className="text-sm text-gray-700">{(client as any).opco ?? "—"}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Type de financement</Label>
                        {editingClient ? (
                          <Select
                            value={clientForm.funding_type}
                            onValueChange={(v) => setClientForm((f) => ({ ...f, funding_type: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionner..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="entreprise">Entreprise</SelectItem>
                              <SelectItem value="opco">OPCO</SelectItem>
                              <SelectItem value="cpf">CPF</SelectItem>
                              <SelectItem value="pole_emploi">Pôle Emploi</SelectItem>
                              <SelectItem value="region">Région</SelectItem>
                              <SelectItem value="autre">Autre</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-sm text-gray-700">{(client as any).funding_type ?? "—"}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Catégorie BPF</Label>
                        {editingClient ? (
                          <Select
                            value={clientForm.bpf_category}
                            onValueChange={(v) => setClientForm((f) => ({ ...f, bpf_category: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionner..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="entreprise_privee">Entreprise privée</SelectItem>
                              <SelectItem value="administration_publique">Administration publique</SelectItem>
                              <SelectItem value="association">Association</SelectItem>
                              <SelectItem value="particulier">Particulier</SelectItem>
                              <SelectItem value="autre">Autre</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-sm text-gray-700">{(client as any).bpf_category ?? "—"}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Pays</Label>
                        {editingClient ? (
                          <Input
                            value={clientForm.country}
                            onChange={(e) => setClientForm((f) => ({ ...f, country: e.target.value }))}
                          />
                        ) : (
                          <p className="text-sm text-gray-700">{(client as any).country ?? "France"}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">Résumé</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      { label: "Contacts", value: contacts.length, icon: User },
                      { label: "Apprenants", value: learners.length, icon: Users },
                      { label: "Sessions", value: sessions.length, icon: Calendar },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Icon className="h-4 w-4" />
                          {label}
                        </div>
                        <span className="font-semibold text-gray-900">{value}</span>
                      </div>
                    ))}

                    <Separator />

                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Créé le {formatDate(client.created_at)}</p>
                      {client.updated_at && client.updated_at !== client.created_at && (
                        <p>Modifié le {formatDate(client.updated_at)}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* ── Tasks section ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tâches</h3>
            <TasksSection clientId={clientId} clientName={client.company_name} />
          </div>
        </TabsContent>

        {/* ════ Tab: Formations ════ */}
        <TabsContent value="formations" className="mt-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Historique des sessions</CardTitle>
              <CardDescription>
                {sessions.length} session{sessions.length !== 1 ? "s" : ""} associée{sessions.length !== 1 ? "s" : ""} à ce client
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <Calendar className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="font-medium text-gray-700">Aucune session trouvée</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Les sessions apparaissent via les inscriptions des apprenants.
                  </p>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-3">
                    {sessions.map((session) => (
                      <div key={session.id} className="flex items-start gap-4 rounded-lg border p-4 hover:bg-gray-50/50 transition-colors">
                        <div className="flex-shrink-0 text-center bg-violet-50 rounded-lg px-3 py-2 min-w-[56px]">
                          <p className="text-xs font-medium text-violet-600 uppercase">
                            {formatDate(session.start_date, "MMM")}
                          </p>
                          <p className="text-xl font-bold text-violet-700">
                            {formatDate(session.start_date, "dd")}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-gray-900">{session.title}</p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                {session.trainer_first_name && (
                                  <span>
                                    {session.trainer_first_name} {session.trainer_last_name}
                                  </span>
                                )}
                                <span>{formatDate(session.start_date)} – {formatDate(session.end_date)}</span>
                                <span>{session.enrolled_learners} inscrits</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <Badge className={cn("border-0 text-xs", STATUS_COLORS[session.status])}>
                                {SESSION_STATUS_LABELS[session.status] ?? session.status}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {MODE_LABELS[session.mode] ?? session.mode}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════ Tab: Communication ════ */}
        <TabsContent value="communication" className="mt-6 space-y-8">

          {/* ── Email section ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Emails</h3>
            <EmailSection clientId={clientId} clientName={client.company_name} contacts={contacts} />
          </div>

          <hr className="border-gray-100" />

          {/* ── Comments section ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Commentaires</h3>
            <CommentsSection clientId={clientId} />
          </div>

          <hr className="border-gray-100" />

          {/* ── History section ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Historique des activités</h3>
            <Card>
              <CardContent className="pt-6">
                {activity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <History className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="font-medium text-gray-700">Aucune activité enregistrée</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Les actions sur ce client apparaîtront ici.
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <div className="relative space-y-0">
                      {activity.map((entry, idx) => (
                        <div key={entry.id} className="flex gap-3 pb-6 relative">
                          {idx < activity.length - 1 && (
                            <div className="absolute left-[17px] top-8 bottom-0 w-px bg-gray-200" />
                          )}
                          <div className="flex-shrink-0 h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center z-10">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </div>
                          <div className="flex-1 pt-1.5">
                            <p className="text-sm text-gray-800">{entry.action}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                              {(entry.user_first_name || entry.user_last_name) && (
                                <span>{entry.user_first_name} {entry.user_last_name}</span>
                              )}
                              <span>• {formatDate(entry.created_at, "dd/MM/yyyy HH:mm")}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ════ Tab: Documents ════ */}
        <TabsContent value="documents" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold">Documents contractuels</CardTitle>
                <CardDescription>Contrats, conventions, factures et autres documents liés à ce client</CardDescription>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setDocDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Ajouter
              </Button>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <FolderOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="font-medium text-gray-700">Aucun document</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ajoutez des contrats, conventions ou factures pour ce client.
                  </p>
                  <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => setDocDialogOpen(true)}>
                    <Upload className="h-4 w-4" />
                    Ajouter un document
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition group">
                      <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <File className="h-5 w-5 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800 truncate">{doc.name}</p>
                          <Badge className={cn("text-[10px]", DOC_TYPE_COLORS[doc.type] || "bg-gray-100 text-gray-600")}>
                            {DOC_TYPE_LABELS[doc.type] || doc.type}
                          </Badge>
                        </div>
                        {doc.notes && <p className="text-xs text-gray-500 truncate mt-0.5">{doc.notes}</p>}
                        <p className="text-[11px] text-gray-400 mt-0.5">{formatDate(doc.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        {doc.file_url && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4 text-gray-500" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          disabled={deletingDocId === doc.id}
                          onClick={() => handleDeleteDocument(doc.id)}
                        >
                          {deletingDocId === doc.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add Document Dialog */}
          <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Ajouter un document</DialogTitle>
                <DialogDescription>
                  Enregistrez un document contractuel pour {client?.company_name}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Nom du document <span className="text-red-500">*</span></Label>
                  <Input
                    value={docForm.name}
                    onChange={(e) => setDocForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Ex: Convention de formation - Mars 2026"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Type de document</Label>
                  <Select value={docForm.type} onValueChange={(v) => setDocForm((p) => ({ ...p, type: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contract">Contrat</SelectItem>
                      <SelectItem value="agreement">Convention de formation</SelectItem>
                      <SelectItem value="invoice">Facture</SelectItem>
                      <SelectItem value="quote">Devis</SelectItem>
                      <SelectItem value="bpf">BPF</SelectItem>
                      <SelectItem value="certificate">Attestation</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes (optionnel)</Label>
                  <Textarea
                    value={docForm.notes}
                    onChange={(e) => setDocForm((p) => ({ ...p, notes: e.target.value }))}
                    rows={2}
                    placeholder="Détails supplémentaires..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDocDialogOpen(false)}>Annuler</Button>
                <Button onClick={handleAddDocument} disabled={savingDoc || !docForm.name.trim()}>
                  {savingDoc ? "Ajout..." : "Ajouter"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      {/* ---- Add Contact Dialog ---- */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un contact</DialogTitle>
            <DialogDescription>
              Renseignez les informations du nouveau contact pour {client.company_name}.
            </DialogDescription>
          </DialogHeader>
          <ContactForm
            formData={contactForm}
            formErrors={contactErrors}
            onUpdate={updateContactField}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={savingContact}>Annuler</Button>
            </DialogClose>
            <Button onClick={handleCreateContact} disabled={savingContact} className="gap-2">
              {savingContact && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Ajouter le contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Edit Contact Dialog ---- */}
      <Dialog open={editContactDialogOpen} onOpenChange={setEditContactDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier le contact</DialogTitle>
            <DialogDescription>
              Mise à jour de {selectedContact?.first_name} {selectedContact?.last_name}.
            </DialogDescription>
          </DialogHeader>
          <ContactForm
            formData={contactForm}
            formErrors={contactErrors}
            onUpdate={updateContactField}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={savingContact}>Annuler</Button>
            </DialogClose>
            <Button onClick={handleUpdateContact} disabled={savingContact} className="gap-2">
              {savingContact && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete Contact Dialog ---- */}
      <Dialog open={deleteContactDialogOpen} onOpenChange={setDeleteContactDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer le contact</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer{" "}
              <span className="font-semibold text-gray-900">
                {selectedContact?.first_name} {selectedContact?.last_name}
              </span>{" "}
              ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deletingContact}>Annuler</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteContact} disabled={deletingContact} className="gap-2">
              {deletingContact && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- ContactForm sub-component ----
interface ContactFormProps {
  formData: ContactFormData;
  formErrors: Partial<Record<keyof ContactFormData, string>>;
  onUpdate: (field: keyof ContactFormData, value: string | boolean) => void;
}

function ContactForm({ formData, formErrors, onUpdate }: ContactFormProps) {
  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="contact_first_name">
            Prénom <span className="text-red-500">*</span>
          </Label>
          <Input
            id="contact_first_name"
            value={formData.first_name}
            onChange={(e) => onUpdate("first_name", e.target.value)}
            placeholder="Ex : Marie"
            className={cn(formErrors.first_name && "border-red-500")}
          />
          {formErrors.first_name && <p className="text-xs text-red-500">{formErrors.first_name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact_last_name">
            Nom <span className="text-red-500">*</span>
          </Label>
          <Input
            id="contact_last_name"
            value={formData.last_name}
            onChange={(e) => onUpdate("last_name", e.target.value)}
            placeholder="Ex : Dupont"
            className={cn(formErrors.last_name && "border-red-500")}
          />
          {formErrors.last_name && <p className="text-xs text-red-500">{formErrors.last_name}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact_job_title">Poste / Fonction</Label>
        <Input
          id="contact_job_title"
          value={formData.job_title}
          onChange={(e) => onUpdate("job_title", e.target.value)}
          placeholder="Ex : Responsable RH"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact_email">Email</Label>
        <Input
          id="contact_email"
          type="email"
          value={formData.email}
          onChange={(e) => onUpdate("email", e.target.value)}
          placeholder="marie.dupont@entreprise.fr"
          className={cn(formErrors.email && "border-red-500")}
        />
        {formErrors.email && <p className="text-xs text-red-500">{formErrors.email}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact_phone">Téléphone</Label>
        <Input
          id="contact_phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => onUpdate("phone", e.target.value)}
          placeholder="06 00 00 00 00"
        />
      </div>

      <Separator />

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            Contact principal
          </Label>
          <p className="text-xs text-muted-foreground">
            Ce contact sera affiché en priorité pour ce client.
          </p>
        </div>
        <Switch
          checked={formData.is_primary}
          onCheckedChange={(checked) => onUpdate("is_primary", checked)}
        />
      </div>
    </div>
  );
}
