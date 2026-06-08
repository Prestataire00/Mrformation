"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Key, Loader2 } from "lucide-react";
import type { CredentialsData } from "./CredentialsCard";

interface CreateAccessButtonProps {
  learnerId: string;
  learnerHasEmail: boolean;
  onSuccess?: (credentials: CredentialsData) => void;
  variant?: "default" | "outline";
}

export default function CreateAccessButton({
  learnerId,
  learnerHasEmail,
  onSuccess,
  variant = "default",
}: CreateAccessButtonProps) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/create-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: "learner",
          entity_type_id: learnerId,
          role: "learner",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          toast({
            title: "Compte déjà existant",
            description: "Utilise 'Régénérer credentials' pour reset.",
          });
        } else {
          toast({
            title: "Erreur",
            description: data.error || `Erreur ${res.status}`,
            variant: "destructive",
          });
        }
        return;
      }

      const syntheticUsed = data.synthetic_email_used === true;
      if (syntheticUsed) {
        toast({
          title: "Accès créé",
          description: "⚠️ Cet apprenant n'a pas d'email — distribue les credentials via la convention de formation.",
        });
      } else {
        toast({
          title: "Accès créé",
          description: "Tu peux maintenant envoyer le lien par email.",
        });
      }

      if (onSuccess) {
        onSuccess({
          username: data.username,
          password: data.password,
          email: data.email,
          synthetic_email_used: syntheticUsed,
          login_url: data.login_url,
        });
      }
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Création échouée",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Button
      size="sm"
      variant={variant}
      className="gap-1.5 text-xs"
      onClick={handleCreate}
      disabled={creating}
    >
      {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
      {creating ? "Création…" : "Créer un accès"}
    </Button>
  );
}
