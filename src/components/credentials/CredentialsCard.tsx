"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Key, Eye, EyeOff, Copy, RefreshCw, QrCode, Loader2, CheckCircle2,
} from "lucide-react";

export interface CredentialsData {
  username: string;
  password: string;
  email: string;
  synthetic_email_used: boolean;
  login_url: string;
}

interface CredentialsCardProps {
  learnerId: string;
  inlineCredentials?: CredentialsData | null;
  onRegenerate?: () => Promise<void>;
}

interface FetchedCredentials {
  username: string | null;
  temp_password: string | null;
  email: string | null;
  synthetic_email_used: boolean;
  profile_id: string | null;
  first_login_at: string | null;
}

export default function CredentialsCard({ learnerId, inlineCredentials, onRegenerate }: CredentialsCardProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [fetched, setFetched] = useState<FetchedCredentials | null>(null);
  const [loading, setLoading] = useState(!inlineCredentials);
  const [showPassword, setShowPassword] = useState(!!inlineCredentials);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const fetchCredentials = useCallback(async () => {
    if (inlineCredentials) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("learners")
      .select("username, temp_password, email, synthetic_email_used, profile_id, first_login_at")
      .eq("id", learnerId)
      .single();
    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les identifiants.", variant: "destructive" });
    } else {
      setFetched(data as unknown as FetchedCredentials);
    }
    setLoading(false);
  }, [learnerId, inlineCredentials]);

  useEffect(() => { fetchCredentials(); }, [fetchCredentials]);

  const creds = inlineCredentials
    ? {
        username: inlineCredentials.username,
        password: inlineCredentials.password,
        email: inlineCredentials.email,
        syntheticUsed: inlineCredentials.synthetic_email_used,
        hasAccount: true,
        firstLoginAt: null as string | null,
        loginUrl: inlineCredentials.login_url,
      }
    : fetched
    ? {
        username: fetched.username,
        password: fetched.temp_password,
        email: fetched.email,
        syntheticUsed: fetched.synthetic_email_used,
        hasAccount: !!fetched.profile_id,
        firstLoginAt: fetched.first_login_at,
        loginUrl: null as string | null,
      }
    : null;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement identifiants…
        </CardContent>
      </Card>
    );
  }

  if (!creds || !creds.hasAccount) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-gray-400">
          Aucun accès plateforme créé.
        </CardContent>
      </Card>
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mrformationcrm.netlify.app";
  const loginUrl = creds.loginUrl || `${baseUrl}/login${creds.username ? `?username=${encodeURIComponent(creds.username)}` : ""}`;

  const handleCopy = async () => {
    const lines = [
      `Identifiant : ${creds.username ?? "—"}`,
      creds.password ? `Mot de passe : ${creds.password}` : "Mot de passe : (activé par l'apprenant)",
      `Lien : ${loginUrl}`,
    ].join("\n");
    await navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Identifiants copiés" });
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/learners/${learnerId}/regenerate-credentials`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      toast({ title: "Mot de passe régénéré" });
      if (onRegenerate) await onRegenerate();
      else await fetchCredentials();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Échec", variant: "destructive" });
    }
    setRegenerating(false);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" /> Identifiants d&apos;accès
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Username */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Identifiant</span>
            <span className="font-mono text-sm font-medium text-gray-900">{creds.username ?? "—"}</span>
          </div>

          {/* Password */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Mot de passe</span>
            {creds.password ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium text-gray-900">
                  {showPassword ? creds.password : "••••••••"}
                </span>
                <button onClick={() => setShowPassword(!showPassword)} className="text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            ) : (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Activé{creds.firstLoginAt ? ` le ${formatDate(creds.firstLoginAt)}` : ""}
              </span>
            )}
          </div>

          {/* Email */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-gray-500">Email</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs text-gray-700 truncate max-w-[200px]">{creds.email ?? "—"}</span>
              {creds.syntheticUsed && (
                <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-200 bg-orange-50">synthétique</Badge>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handleCopy}>
              {copied ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copié !" : "Copier identifiants"}
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Régénérer
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setQrOpen(true)}>
              <QrCode className="h-3 w-3" /> QR code
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* QR Code Dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle>QR Code de connexion</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(loginUrl)}`}
              alt="QR Code"
              className="mx-auto"
              width={200}
              height={200}
            />
            <p className="text-xs text-gray-400 mt-3 break-all">{loginUrl}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
