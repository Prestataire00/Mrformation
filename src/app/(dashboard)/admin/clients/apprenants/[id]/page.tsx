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
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Save,
  User,
  X,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";

interface LearnerDetail {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  client_id: string | null;
  clients: { company_name: string } | null;
  avatar_url?: string | null;
}

interface ClientOption {
  id: string;
  company_name: string;
}

interface Enrollment {
  id: string;
  status: string;
  progress: number;
  elearning_courses: {
    id: string;
    title: string;
    estimated_duration_minutes: number;
  } | null;
}

interface SessionAttendance {
  id: string;
  sessions: {
    id: string;
    start_date: string;
    end_date: string;
    trainings: { title: string } | null;
  } | null;
}

export default function LearnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
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
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [sessions, setSessions] = useState<SessionAttendance[]>([]);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);

  const fetchLearner = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("learners")
      .select("id, first_name, last_name, email, phone, client_id, job_title, birth_date, gender, nationality, address, city, postal_code, social_security_number, education_level, clients(company_name)")
      .eq("id", learnerId)
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
      .order("company_name");
    setClientOptions((clientsData as ClientOption[]) ?? []);

    // Fetch enrollments
    const { data: enrollData } = await supabase
      .from("elearning_enrollments")
      .select("id, status, progress, elearning_courses(id, title, estimated_duration_minutes)")
      .eq("learner_id", learnerId);
    setEnrollments((enrollData as unknown as Enrollment[]) ?? []);

    // Fetch session attendance
    const { data: sessData } = await supabase
      .from("session_learners")
      .select("id, sessions(id, start_date, end_date, trainings(title))")
      .eq("learner_id", learnerId);
    setSessions((sessData as unknown as SessionAttendance[]) ?? []);

    setLoading(false);
  }, [learnerId]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-[#3DB5C5] animate-spin" />
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

  const initials = getInitials(learner.first_name, learner.last_name);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin" className="text-[#3DB5C5] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/clients/apprenants" className="text-[#3DB5C5] hover:underline">Apprenants</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500">{learner.first_name} {learner.last_name}</span>
      </div>

      {/* Back button */}
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#3DB5C5]">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>

      {/* Profile card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 ring-2 ring-gray-100">
            {learner.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={learner.avatar_url} alt={`${learner.first_name} ${learner.last_name}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white font-bold text-xl" style={{ background: "#3DB5C5" }}>
                {initials}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                {editing ? (
                  <div className="grid grid-cols-2 gap-3 mb-3">
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
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs flex items-center gap-1"><Building2 className="h-3 w-3" /> Entreprise</Label>
                      <select
                        value={form.client_id}
                        onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5] bg-white"
                      >
                        <option value="">— Aucune entreprise —</option>
                        {clientOptions.map((c) => (
                          <option key={c.id} value={c.id}>{c.company_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <>
                    <h1 className="text-xl font-bold text-gray-900">{learner.first_name} {learner.last_name}</h1>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                      <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-gray-400" />{learner.email}</span>
                      {learner.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-gray-400" />{learner.phone}</span>}
                      {learner.clients?.company_name && <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-gray-400" />{learner.clients.company_name}</span>}
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)} className="gap-1"><X className="h-3.5 w-3.5" /> Annuler</Button>
                    <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1" style={{ background: "#3DB5C5" }}><Save className="h-3.5 w-3.5" /> {saving ? "..." : "Enregistrer"}</Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1"><Pencil className="h-3.5 w-3.5" /> Modifier</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Informations personnelles */}
      {editing && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Informations personnelles</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Poste / Fonction</Label>
              <Input
                value={form.job_title}
                onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
                placeholder="Ex: Aide-soignant(e)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Genre</Label>
              <select
                value={form.gender}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5] bg-white"
              >
                <option value="">— Non renseigné —</option>
                <option value="M">Homme</option>
                <option value="F">Femme</option>
                <option value="autre">Autre</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Date de naissance</Label>
              <Input
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nationalité</Label>
              <Input
                value={form.nationality}
                onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))}
                placeholder="Française"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Numéro de sécurité sociale</Label>
            <div className="relative">
              <Input
                type={showSSN ? "text" : "password"}
                value={form.social_security_number}
                onChange={(e) => setForm((f) => ({ ...f, social_security_number: e.target.value }))}
                placeholder="1 23 45 67 890 123 45"
              />
              <button
                type="button"
                onClick={() => setShowSSN(!showSSN)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
              >
                {showSSN ? "Masquer" : "Afficher"}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Niveau de formation</Label>
            <select
              value={form.education_level}
              onChange={(e) => setForm((f) => ({ ...f, education_level: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DB5C5] bg-white"
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
        </div>
      )}

      {/* Adresse */}
      {editing && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Adresse</h2>
          <div className="space-y-1.5">
            <Label>Adresse complète</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Numéro et rue"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Ville</Label>
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Code postal</Label>
              <Input
                value={form.postal_code}
                onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* E-Learning Enrollments */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-[#3DB5C5]" />
          Cours E-Learning ({enrollments.length})
        </h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun cours inscrit.</p>
        ) : (
          <div className="space-y-2">
            {enrollments.map((e) => (
              <div key={e.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{e.elearning_courses?.title ?? "Cours inconnu"}</p>
                    <p className="text-xs text-gray-400">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {e.elearning_courses?.estimated_duration_minutes ?? 0} min
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-[#3DB5C5] transition-all" style={{ width: `${e.progress ?? 0}%` }} />
                  </div>
                  <Badge className={cn("text-xs", e.status === "completed" ? "bg-green-100 text-green-700" : e.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600")}>
                    {e.status === "completed" ? "Terminé" : e.status === "in_progress" ? "En cours" : "Inscrit"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Training Sessions */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[#3DB5C5]" />
          Sessions de formation ({sessions.length})
        </h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune session de formation.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.sessions?.trainings?.title ?? "Formation"}</p>
                    <p className="text-xs text-gray-400">
                      {s.sessions?.start_date ? new Date(s.sessions.start_date).toLocaleDateString("fr-FR") : "—"}
                      {s.sessions?.end_date ? ` — ${new Date(s.sessions.end_date).toLocaleDateString("fr-FR")}` : ""}
                    </p>
                  </div>
                </div>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
