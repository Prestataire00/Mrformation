"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Users,
  Plus,
  Search,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  KeyRound,
  X,
  ChevronDown,
  Pencil,
  Mail,
  BookOpen,
} from "lucide-react";
import { useEntity } from "@/contexts/EntityContext";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: string;
  avatar_url: string | null;
  created_at: string;
  source?: string; // "profile" | "learner" | "trainer"
}

interface EnrollmentEntry {
  id: string;
  status: string;
  enrolled_at: string;
  session: {
    id: string;
    start_date: string | null;
    end_date: string | null;
    training: {
      title: string;
    } | null;
  } | null;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Organisme",
  admin: "Administrateur",
  commercial: "Commercial",
  trainer: "Formateur",
  client: "Entreprise",
  learner: "Apprenant",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-indigo-100 text-indigo-700",
  admin: "bg-blue-100 text-blue-700",
  commercial: "bg-pink-100 text-pink-700",
  trainer: "bg-green-100 text-green-700",
  client: "bg-purple-100 text-purple-700",
  learner: "bg-orange-100 text-orange-700",
};

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const STATUS_LABELS: Record<string, string> = {
  registered: "Inscrit",
  confirmed: "Confirmé",
  cancelled: "Annulé",
  completed: "Terminé",
};

const STATUS_COLORS: Record<string, string> = {
  registered: "bg-blue-50 text-blue-700",
  confirmed: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
  completed: "bg-gray-100 text-gray-600",
};

export default function UsersPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    role: "learner",
    phone: "",
  });
  const [showPassword, setShowPassword] = useState(false);

  // Password change modal
  const [passwordModal, setPasswordModal] = useState<{ userId: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Email dialog
  const { entityId } = useEntity();
  const { toast } = useToast();
  const [emailUserDialog, setEmailUserDialog] = useState(false);
  const [emailUserTarget, setEmailUserTarget] = useState<UserProfile | null>(null);
  const [emailUserForm, setEmailUserForm] = useState({ subject: "", body: "", templateId: "" });
  const [sendingUserEmail, setSendingUserEmail] = useState(false);
  const [userTemplates, setUserTemplates] = useState<Array<{ id: string; name: string; subject: string; body: string }>>([]);

  // Edit user modal
  const [editModal, setEditModal] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone: "", role: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Formations modal
  const [formationsModal, setFormationsModal] = useState<{ userId: string; name: string } | null>(null);
  const [formations, setFormations] = useState<EnrollmentEntry[]>([]);
  const [loadingFormations, setLoadingFormations] = useState(false);

  // Delete
  const [deleting, setDeleting] = useState<string | null>(null);

  // Rôle de l'utilisateur connecté (pour hiérarchie)
  const currentUserRole = getCookie("user_role") || "admin";
  const isSuperAdmin = currentUserRole === "super_admin";

  // Sections collapsées par rôle
  const [collapsedRoles, setCollapsedRoles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!entityId) return;
    supabase.from("email_templates").select("id, name, subject, body").eq("entity_id", entityId)
      .then(({ data }) => setUserTemplates(data ?? []));
  }, [supabase, entityId]);

  async function handleSendUserEmail() {
    if (!emailUserTarget?.email || !emailUserForm.subject.trim()) return;
    setSendingUserEmail(true);
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailUserTarget.email, subject: emailUserForm.subject, body: emailUserForm.body }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        if (result.simulated) {
          toast({ title: "⚠️ Email non envoyé", description: "RESEND_API_KEY non configurée", variant: "destructive" });
        } else {
          toast({ title: "Email envoyé" });
        }
        setEmailUserDialog(false);
      } else {
        toast({ title: "Erreur", description: result.error, variant: "destructive" });
      }
    } catch { toast({ title: "Erreur réseau", variant: "destructive" }); }
    finally { setSendingUserEmail(false); }
  }

  async function loadUsers() {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    const json = await res.json();
    if (json.data) {
      setUsers(json.data);
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    setFormSuccess(null);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const json = await res.json();

    if (!res.ok) {
      setFormError(json.error || "Erreur lors de la création");
      setCreating(false);
      return;
    }

    setFormSuccess(`Utilisateur ${form.first_name} ${form.last_name} créé avec succès !`);
    setForm({ email: "", password: "", first_name: "", last_name: "", role: "learner", phone: "" });
    setCreating(false);
    loadUsers();

    setTimeout(() => {
      setFormSuccess(null);
      setShowForm(false);
    }, 2000);
  }

  async function handleChangePassword() {
    if (!passwordModal) return;

    if (newPassword.length < 6) {
      setPasswordError("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Les mots de passe ne correspondent pas");
      return;
    }

    setChangingPassword(true);
    setPasswordError(null);

    const res = await fetch("/api/admin/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: passwordModal.userId, newPassword }),
    });

    const json = await res.json();
    if (!res.ok) {
      setPasswordError(json.error || "Erreur");
      setChangingPassword(false);
      return;
    }

    setPasswordModal(null);
    setNewPassword("");
    setConfirmPassword("");
    setChangingPassword(false);
  }

  function openEditModal(u: UserProfile) {
    setEditModal(u);
    setEditForm({
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      phone: u.phone || "",
      role: u.role,
    });
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editModal) return;
    if (!editForm.first_name || !editForm.last_name || !editForm.email) {
      setEditError("Prénom, nom et email sont obligatoires");
      return;
    }

    setEditSaving(true);
    setEditError(null);

    const res = await fetch(`/api/admin/users/${editModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editForm, source: editModal.source }),
    });

    const json = await res.json();
    if (!res.ok) {
      setEditError(json.error || "Erreur lors de la sauvegarde");
      setEditSaving(false);
      return;
    }

    setEditModal(null);
    setEditSaving(false);
    loadUsers();
  }

  async function openFormationsModal(u: UserProfile) {
    setFormationsModal({ userId: u.id, name: `${u.first_name} ${u.last_name}` });
    setFormations([]);
    setLoadingFormations(true);

    const { data, error } = await supabase
      .from("enrollments")
      .select(`
        id,
        status,
        enrolled_at,
        session:sessions(
          id,
          start_date,
          end_date,
          training:trainings(title)
        )
      `)
      .eq("learner_id", u.id)
      .order("enrolled_at", { ascending: false });

    if (!error && data) {
      setFormations(data as unknown as EnrollmentEntry[]);
    }
    setLoadingFormations(false);
  }

  // Un admin ne peut pas supprimer un autre admin ou super_admin
  function canDeleteUser(u: UserProfile): boolean {
    if (isSuperAdmin) return true; // super_admin peut tout supprimer
    if (u.role === "super_admin" || u.role === "admin") return false; // admin ne peut pas supprimer admin/super_admin
    return true;
  }

  // Un admin ne peut pas modifier le rôle d'un admin ou super_admin
  function canEditUser(u: UserProfile): boolean {
    if (isSuperAdmin) return true;
    if (u.role === "super_admin" || u.role === "admin") return false;
    return true;
  }

  async function handleDelete(u: UserProfile) {
    if (!canDeleteUser(u)) return;
    if (!confirm(`Supprimer l'utilisateur ${u.first_name} ${u.last_name} ? Cette action est irréversible.`)) return;
    setDeleting(u.id);

    if (u.source === "profile") {
      // Use the API to delete both profile and auth user
      await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    } else {
      // For learners/trainers without auth accounts, delete directly
      const table = u.source === "learner" ? "learners" : "trainers";
      await supabase.from(table).delete().eq("id", u.id);
    }

    setUsers((prev) => prev.filter((x) => x.id !== u.id));
    setDeleting(null);
  }

  const ROLE_ORDER: Record<string, number> = { super_admin: 0, admin: 1, commercial: 2, trainer: 3, client: 4, learner: 5 };

  const filtered = users
    .filter((u) => {
      const matchSearch =
        !search ||
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchRole = !roleFilter || u.role === roleFilter;
      return matchSearch && matchRole;
    })
    .sort((a, b) => {
      const roleA = ROLE_ORDER[a.role] ?? 99;
      const roleB = ROLE_ORDER[b.role] ?? 99;
      if (roleA !== roleB) return roleA - roleB;
      return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "fr");
    });

  const counts = {
    total: users.length,
    super_admin: users.filter((u) => u.role === "super_admin").length,
    admin: users.filter((u) => u.role === "admin").length,
    commercial: users.filter((u) => u.role === "commercial").length,
    trainer: users.filter((u) => u.role === "trainer").length,
    client: users.filter((u) => u.role === "client").length,
    learner: users.filter((u) => u.role === "learner").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6" />
            Gestion des Utilisateurs
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Créez et gérez les comptes utilisateurs de votre organisme
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Nouvel Utilisateur
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Total", count: counts.total, color: "bg-gray-100 text-gray-700" },
          { label: "Administrateurs", count: counts.admin, color: "bg-blue-50 text-blue-700" },
          { label: "Formateurs", count: counts.trainer, color: "bg-green-50 text-green-700" },
          { label: "Entreprises", count: counts.client, color: "bg-purple-50 text-purple-700" },
          { label: "Apprenants", count: counts.learner, color: "bg-orange-50 text-orange-700" },
        ].map((stat) => {
          const roleMap: Record<string, string> = { "Administrateurs": "admin", "Formateurs": "trainer", "Entreprises": "client", "Apprenants": "learner" };
          const role = roleMap[stat.label];
          const isActive = role && roleFilter === role;
          return (
            <div
              key={stat.label}
              onClick={() => { if (role) setRoleFilter(roleFilter === role ? "" : role); }}
              className={`rounded-lg p-4 cursor-pointer transition-all border-2 ${
                isActive ? "border-[#3DB5C5]" : "border-transparent hover:border-gray-300"
              } ${stat.color}`}
            >
              <p className="text-2xl font-bold">{stat.count}</p>
              <p className="text-xs font-medium opacity-70">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white border rounded-xl p-6">
          <h2 className="font-semibold text-lg mb-4">Créer un nouvel utilisateur</h2>

          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">
              {formError}
            </div>
          )}
          {formSuccess && (
            <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm mb-4">
              {formSuccess}
            </div>
          )}

          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
              <input
                type="text"
                required
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Jean"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input
                type="text"
                required
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Dupont"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="jean.dupont@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="06 12 34 56 78"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe *</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                  placeholder="Min. 6 caractères"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Type d&apos;utilisateur *</label>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { role: "admin", label: "Administrateur", icon: "👤", desc: "Accès complet" },
                  { role: "trainer", label: "Formateur", icon: "🎓", desc: "Gère les formations" },
                  { role: "learner", label: "Apprenant", icon: "📚", desc: "Suit les formations" },
                  { role: "client", label: "Entreprise", icon: "🏢", desc: "Accès entreprise" },
                ].map(({ role, label, icon, desc }) => (
                  <div
                    key={role}
                    onClick={() => setForm((f) => ({ ...f, role }))}
                    className={`p-3 border rounded-lg cursor-pointer transition-all text-center ${
                      form.role === role ? "border-[#3DB5C5] bg-teal-50" : "hover:border-gray-300"
                    }`}
                  >
                    <p className="text-2xl mb-1">{icon}</p>
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Créer l&apos;utilisateur
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">Tous les rôles</option>
          {isSuperAdmin && <option value="super_admin">Organisme</option>}
          <option value="admin">Administrateur</option>
          <option value="commercial">Commercial</option>
          <option value="trainer">Formateur</option>
          <option value="client">Entreprise</option>
          <option value="learner">Apprenant</option>
        </select>
      </div>

      {/* Sections par rôle (collapsables) */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white border rounded-xl">
          {users.length === 0
            ? "Aucun utilisateur trouvé. Créez le premier !"
            : "Aucun résultat pour cette recherche."}
        </div>
      ) : (
        <div className="space-y-3">
          {(() => {
            const ROLE_SECTION_STYLES: Record<string, { bg: string; border: string; text: string; headerBg: string }> = {
              super_admin: { bg: "bg-white", border: "border-indigo-200", text: "text-indigo-800", headerBg: "bg-indigo-50" },
              admin:       { bg: "bg-white", border: "border-blue-200",   text: "text-blue-800",   headerBg: "bg-blue-50" },
              commercial:  { bg: "bg-white", border: "border-pink-200",   text: "text-pink-800",   headerBg: "bg-pink-50" },
              trainer:     { bg: "bg-white", border: "border-green-200",  text: "text-green-800",  headerBg: "bg-green-50" },
              client:      { bg: "bg-white", border: "border-purple-200", text: "text-purple-800", headerBg: "bg-purple-50" },
              learner:     { bg: "bg-white", border: "border-orange-200", text: "text-orange-800", headerBg: "bg-orange-50" },
            };

            const roleOrder = ["super_admin", "admin", "commercial", "trainer", "client", "learner"];
            const groups = roleOrder
              .map((role) => ({
                role,
                users: filtered.filter((u) => u.role === role),
              }))
              .filter((g) => g.users.length > 0);

            return groups.map((group) => {
              const style = ROLE_SECTION_STYLES[group.role] || { bg: "bg-white", border: "border-gray-200", text: "text-gray-800", headerBg: "bg-gray-50" };
              const isCollapsed = collapsedRoles[group.role] ?? false;

              return (
                <div key={group.role} className={`border rounded-xl overflow-hidden ${style.border}`}>
                  <button
                    onClick={() => setCollapsedRoles((prev) => ({ ...prev, [group.role]: !prev[group.role] }))}
                    className={`w-full flex items-center justify-between px-4 py-3 ${style.headerBg} ${style.text} hover:opacity-80 transition-opacity`}
                  >
                    <span className="font-semibold text-sm">
                      {ROLE_LABELS[group.role] || group.role}s ({group.users.length})
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? "" : "rotate-180"}`} />
                  </button>

                  {!isCollapsed && (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-t border-b">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Nom</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Rôle</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Email</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Téléphone</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Créé le</th>
                          <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {group.users.map((u) => (
                          <tr key={u.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {u.first_name} {u.last_name}
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={`${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"} text-xs`}>
                                {ROLE_LABELS[u.role] ?? u.role}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{u.email}</td>
                            <td className="px-4 py-3 text-gray-600">{u.phone || "—"}</td>
                            <td className="px-4 py-3 text-gray-500">
                              {new Date(u.created_at).toLocaleDateString("fr-FR")}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {/* Modifier */}
                                {canEditUser(u) && (
                                  <button
                                    onClick={() => openEditModal(u)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                                  >
                                    <Pencil className="w-3.5 h-3.5" /> Modifier
                                  </button>
                                )}

                                {/* Email via Resend */}
                                <button
                                  onClick={() => {
                                    setEmailUserTarget(u);
                                    setEmailUserForm({ subject: "", body: "", templateId: "" });
                                    setEmailUserDialog(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                                >
                                  <Mail className="w-3.5 h-3.5" /> Email
                                </button>

                                {/* Formations */}
                                {u.role === "learner" && (
                                  <button
                                    onClick={() => openFormationsModal(u)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded"
                                  >
                                    <BookOpen className="w-3.5 h-3.5" /> Formations
                                  </button>
                                )}

                                {/* Changer le mot de passe (utilisateurs auth uniquement, respect hiérarchie) */}
                                {u.source === "profile" && (isSuperAdmin || (u.role !== "admin" && u.role !== "super_admin")) && (
                                  <button
                                    onClick={() => {
                                      setPasswordModal({ userId: u.id, name: `${u.first_name} ${u.last_name}` });
                                      setNewPassword("");
                                      setConfirmPassword("");
                                      setPasswordError(null);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                                  >
                                    <KeyRound className="w-3.5 h-3.5" /> Mot de passe
                                  </button>
                                )}

                                {canDeleteUser(u) && (
                                  <button
                                    onClick={() => handleDelete(u)}
                                    disabled={deleting === u.id}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-50"
                                  >
                                    {deleting === u.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <><Trash2 className="w-3.5 h-3.5" /> Supprimer</>
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* Password Change Modal */}
      {passwordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-600" />
                Changer le mot de passe
              </h3>
              <button
                onClick={() => { setPasswordModal(null); setNewPassword(""); setConfirmPassword(""); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Nouveau mot de passe pour <strong>{passwordModal.name}</strong>
            </p>
            {passwordError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm mb-3">
                {passwordError}
              </div>
            )}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 6 caractères"
                    className="w-full px-3 py-2 border rounded-lg text-sm pr-10"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Confirmer le mot de passe</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Répétez le mot de passe"
                    className="w-full px-3 py-2 border rounded-lg text-sm pr-10"
                    onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setPasswordModal(null); setNewPassword(""); setConfirmPassword(""); }}
                className="px-4 py-2 text-sm text-gray-600"
              >
                Annuler
              </button>
              <button
                onClick={handleChangePassword}
                disabled={changingPassword}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {changingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" />
                Modifier l&apos;utilisateur
              </h3>
              <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm mb-4">
                {editError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prénom *</label>
                <input
                  type="text"
                  value={editForm.first_name}
                  onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
                <input
                  type="text"
                  value={editForm.last_name}
                  onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="06 12 34 56 78"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rôle</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  disabled={editModal.source !== "profile"}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="learner">Apprenant</option>
                  <option value="trainer">Formateur</option>
                  <option value="client">Entreprise</option>
                  <option value="commercial">Commercial</option>
                  {isSuperAdmin && <option value="admin">Administrateur</option>}
                  {isSuperAdmin && <option value="super_admin">Organisme</option>}
                </select>
                {editModal.source !== "profile" && (
                  <p className="text-xs text-gray-400 mt-1">Le rôle ne peut être modifié que pour les utilisateurs avec un compte.</p>
                )}
                {!isSuperAdmin && (editModal.role === "admin" || editModal.role === "super_admin") && (
                  <p className="text-xs text-amber-600 mt-1">Seul un Organisme peut modifier le rôle d&apos;un administrateur.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setEditModal(null)} className="px-4 py-2 text-sm text-gray-600">
                Annuler
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {editSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Formations Modal */}
      {formationsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-orange-600" />
                Formations de {formationsModal.name}
              </h3>
              <button onClick={() => setFormationsModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingFormations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : formations.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                Aucune formation inscrite
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {formations.map((enroll) => (
                  <div key={enroll.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">
                        {enroll.session?.training?.title || "Formation sans titre"}
                      </p>
                      {enroll.session?.start_date && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(enroll.session.start_date).toLocaleDateString("fr-FR")}
                          {enroll.session.end_date && ` → ${new Date(enroll.session.end_date).toLocaleDateString("fr-FR")}`}
                        </p>
                      )}
                    </div>
                    <span className={`ml-3 shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[enroll.status] || "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[enroll.status] || enroll.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button onClick={() => setFormationsModal(null)} className="px-4 py-2 text-sm text-gray-600">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email User Dialog */}
      {emailUserDialog && emailUserTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold">Envoyer un email à {emailUserTarget.first_name} {emailUserTarget.last_name}</h2>
            <p className="text-sm text-gray-500">Destinataire : {emailUserTarget.email}</p>
            {userTemplates.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modèle</label>
                <select
                  value={emailUserForm.templateId}
                  onChange={(e) => {
                    const t = userTemplates.find((t) => t.id === e.target.value);
                    if (t) setEmailUserForm({ templateId: t.id, subject: t.subject, body: t.body });
                    else setEmailUserForm((f) => ({ ...f, templateId: "" }));
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">— Email libre —</option>
                  {userTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Objet *</label>
              <input
                value={emailUserForm.subject}
                onChange={(e) => setEmailUserForm((f) => ({ ...f, subject: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="Objet de l'email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                value={emailUserForm.body}
                onChange={(e) => setEmailUserForm((f) => ({ ...f, body: e.target.value }))}
                rows={6}
                className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                placeholder="Contenu de l'email..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEmailUserDialog(false)} className="px-4 py-2 border rounded-lg text-sm">Annuler</button>
              <button
                onClick={handleSendUserEmail}
                disabled={sendingUserEmail || !emailUserForm.subject.trim()}
                className="px-4 py-2 bg-[#3DB5C5] text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {sendingUserEmail && <Loader2 className="h-4 w-4 animate-spin" />}
                <Mail className="h-4 w-4" /> Envoyer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
