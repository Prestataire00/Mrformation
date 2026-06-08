"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Key,
  ShieldCheck,
  ShieldOff,
  Loader2,
  Pencil,
} from "lucide-react";
import QRCode from "qrcode";

interface LearnerFull {
  id: string; entity_id: string; first_name: string; last_name: string;
  email: string | null; phone: string | null; client_id: string | null;
  profile_id: string | null; job_title: string | null; birth_date: string | null;
  birth_city: string | null; gender: "M" | "F" | "autre" | null;
  nationality: string | null; address: string | null; city: string | null;
  postal_code: string | null; social_security_number: string | null;
  education_level: string | null; learner_type: string | null;
  loris_metadata: Record<string, string | number | null> | null;
  loris_external_id: string | null; created_at: string;
  avatar_url: string | null; clients: { company_name: string } | null;
  welcome_email_sent_at: string | null;
}

interface AccessCreatedData {
  email: string;
  password: string;
  login_url: string;
}

interface LearnerHeaderProps {
  learner: LearnerFull;
  onRefresh: () => Promise<void>;
  onEditToggle: () => void;
  editing: boolean;
}

export default function LearnerHeader({ learner, onRefresh, onEditToggle, editing }: LearnerHeaderProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [creatingAccess, setCreatingAccess] = useState(false);
  const [accessCreated, setAccessCreated] = useState<AccessCreatedData | null>(null);
  const [sendingWelcome, setSendingWelcome] = useState(false);
  const [togglingAccess, setTogglingAccess] = useState(false);
  const [learnerActive, setLearnerActive] = useState(true);

  const initials = `${learner.first_name.charAt(0)}${learner.last_name.charAt(0)}`.toUpperCase();

  async function handleCreateAccess() {
    if (!learner.email) return;
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
      const data: AccessCreatedData & { error?: string } = await res.json();
      if (res.ok) {
        setAccessCreated(data);
        toast({ title: "Acces cree" });
        await onRefresh();
      } else {
        toast({ title: "Erreur", description: data.error ?? "Echec", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
    setCreatingAccess(false);
  }

  async function handleToggleAccess() {
    if (!learner.profile_id) return;
    setTogglingAccess(true);
    try {
      const res = await fetch("/api/admin/toggle-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: learner.profile_id, is_active: !learnerActive }),
      });
      const data: { message?: string; error?: string } = await res.json();
      if (res.ok) {
        setLearnerActive(!learnerActive);
        toast({ title: data.message ?? "Statut modifie" });
      } else {
        toast({ title: "Erreur", description: data.error ?? "Echec", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
    setTogglingAccess(false);
  }

  async function handleSendWelcome() {
    if (!learner.email) return;
    setSendingWelcome(true);
    try {
      const res = await fetch(`/api/learners/${learner.id}/send-welcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d: { error?: string } = await res.json();
        throw new Error(d.error ?? "Envoi echoue");
      }
      toast({ title: "Lien d'acces envoye", description: `Email envoye a ${learner.email}` });
      await onRefresh();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Envoi echoue", variant: "destructive" });
    }
    setSendingWelcome(false);
  }

  async function handleSendAccessEmail() {
    if (!accessCreated || !learner) return;
    const body = `Bonjour ${learner.first_name},\n\nVotre acces a la plateforme de formation a ete cree.\n\nEmail: ${accessCreated.email}\nMot de passe: ${accessCreated.password}\n\nConnectez-vous ici: ${accessCreated.login_url}\n\nCordialement,\nL'equipe formation`;
    try {
      await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: accessCreated.email, subject: "Vos acces plateforme formation", body }),
      });
      toast({ title: "Acces envoyes par email" });
    } catch {
      toast({ title: "Erreur d'envoi", variant: "destructive" });
    }
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

  return (
    <>
      <div className="bg-white border-b px-6 py-5">
        <button onClick={() => router.back()} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-3">
          <ArrowLeft className="h-3 w-3" /> Retour
        </button>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
              {initials}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{learner.first_name} {learner.last_name}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                {learner.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{learner.email}</span>}
                {learner.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{learner.phone}</span>}
                {learner.clients && learner.client_id && (
                  <Link href={`/admin/clients/${learner.client_id}`}>
                    <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-gray-50">
                      <Building2 className="h-3 w-3" />{learner.clients.company_name}
                    </Badge>
                  </Link>
                )}
                {learner.profile_id && learner.welcome_email_sent_at ? (
                  <Badge className="bg-green-100 text-green-700 gap-1"><ShieldCheck className="h-3 w-3" />Acces envoye</Badge>
                ) : learner.profile_id ? (
                  <Badge className="bg-amber-100 text-amber-700 gap-1"><Key className="h-3 w-3" />Acces cree</Badge>
                ) : (
                  <Badge variant="outline" className="text-gray-400 gap-1"><Key className="h-3 w-3" />Pas d&apos;acces</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!learner.profile_id && learner.email && (
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handleCreateAccess} disabled={creatingAccess}>
                {creatingAccess ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
                {creatingAccess ? "Creation..." : "Creer un acces"}
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
                {learnerActive ? "Suspendre" : "Reactiver"}
              </Button>
            )}
            {learner.email && (
              <Button size="sm" variant="outline" className="text-xs gap-1.5" disabled={sendingWelcome} onClick={handleSendWelcome}>
                {sendingWelcome ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                Envoyer lien d&apos;acces
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={onEditToggle}>
              <Pencil className="h-3 w-3" /> {editing ? "Annuler" : "Modifier"}
            </Button>
          </div>
        </div>
      </div>

      {accessCreated && (
        <div className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-3 mx-6 mt-4">
          <p className="text-sm font-semibold text-green-800">Acces plateforme cree</p>
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
    </>
  );
}
