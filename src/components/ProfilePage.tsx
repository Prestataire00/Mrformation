"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useToast } from "@/components/ui/use-toast";
import { useRef } from "react";
import {
  User,
  Mail,
  Phone,
  Building2,
  Save,
  Loader2,
  Shield,
  MapPin,
  Lock,
  Eye,
  EyeOff,
  Camera,
} from "lucide-react";

interface ProfileData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  role: string;
  avatar_url: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  trainer: "Formateur",
  client: "Client",
  learner: "Apprenant",
};

export function ProfilePage() {
  const supabase = createClient();
  const { entity } = useEntity();
  const { toast } = useToast();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // First try with address column, fallback without it if column doesn't exist yet
    let { data, error } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, address, role, avatar_url")
      .eq("id", user.id)
      .single();

    if (error && !data) {
      // address column may not exist yet — retry without it
      const res = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, role, avatar_url")
        .eq("id", user.id)
        .single();
      data = res.data as typeof data;
    }

    if (data) {
      const profile = data as Record<string, unknown>;
      setProfile({
        id: profile.id as string,
        first_name: (profile.first_name as string) || "",
        last_name: (profile.last_name as string) || "",
        email: (profile.email as string) || "",
        phone: (profile.phone as string) || null,
        address: (profile.address as string) || null,
        role: (profile.role as string) || "admin",
        avatar_url: (profile.avatar_url as string) || null,
      });
      setFirstName((profile.first_name as string) || "");
      setLastName((profile.last_name as string) || "");
      setPhone((profile.phone as string) || "");
      setAddress((profile.address as string) || "");
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);

    const payload: Record<string, unknown> = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
    };

    // Try with address first, fallback without
    let { error } = await supabase
      .from("profiles")
      .update({ ...payload, address: address.trim() || null })
      .eq("id", profile.id);

    if (error && error.message.includes("address")) {
      // address column doesn't exist yet — save without it
      const res = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profile.id);
      error = res.error;
    }

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profil mis à jour", description: "Vos informations ont été enregistrées." });
    }
    setSaving(false);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    if (!["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      toast({ title: "Format non supporté", description: "Utilisez JPG, PNG ou WebP.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Fichier trop grand", description: "Maximum 5 Mo.", variant: "destructive" });
      return;
    }

    setUploadingAvatar(true);
    const path = `${profile.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      // Bucket may not exist — store as data URL as fallback
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        await supabase.from("profiles").update({ avatar_url: dataUrl }).eq("id", profile.id);
        setProfile((p) => p ? { ...p, avatar_url: dataUrl } : p);
        toast({ title: "Photo de profil mise à jour" });
        setUploadingAvatar(false);
      };
      reader.readAsDataURL(file);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", profile.id);
    setProfile((p) => p ? { ...p, avatar_url: publicUrl } : p);
    toast({ title: "Photo de profil mise à jour" });
    setUploadingAvatar(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleChangePassword() {
    if (!newPassword.trim()) {
      toast({ title: "Erreur", description: "Veuillez saisir un nouveau mot de passe.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Erreur", description: "Le mot de passe doit contenir au moins 6 caractères.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas.", variant: "destructive" });
      return;
    }

    setChangingPassword(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Mot de passe modifié", description: "Votre mot de passe a été mis à jour avec succès." });
      setNewPassword("");
      setConfirmPassword("");
    }
    setChangingPassword(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20 text-gray-500">
        Profil introuvable
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mon Profil</h1>
        <p className="text-gray-500 text-sm mt-1">
          Gérez vos informations personnelles
        </p>
      </div>

      {/* Profile info card */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        {/* Header with avatar */}
        <div className="bg-gray-50 border-b border-gray-200 p-6">
          <div className="flex items-center gap-4">
            {/* Avatar with upload */}
            <div className="relative group">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <div
                className="w-16 h-16 rounded-full overflow-hidden cursor-pointer ring-2 ring-gray-200 group-hover:ring-[#DC2626] transition"
                onClick={() => fileInputRef.current?.click()}
              >
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
                    {firstName.charAt(0)}{lastName.charAt(0)}
                  </div>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#DC2626] text-white flex items-center justify-center shadow-sm hover:bg-[#2da5b5] transition"
                title="Changer la photo"
              >
                {uploadingAvatar
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Camera className="w-3 h-3" />
                }
              </button>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {firstName} {lastName}
              </h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <Shield className="w-3.5 h-3.5" />
                  {ROLE_LABELS[profile.role] || profile.role}
                </span>
                {entity && (
                  <span className="flex items-center gap-1 text-sm text-gray-500">
                    <Building2 className="w-3.5 h-3.5" />
                    {entity.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                Prénom
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                Nom
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              Email
            </label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
            />
            <p className="text-xs text-gray-400">
              L&apos;email ne peut pas être modifié
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" />
              Téléphone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="06 12 34 56 78"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              Adresse complète<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Adresse complète (y compris la ville)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
            />
          </div>

          <div className="pt-4 border-t border-gray-100">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-60"
              style={{ background: "#DC2626" }}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Enregistrer
            </button>
          </div>
        </div>
      </div>

      {/* Password change card */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-6">
          <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Modifier le mot de passe
          </h3>
          <p className="text-sm text-gray-500 mb-5">
            Choisissez un nouveau mot de passe pour votre compte
          </p>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Confirmer le mot de passe
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Retapez le mot de passe"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              />
            </div>

            <button
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-60"
              style={{ background: "#DC2626" }}
            >
              {changingPassword ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              Modifier le mot de passe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
