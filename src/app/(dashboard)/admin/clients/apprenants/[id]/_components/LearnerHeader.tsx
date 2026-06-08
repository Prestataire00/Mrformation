"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Mail, Phone, Building2, Key,
  ShieldCheck, ShieldOff, Loader2, Pencil,
} from "lucide-react";
import CreateAccessButton from "@/components/credentials/CreateAccessButton";
import type { LearnerFull } from "../page";

interface LearnerHeaderProps {
  learner: LearnerFull;
  onRefresh: () => Promise<void>;
  onEditToggle: () => void;
  editing: boolean;
}

export default function LearnerHeader({ learner, onRefresh, onEditToggle, editing }: LearnerHeaderProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [sendingWelcome, setSendingWelcome] = useState(false);
  const [togglingAccess, setTogglingAccess] = useState(false);
  const [learnerActive, setLearnerActive] = useState(true);

  const initials = `${learner.first_name.charAt(0)}${learner.last_name.charAt(0)}`.toUpperCase();

  async function handleToggleAccess() {
    if (!learner.profile_id) return;
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
        toast({ title: data.message || (learnerActive ? "Acc\u00e8s suspendu" : "Acc\u00e8s r\u00e9activ\u00e9") });
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
    setTogglingAccess(false);
  }

  async function handleSendWelcome() {
    if (!learner.email || learner.synthetic_email_used) return;
    setSendingWelcome(true);
    try {
      const res = await fetch(`/api/learners/${learner.id}/send-welcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      toast({ title: "Lien d\u2019acc\u00e8s envoy\u00e9", description: `Email envoy\u00e9 \u00e0 ${learner.email}` });
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Envoi \u00e9chou\u00e9",
        variant: "destructive",
      });
    } finally {
      setSendingWelcome(false);
    }
  }

  return (
    <div className="bg-white border-b px-6 py-5">
      <button onClick={() => router.back()} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-3">
        <ArrowLeft className="h-3 w-3" /> Retour
      </button>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          {learner.avatar_url ? (
            <img src={learner.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-[#374151] flex items-center justify-center text-white font-bold text-sm">
              {initials}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{learner.first_name} {learner.last_name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
              {learner.email && !learner.synthetic_email_used && (
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{learner.email}</span>
              )}
              {learner.phone && (
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{learner.phone}</span>
              )}
              {learner.clients?.company_name && (
                <Link
                  href={`/admin/clients/${learner.client_id}`}
                  className="flex items-center gap-1 text-[#374151] hover:underline"
                >
                  <Building2 className="h-3 w-3" />{learner.clients.company_name}
                </Link>
              )}
              {learner.username && (
                <span className="flex items-center gap-1 font-mono text-xs text-gray-400">
                  @{learner.username}
                </span>
              )}
              {/* Access status badge */}
              {learner.profile_id ? (
                <span className="flex items-center gap-1 text-green-600">
                  <ShieldCheck className="h-3 w-3" />Acc\u00e8s actif
                </span>
              ) : (
                <span className="flex items-center gap-1 text-gray-400">
                  <Key className="h-3 w-3" />Pas d&apos;acc\u00e8s
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Create access → redirects to ?tab=acces */}
          {!learner.profile_id && (
            <CreateAccessButton
              learnerId={learner.id}
              learnerHasEmail={!!learner.email && !learner.synthetic_email_used}
              variant="outline"
              onSuccess={() => {
                onRefresh();
                router.push("?tab=acces");
              }}
            />
          )}

          {/* Toggle access */}
          {learner.profile_id && (
            <Button
              size="sm"
              variant="outline"
              className={cn(
                "text-xs gap-1.5",
                learnerActive
                  ? "text-red-500 hover:text-red-600 hover:bg-red-50"
                  : "text-green-600 hover:text-green-700 hover:bg-green-50",
              )}
              onClick={handleToggleAccess}
              disabled={togglingAccess}
            >
              {togglingAccess ? <Loader2 className="h-3 w-3 animate-spin" /> : learnerActive ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
              {learnerActive ? "Suspendre" : "R\u00e9activer"}
            </Button>
          )}

          {/* Send welcome — only for real email users */}
          {learner.email && !learner.synthetic_email_used && learner.profile_id && (
            <Button size="sm" variant="outline" className="text-xs gap-1.5" disabled={sendingWelcome} onClick={handleSendWelcome}>
              {sendingWelcome ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
              Envoyer lien d&apos;acc\u00e8s
            </Button>
          )}

          {/* Edit toggle */}
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={onEditToggle}>
            <Pencil className="h-3 w-3" /> {editing ? "Annuler" : "Modifier"}
          </Button>
        </div>
      </div>
    </div>
  );
}
