"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEntity } from "@/contexts/EntityContext";
import { useToast } from "@/components/ui/use-toast";
import {
  Copy,
  Check,
  Gift,
  Users,
  Star,
  Euro,
  CalendarCheck,
  Loader2,
  Handshake,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Referral {
  id: string;
  referred_name: string;
  referred_email: string | null;
  is_subscribed: boolean;
  created_at: string;
}

export default function ParrainagePage() {
  const supabase = createClient();
  const { toast } = useToast();
  const { entity } = useEntity();

  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [loading, setLoading] = useState(true);
  const [referrals, setReferrals] = useState<Referral[]>([]);

  const entitySlug = entity?.slug ?? "mr-formation";
  const entityName = entity?.name ?? "MR FORMATION";

  // Generate or load referral code
  useEffect(() => {
    const key = `referral_code_${entitySlug}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      setCode(stored);
    } else {
      // Format like the old CRM: prefix-userId-random
      const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const newCode = `${entitySlug.split("-")[0]}-${Math.floor(Math.random() * 999)}-${suffix}`;
      localStorage.setItem(key, newCode);
      setCode(newCode);
    }
  }, [entitySlug]);

  // Load referrals from DB (or mock data for now)
  const loadReferrals = useCallback(async () => {
    setLoading(true);
    // Try to load from referrals table if it exists, filtered by current user's code
    const { data, error } = await supabase
      .from("referrals")
      .select("*")
      .eq("referral_code", code)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setReferrals(data as Referral[]);
    }
    // If table doesn't exist, just show empty state
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadReferrals();
  }, [loadReferrals]);

  const handleCopy = (text: string, type: "code" | "url") => {
    navigator.clipboard.writeText(text).then(() => {
      if (type === "code") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2500);
      }
      toast({
        title: type === "code" ? "Code copié !" : "Lien copié !",
        description:
          type === "code"
            ? "Votre code de parrainage a été copié dans le presse-papier."
            : "Votre lien de parrainage a été copié.",
      });
    });
  };

  const baseUrl = typeof window !== "undefined" && window.location.hostname === "localhost"
    ? `${window.location.origin}/inscription`
    : `https://${entitySlug}.fr/inscription`;
  const referralUrl = `${baseUrl}?ref=${code}`;
  const freeReferrals = referrals.filter((r) => !r.is_subscribed);
  const paidReferrals = referrals.filter((r) => r.is_subscribed);

  return (
    <div className="p-6 max-w-4xl">
      {/* Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Programme de Parrainage</h1>
        <p className="text-sm text-gray-500 mt-1">
          Parrainez et gagnez des récompenses
        </p>
      </div>

      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-[#3DB5C5] to-[#2a9aaa] rounded-xl p-6 text-white mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <Handshake className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg">Bienvenue dans notre Programme de Parrainage !</h2>
            <p className="text-white/70 text-sm">Chez {entityName}</p>
          </div>
        </div>
        <p className="text-white/90 text-sm leading-relaxed">
          Nous croyons en la valeur de la collaboration, c&apos;est pourquoi nous avons mis en place
          un programme de parrainage passionnant qui récompense non seulement nos établissements
          partenaires existants, mais aussi ceux qui rejoignent notre communauté.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h3 className="font-bold text-gray-800 mb-5">Comment ça marche ?</h3>

        <div className="space-y-5">
          {/* Step 1 - Parrainage */}
          <div className="flex gap-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
              style={{ background: "#3DB5C5" }}
            >
              1
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm mb-1 flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#3DB5C5]" />
                Parrainage
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Lorsqu&apos;un organisme de formation ou un formateur indépendant parraine avec succès
                un nouveau membre qui s&apos;inscrit en utilisant votre code ci-dessous, et effectue son
                premier mois d&apos;abonnement pendant l&apos;inscription, à partir du{" "}
                <strong>deuxième mois d&apos;abonnement</strong>, le parrain reçoit un virement de{" "}
                <strong className="text-[#3DB5C5]">99,00 €</strong> directement sur son compte.
              </p>
            </div>
          </div>

          {/* Step 2 - Reward for new member */}
          <div className="flex gap-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
              style={{ background: "#3DB5C5" }}
            >
              2
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm mb-1 flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" />
                Récompense pour le Nouveau Membre
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Le nouveau membre nouvellement inscrit bénéficie du{" "}
                <strong>troisième mois gratuitement</strong>, comme notre façon de les accueillir
                chaleureusement dans notre communauté.
              </p>
            </div>
          </div>

          {/* Step 3 - Rewards triggered */}
          <div className="flex gap-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
              style={{ background: "#3DB5C5" }}
            >
              3
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm mb-1 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-600" />
                Récompenses Déclenchées
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Une fois la vérification confirmée, nous procédons au{" "}
                <strong>virement instantané de 99,00 €</strong> pour le membre parrainant et activons
                le mois gratuit pour le membre nouvellement inscrit.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Code section */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          Votre code de parrainage
        </h3>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl px-5 py-4 font-mono text-xl font-bold tracking-wider text-gray-800 text-center">
            {code || "Chargement..."}
          </div>
          <button
            onClick={() => handleCopy(code, "code")}
            className="flex items-center gap-2 text-white px-5 py-4 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: copied ? "#22c55e" : "#3DB5C5" }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copié !" : "Copier"}
          </button>
        </div>

        {/* Referral URL */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Lien de parrainage direct
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-xs text-gray-500 truncate font-mono">
              {referralUrl}
            </div>
            <button
              onClick={() => handleCopy(referralUrl, "url")}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
              style={{
                color: copiedUrl ? "#22c55e" : "#3DB5C5",
                border: `1px solid ${copiedUrl ? "#22c55e" : "#3DB5C5"}`,
              }}
            >
              {copiedUrl ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copiedUrl ? "Copié !" : "Copier le lien"}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-100">
              <Users className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-700 text-sm">Comptes créés (non abonnés)</p>
              <p className="text-xs text-gray-400">Via votre code de parrainage</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-800">{freeReferrals.length}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: "#e0f5f8" }}
            >
              <Euro className="h-5 w-5" style={{ color: "#3DB5C5" }} />
            </div>
            <div>
              <p className="font-semibold text-gray-700 text-sm">Comptes créés (abonnés)</p>
              <p className="text-xs text-gray-400">Parrainages convertis</p>
            </div>
          </div>
          <p className="text-3xl font-bold" style={{ color: "#3DB5C5" }}>
            {paidReferrals.length}
          </p>
        </div>
      </div>

      {/* Referral details - Non subscribed */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h4 className="font-semibold text-gray-700 text-sm mb-3 flex items-center justify-between">
          <span>Infos des comptes créés en utilisant votre code (non abonnés)</span>
          <Badge variant="outline" className="text-gray-500">
            {freeReferrals.length}
          </Badge>
        </h4>
        {freeReferrals.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Aucun compte non abonné pour le moment</p>
        ) : (
          <div className="space-y-2">
            {freeReferrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{r.referred_name}</p>
                  {r.referred_email && <p className="text-xs text-gray-500">{r.referred_email}</p>}
                </div>
                <div className="text-xs text-gray-400">
                  <CalendarCheck className="w-3 h-3 inline mr-1" />
                  {new Date(r.created_at).toLocaleDateString("fr-FR")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Referral details - Subscribed */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h4 className="font-semibold text-gray-700 text-sm mb-3 flex items-center justify-between">
          <span>Infos des comptes créés en utilisant votre code (abonnés)</span>
          <Badge className="bg-[#e0f5f8] text-[#3DB5C5]">
            {paidReferrals.length}
          </Badge>
        </h4>
        {paidReferrals.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Aucun compte abonné pour le moment</p>
        ) : (
          <div className="space-y-2">
            {paidReferrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{r.referred_name}</p>
                    {r.referred_email && <p className="text-xs text-gray-500">{r.referred_email}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="bg-green-50 text-green-700 text-xs">
                    <Euro className="w-3 h-3 mr-1" /> 99,00 € versés
                  </Badge>
                  <span className="text-xs text-gray-400">
                    {new Date(r.created_at).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conditions */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Conditions du programme
        </h4>
        <ul className="space-y-1.5 text-xs text-gray-500">
          <li>• Le parrainage est réservé aux organismes de formation disposant d&apos;un compte actif.</li>
          <li>
            • La récompense de <strong>99,00 €</strong> est versée par virement dès la validation du
            deuxième mois d&apos;abonnement du filleul.
          </li>
          <li>
            • Le nouveau membre bénéficie du <strong>3ème mois gratuit</strong> comme cadeau de bienvenue.
          </li>
          <li>• Pas de limite au nombre de parrainages — cumulez les récompenses sans restriction.</li>
          <li>• {entityName} se réserve le droit de modifier les conditions du programme à tout moment.</li>
        </ul>
      </div>
    </div>
  );
}
