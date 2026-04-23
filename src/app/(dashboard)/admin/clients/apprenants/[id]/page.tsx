"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Clock,
  Key,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Save,
  ShieldOff,
  ShieldCheck,
} from "lucide-react";
import QRCode from "qrcode";
import { useEntity } from "@/contexts/EntityContext";
import { cn } from "@/lib/utils";

interface LearnerDetail {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  client_id: string | null;
  clients: { company_name: string } | null;
  avatar_url?: string | null;
  profile_id?: string | null;
  created_at?: string;
}

interface ClientOption {
  id: string;
  company_name: string;
}

interface ElearningEnrollment {
  id: string;
  status: string;
  progress: number;
  elearning_courses: {
    id: string;
    title: string;
    estimated_duration_minutes: number;
  } | null;
}

interface SessionEnrollment {
  id: string;
  status: string;
  completion_rate: number;
  session: {
    id: string;
    title: string;
    start_date: string;
    end_date: string;
    training: { title: string } | null;
  } | null;
}

export default function LearnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const { entityId } = useEntity();
  const learnerId = params.id as string;

  const [learner, setLearner] = useState<LearnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "", client_id: "",
    job_title: "", birth_date: "", gender: "", nationality: "",
    address: "", city: "", postal_code: "",
    social_security_number: "", education_level: "",
  });
  const [showSSN, setShowSSN] = useState(false);
  const [elearning, setElearning] = useState<ElearningEnrollment[]>([]);
  const [sessions, setSessions] = useState<SessionEnrollment[]>([]);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [company, setCompany] = useState<ClientOption | null>(null);
  const [creatingAccess, setCreatingAccess] = useState(false);
  const [accessCreated, setAccessCreated] = useState<{ email: string; password: string; login_url: string } | null>(null);
  const [sendingWelcome, setSendingWelcome] = useState(false);
  const [learnerActive, setLearnerActive] = useState(true);
  const [togglingAccess, setTogglingAccess] = useState(false);

  const fetchLearner = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("learners")
      .select("id, first_name, last_name, email, phone, client_id, profile_id, job_title, birth_date, gender, nationality, address, city, postal_code, social_security_number, education_level, clients(company_name)")
      .eq("id", learnerId)
      .eq("entity_id", entityId)
      .single();

    if (error || !data) {
      toast({ title: "Erreur", description: "Apprenant introuvable.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const l = data as unknown as LearnerDetail;

    // Fetch avatar from profiles if learner has an auth account
    const { data: profileData } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("email", l.email)
      .maybeSingle();
    if (profileData?.avatar_url) l.avatar_url = profileData.avatar_url;

    setLearner(l);
    setForm({
      first_name: l.first_name,
      last_name: l.last_name,
      email: l.email,
      phone: l.phone ?? "",
      client_id: l.client_id ?? "",
      job_title: (l as any).job_title ?? "",
      birth_date: (l as any).birth_date ?? "",
      gender: (l as any).gender ?? "",
      nationality: (l as any).nationality ?? "",
      address: (l as any).address ?? "",
      city: (l as any).city ?? "",
      postal_code: (l as any).postal_code ?? "",
      social_security_number: (l as any).social_security_number ?? "",
      education_level: (l as any).education_level ?? "",
    });

    // Fetch client options for the dropdown
    const { data: clientsData } = await supabase
      .from("clients")
      .select("id, company_name")
      .eq("entity_id", entityId)
      .order("company_name");
    setClientOptions((clientsData as ClientOption[]) ?? []);

    // Set company info
    if (l.client_id && clientsData) {
      const matched = (clientsData as ClientOption[]).find(c => c.id === l.client_id);
      setCompany(matched ?? null);
    } else {
      setCompany(null);
    }

    // Fetch e-learning enrollments
    const { data: enrollData } = await supabase
      .from("elearning_enrollments")
      .select("id, status, progress, elearning_courses(id, title, estimated_duration_minutes)")
      .eq("learner_id", learnerId);
    setElearning((enrollData as unknown as ElearningEnrollment[]) ?? []);

    // Fetch session enrollments
    const { data: sessData } = await supabase
      .from("enrollments")
      .select("id, status, completion_rate, session:sessions!inner(id, title, start_date, end_date, training:trainings(title))")
      .eq("learner_id", learnerId)
      .neq("status", "cancelled");
    setSessions((sessData as unknown as SessionEnrollment[]) ?? []);

    setLoading(false);
  }, [learnerId, entityId]);

  useEffect(() => { fetchLearner(); }, [fetchLearner]);

  const handleSave = async () => {
    if (!learner) return;
    setSaving(true);
    const { error } = await supabase
      .from("learners")
      .update({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        client_id: form.client_id || null,
        job_title: form.job_title.trim() || null,
        birth_date: form.birth_date || null,
        gender: form.gender || null,
        nationality: form.nationality.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        postal_code: form.postal_code.trim() || null,
        social_security_number: form.social_security_number.trim() || null,
        education_level: form.education_level || null,
      })
      .eq("id", learner.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Enregistré" });
      setEditing(false);
      fetchLearner();
    }
    setSaving(false);
  };

  async function handleCreateAccess() {
    if (!learner?.email) return;
    setCreatingAccess(true);
    try {
      const res = await fetch("/api/admin/create-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: learner.email,
          first_name: learner.first_name,
          last_name: learner.last_name,
          role: "learner",
          entity_type: "learner",
          entity_type_id: learner.id,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAccessCreated(data);
        toast({ title: "Accès créé" });
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
    setCreatingAccess(false);
  }

  async function handleSendAccessEmail() {
    if (!accessCreated || !learner) return;
    const body = `Bonjour ${learner.first_name},\n\nVotre accès à la plateforme de formation a été créé.\n\nEmail: ${accessCreated.email}\nMot de passe: ${accessCreated.password}\n\nConnectez-vous ici: ${accessCreated.login_url}\n\nCordialement,\nL'équipe formation`;
    try {
      await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: accessCreated.email, subject: "Vos accès plateforme formation", body }),
      });
      toast({ title: "Accès envoyés par email" });
    } catch {
      toast({ title: "Erreur d'envoi", variant: "destructive" });
    }
  }

  async function handleToggleAccess() {
    if (!learner?.profile_id) return;
    setTogglingAccess(true);
    try {
      const res = await fetch("/api/admin/toggle-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: learner.profile_id, is_active: !learnerActive }),
      });
      const data = await res.json();
      if (res.ok) {
        setLearnerActive(!learnerActive);
        toast({ title: data.message });
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
    setTogglingAccess(false);
  }

  useEffect(() => {
    if (!accessCreated?.login_url) return;
    const el = document.getElementById("qr-access");
    if (el) {
      el.innerHTML = "";
      const canvas = document.createElement("canvas");
      QRCode.toCanvas(canvas, accessCreated.login_url, { width: 120 }, (err: Error | null | undefined) => {
        if (!err) el.appendChild(canvas);
      });
    }
  }, [accessCreated]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-[#374151] animate-spin" />
      </div>
    );
  }

  if (!learner) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Apprenant introuvable</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/admin/clients/apprenants")}>
          Retour
        </Button>
      </div>
    );
  }

  const toggleEdit = () => setEditing(!editing);

  const formatDate = (d: string | undefined) =>
    d ? new Date(d).toLocaleDateString("fr-FR") : "—";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-5">
        <button onClick={() => router.back()} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-3">
          <ArrowLeft className="h-3 w-3" /> Retour
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{learner.first_name} {learner.last_name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              {learner.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{learner.email}</span>}
              {learner.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{learner.phone}</span>}
              {company && <Link href={`/admin/clients/${company.id}`} className="flex items-center gap-1 text-[#374151] hover:underline"><Building2 className="h-3 w-3" />{company.company_name}</Link>}
              {learner.profile_id && (learner as unknown as Record<string, string>).welcome_email_sent_at ? (
                <span className="flex items-center gap-1 text-green-600"><ShieldCheck className="h-3 w-3" />Accès envoyé</span>
              ) : learner.profile_id ? (
                <span className="flex items-center gap-1 text-amber-600"><Key className="h-3 w-3" />Accès créé, email non envoyé</span>
              ) : (
                <span className="flex items-center gap-1 text-gray-400"><Key className="h-3 w-3" />Pas d&apos;accès</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!learner.profile_id && learner.email && (
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handleCreateAccess} disabled={creatingAccess}>
                <Key className="h-3 w-3" /> {creatingAccess ? "Création..." : "Créer un accès"}
              </Button>
            )}
            {learner.profile_id && (
              <Button
                size="sm"
                variant="outline"
                className={cn("text-xs gap-1.5", learnerActive ? "text-red-500 hover:text-red-600 hover:bg-red-50" : "text-green-600 hover:text-green-700 hover:bg-green-50")}
                onClick={handleToggleAccess}
                disabled={togglingAccess}
              >
                {togglingAccess ? <Loader2 className="h-3 w-3 animate-spin" /> : learnerActive ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                {learnerActive ? "Suspendre" : "Réactiver"}
              </Button>
            )}
            {learner.email && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1.5"
                disabled={sendingWelcome}
                onClick={async () => {
                  setSendingWelcome(true);
                  try {
                    const res = await fetch(`/api/learners/${learner.id}/send-welcome`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({}),
                    });
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
                    toast({ title: "Lien d'accès envoyé", description: `Email envoyé à ${learner.email}` });
                  } catch (err) {
                    toast({ title: "Erreur", description: err instanceof Error ? err.message : "Envoi échoué", variant: "destructive" });
                  } finally {
                    setSendingWelcome(false);
                  }
                }}
              >
                {sendingWelcome ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                Envoyer lien d&apos;accès
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={toggleEdit}>
              <Pencil className="h-3 w-3" /> {editing ? "Annuler" : "Modifier"}
            </Button>
          </div>
        </div>
      </div>

      {accessCreated && (
        <div className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-3 mx-6 mt-4">
          <p className="text-sm font-semibold text-green-800">Accès plateforme créé</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Email:</span> <span className="font-mono">{accessCreated.email}</span></div>
            <div><span className="text-gray-500">Mot de passe:</span> <span className="font-mono font-bold">{accessCreated.password}</span></div>
          </div>
          <div className="flex items-center gap-4">
            <div id="qr-access" />
            <div className="space-y-2">
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handleSendAccessEmail}>
                <Mail className="h-3 w-3" /> Envoyer par email
              </Button>
              <p className="text-[10px] text-gray-400">Le QR code redirige vers la page de connexion</p>
            </div>
          </div>
        </div>
      )}

      {/* Two columns */}
      <div className="flex flex-col md:flex-row gap-0 min-h-0 md:min-h-[calc(100vh-200px)]">
        {/* LEFT: Formations (2/3) */}
        <div className="flex-1 p-6 space-y-6">
          {/* Quick stats */}
          <div className="flex items-center gap-6 text-xs text-gray-500">
            <span><span className="font-bold text-sm text-gray-900">{sessions.length}</span> formation{sessions.length !== 1 ? "s" : ""}</span>
            <span><span className="font-bold text-sm text-gray-900">{elearning.length}</span> e-learning</span>
            {sessions.filter(s => s.status === "completed").length > 0 && (
              <span><span className="font-bold text-sm text-green-600">{sessions.filter(s => s.status === "completed").length}</span> terminée{sessions.filter(s => s.status === "completed").length > 1 ? "s" : ""}</span>
            )}
          </div>

          {/* Sessions de formation */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sessions de formation ({sessions.length})</h3>
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune session de formation.</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((enrollment) => (
                  <div key={enrollment.id} className="border rounded-lg p-3 hover:bg-gray-50 transition">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{enrollment.session?.training?.title || enrollment.session?.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(enrollment.session?.start_date)} — {formatDate(enrollment.session?.end_date)}</p>
                      </div>
                      <Badge className={enrollment.status === "completed" ? "bg-green-100 text-green-700" : enrollment.status === "confirmed" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}>
                        {enrollment.status === "completed" ? "Terminée" : enrollment.status === "confirmed" ? "Confirmé" : "Inscrit"}
                      </Badge>
                    </div>
                    {enrollment.completion_rate > 0 && (
                      <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-[#374151] h-1.5 rounded-full" style={{ width: `${enrollment.completion_rate}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* E-Learning */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">E-Learning ({elearning.length})</h3>
            {elearning.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun cours inscrit.</p>
            ) : (
              <div className="space-y-2">
                {elearning.map((e) => (
                  <div key={e.id} className="border rounded-lg p-3 hover:bg-gray-50 transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <BookOpen className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium">{e.elearning_courses?.title ?? "Cours inconnu"}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {e.elearning_courses?.estimated_duration_minutes ?? 0} min
                          </p>
                        </div>
                      </div>
                      <Badge className={cn("text-xs", e.status === "completed" ? "bg-green-100 text-green-700" : e.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600")}>
                        {e.status === "completed" ? "Terminé" : e.status === "in_progress" ? "En cours" : "Inscrit"}
                      </Badge>
                    </div>
                    <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-[#374151] h-1.5 rounded-full transition-all" style={{ width: `${e.progress ?? 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Infos (1/3) */}
        <div className="w-full md:w-80 shrink-0 bg-white border-t md:border-t-0 md:border-l p-6 space-y-6">
          {/* Company */}
          {company && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Entreprise</h3>
              <Link href={`/admin/clients/${company.id}`} className="text-sm text-[#374151] hover:underline flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />{company.company_name}
              </Link>
            </div>
          )}

          {/* Personal info */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Informations</h3>
            {editing ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Prénom</Label>
                  <Input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nom</Label>
                  <Input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Téléphone</Label>
                  <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Building2 className="h-3 w-3" /> Entreprise</Label>
                  <select
                    value={form.client_id}
                    onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#374151] bg-white"
                  >
                    <option value="">— Aucune entreprise —</option>
                    {clientOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Poste / Fonction</Label>
                  <Input value={form.job_title} onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))} placeholder="Ex: Aide-soignant(e)" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Genre</Label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#374151] bg-white"
                  >
                    <option value="">— Non renseigné —</option>
                    <option value="M">Homme</option>
                    <option value="F">Femme</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Date de naissance</Label>
                  <Input type="date" value={form.birth_date} onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nationalité</Label>
                  <Input value={form.nationality} onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))} placeholder="Française" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">N° Sécurité sociale</Label>
                  <div className="relative">
                    <Input
                      type={showSSN ? "text" : "password"}
                      value={form.social_security_number}
                      onChange={(e) => setForm((f) => ({ ...f, social_security_number: e.target.value }))}
                      placeholder="1 23 45 67 890 123 45"
                    />
                    <button type="button" onClick={() => setShowSSN(!showSSN)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700">
                      {showSSN ? "Masquer" : "Afficher"}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Niveau de formation</Label>
                  <select
                    value={form.education_level}
                    onChange={(e) => setForm((f) => ({ ...f, education_level: e.target.value }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#374151] bg-white"
                  >
                    <option value="">— Non renseigné —</option>
                    <option value="bac_moins">Inférieur au Bac</option>
                    <option value="bac">Bac</option>
                    <option value="bac_plus_2">Bac+2</option>
                    <option value="bac_plus_3">Bac+3 (Licence)</option>
                    <option value="bac_plus_5">Bac+5 (Master)</option>
                    <option value="bac_plus_8">Bac+8 (Doctorat)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Adresse</Label>
                  <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Numéro et rue" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Ville</Label>
                    <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Code postal</Label>
                    <Input value={form.postal_code} onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1 flex-1" style={{ background: "#374151" }}>
                    <Save className="h-3.5 w-3.5" /> {saving ? "..." : "Enregistrer"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Email</span><span className="text-gray-700">{learner?.email || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Téléphone</span><span className="text-gray-700">{learner?.phone || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Poste</span><span className="text-gray-700">{(learner as any)?.job_title || "—"}</span></div>

                <hr className="border-gray-100" />

                <div className="flex justify-between"><span className="text-gray-400">Genre</span><span className="text-gray-700">{(learner as any)?.gender === "M" ? "Homme" : (learner as any)?.gender === "F" ? "Femme" : (learner as any)?.gender === "autre" ? "Autre" : "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Naissance</span><span className="text-gray-700">{(learner as any)?.birth_date ? formatDate((learner as any).birth_date) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Nationalité</span><span className="text-gray-700">{(learner as any)?.nationality || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Niveau</span><span className="text-gray-700">{(learner as any)?.education_level || "—"}</span></div>

                {((learner as any)?.address || (learner as any)?.city) && (
                  <>
                    <hr className="border-gray-100" />
                    <div>
                      <span className="text-gray-400 block mb-0.5">Adresse</span>
                      <p className="text-gray-700">
                        {(learner as any).address}{(learner as any).address && (learner as any).city ? ", " : ""}
                        {(learner as any).postal_code} {(learner as any).city}
                      </p>
                    </div>
                  </>
                )}

                <hr className="border-gray-100" />
                <div className="flex justify-between"><span className="text-gray-400">Inscrit depuis</span><span className="text-gray-700">{learner?.created_at ? formatDate(learner.created_at) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Accès plateforme</span><span className={learner?.profile_id ? "text-green-600" : "text-gray-300"}>{learner?.profile_id ? "Actif" : "Non créé"}</span></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
