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
} from "lucide-react";

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

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  trainer: "Formateur",
  client: "Entreprise",
  learner: "Apprenant",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-blue-100 text-blue-700",
  trainer: "bg-green-100 text-green-700",
  client: "bg-purple-100 text-purple-700",
  learner: "bg-orange-100 text-orange-700",
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
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Delete
  const [deleting, setDeleting] = useState<string | null>(null);

  // Sections collapsées par rôle
  const [collapsedRoles, setCollapsedRoles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!passwordModal || newPassword.length < 6) {
      setPasswordError("Le mot de passe doit contenir au moins 6 caractères");
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
    setChangingPassword(false);
  }

  async function handleDelete(userId: string) {
    if (!confirm("Supprimer cet utilisateur ? Cette action est irréversible.")) return;
    setDeleting(userId);

    // Delete profile (auth user stays but can't access anything without a profile)
    await supabase.from("profiles").delete().eq("id", userId);
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setDeleting(null);
  }

  const ROLE_ORDER: Record<string, number> = { admin: 0, trainer: 1, client: 2, learner: 3 };

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
    admin: users.filter((u) => u.role === "admin").length,
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
        ].map((stat) => (
          <div key={stat.label} className={`rounded-lg p-4 ${stat.color}`}>
            <p className="text-2xl font-bold">{stat.count}</p>
            <p className="text-xs font-medium opacity-70">{stat.label}</p>
          </div>
        ))}
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rôle *</label>
              <select
                required
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="learner">Apprenant</option>
                <option value="trainer">Formateur</option>
                <option value="client">Entreprise</option>
                <option value="admin">Administrateur</option>
              </select>
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
          <option value="admin">Administrateur</option>
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
              admin:   { bg: "bg-white", border: "border-blue-200",   text: "text-blue-800",   headerBg: "bg-blue-50" },
              trainer: { bg: "bg-white", border: "border-green-200",  text: "text-green-800",  headerBg: "bg-green-50" },
              client:  { bg: "bg-white", border: "border-purple-200", text: "text-purple-800", headerBg: "bg-purple-50" },
              learner: { bg: "bg-white", border: "border-orange-200", text: "text-orange-800", headerBg: "bg-orange-50" },
            };

            // Group filtered users by role (preserving order)
            const roleOrder = ["admin", "trainer", "client", "learner"];
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
                  {/* Section header - cliquable */}
                  <button
                    onClick={() => setCollapsedRoles((prev) => ({ ...prev, [group.role]: !prev[group.role] }))}
                    className={`w-full flex items-center justify-between px-4 py-3 ${style.headerBg} ${style.text} hover:opacity-80 transition-opacity`}
                  >
                    <span className="font-semibold text-sm">
                      {ROLE_LABELS[group.role] || group.role}s ({group.users.length})
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? "" : "rotate-180"}`} />
                  </button>

                  {/* Table content */}
                  {!isCollapsed && (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-t border-b">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Nom</th>
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
                            <td className="px-4 py-3 text-gray-600">{u.email}</td>
                            <td className="px-4 py-3 text-gray-600">{u.phone || "—"}</td>
                            <td className="px-4 py-3 text-gray-500">
                              {new Date(u.created_at).toLocaleDateString("fr-FR")}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {u.source === "profile" && (
                                  <button
                                    onClick={() => {
                                      setPasswordModal({ userId: u.id, name: `${u.first_name} ${u.last_name}` });
                                      setNewPassword("");
                                      setPasswordError(null);
                                    }}
                                    title="Changer le mot de passe"
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                  >
                                    <KeyRound className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDelete(u.id)}
                                  disabled={deleting === u.id}
                                  title="Supprimer"
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                                >
                                  {deleting === u.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
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
              <h3 className="font-semibold text-lg">Changer le mot de passe</h3>
              <button onClick={() => setPasswordModal(null)} className="text-gray-400 hover:text-gray-600">
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
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nouveau mot de passe (min. 6 caractères)"
              className="w-full px-3 py-2 border rounded-lg text-sm mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPasswordModal(null)}
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
    </div>
  );
}
