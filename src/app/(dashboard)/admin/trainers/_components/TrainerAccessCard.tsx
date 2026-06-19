"use client";

import { useState } from "react";
import { Loader2, KeyRound, Link2, Unlink, Copy, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import LinkExistingAccountDialog from "./LinkExistingAccountDialog";

interface TrainerAccessCardProps {
  trainer: {
    id: string;
    profile_id: string | null;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    entity_id: string;
  };
  onChanged: () => void;
}

interface AccessResult {
  action: "created" | "reset";
  email: string | null;
  password: string | null;
  synthetic_email_used: boolean;
}

export default function TrainerAccessCard({ trainer, onChanged }: TrainerAccessCardProps) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [processing, setProcessing] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [result, setResult] = useState<AccessResult | null>(null);
  const hasAccount = !!trainer.profile_id;

  const callAccess = async (method: "POST" | "DELETE") => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/trainers/${trainer.id}/access`, { method });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'opération");
      return data;
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateOrReset = async () => {
    try {
      const data = await callAccess("POST");
      if (data.password) {
        setResult({
          action: data.action,
          email: data.email,
          password: data.password,
          synthetic_email_used: data.synthetic_email_used === true,
        });
      }
      toast({
        title: data.action === "reset" ? "Mot de passe réinitialisé" : "Accès créé",
        description: data.synthetic_email_used
          ? "Email synthétique utilisé (le formateur n'a pas d'email réel)."
          : undefined,
      });
      onChanged();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    }
  };

  const handleUnlink = async () => {
    const ok = await confirm({
      title: "Délier le compte ?",
      description: "La fiche ne sera plus reliée à ce compte. Le compte n'est pas supprimé et pourra être relié à nouveau.",
    });
    if (!ok) return;
    try {
      await callAccess("DELETE");
      toast({ title: "Compte délié" });
      onChanged();
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Erreur", variant: "destructive" });
    }
  };

  const copyCredentials = () => {
    if (!result) return;
    const text = `Email: ${result.email ?? ""}\tMot de passe: ${result.password ?? ""}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Copié", description: "Identifiants copiés dans le presse-papiers." });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Accès plateforme</CardTitle>
        {hasAccount ? (
          <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Compte actif
          </Badge>
        ) : (
          <Badge variant="outline" className="text-gray-500">Pas de compte</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {hasAccount ? (
          <>
            <p className="text-sm text-muted-foreground">
              Email de connexion : <span className="font-medium text-gray-800">{trainer.email || "—"}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-2" disabled={processing} onClick={handleCreateOrReset}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Réinitialiser le mot de passe
              </Button>
              <Button variant="outline" size="sm" className="gap-2" disabled={processing} onClick={handleUnlink}>
                <Unlink className="h-4 w-4" /> Délier
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Ce formateur n'a pas encore d'accès à la plateforme.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="gap-2" disabled={processing} onClick={handleCreateOrReset}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Créer l'accès
              </Button>
              <Button variant="outline" size="sm" className="gap-2" disabled={processing} onClick={() => setLinkOpen(true)}>
                <Link2 className="h-4 w-4" /> Relier à un compte existant
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <LinkExistingAccountDialog
        trainerId={trainer.id}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onLinked={onChanged}
      />

      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{result?.action === "reset" ? "Nouveau mot de passe" : "Accès créé"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Ces identifiants ne seront affichés qu'une seule fois. Copiez-les et transmettez-les au formateur de façon sécurisée.
            </p>
            {result?.synthetic_email_used && (
              <p className="text-xs text-amber-600">
                ⚠️ Email synthétique : le formateur n'a pas d'email réel, il se connecte avec l'email ci-dessous.
              </p>
            )}
            <div className="rounded-lg border bg-gray-50 p-3 text-sm font-mono space-y-1">
              <div><span className="text-gray-500">Email : </span>{result?.email}</div>
              <div><span className="text-gray-500">Mot de passe : </span>{result?.password}</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="gap-2" onClick={copyCredentials}><Copy className="h-4 w-4" /> Copier</Button>
            <Button onClick={() => setResult(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </Card>
  );
}
