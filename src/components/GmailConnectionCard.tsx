"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { Mail, Loader2, CheckCircle2, XCircle, Unplug } from "lucide-react";

interface GmailStatus {
  connected: boolean;
  gmail_address: string | null;
  connected_at: string | null;
  last_error: string | null;
}

export function GmailConnectionCard() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  // Handle redirect query params from OAuth callback
  useEffect(() => {
    const gmailParam = searchParams.get("gmail");
    if (gmailParam === "connected") {
      toast({
        title: "Gmail connecté",
        description:
          "Votre compte Gmail a été connecté avec succès. Les emails seront envoyés depuis votre adresse.",
      });
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
      loadStatus();
    } else if (gmailParam === "error") {
      const reason = searchParams.get("reason");
      let description = "Une erreur est survenue lors de la connexion Gmail.";
      if (reason === "denied")
        description = "Vous avez refusé l'accès à Gmail.";
      else if (reason === "expired")
        description = "La session a expiré. Veuillez réessayer.";

      toast({
        title: "Erreur de connexion Gmail",
        description,
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams, toast]);

  async function loadStatus() {
    try {
      const res = await fetch("/api/auth/gmail/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error("Failed to load Gmail status:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/auth/gmail/disconnect", {
        method: "POST",
      });
      if (res.ok) {
        setStatus({
          connected: false,
          gmail_address: null,
          connected_at: null,
          last_error: null,
        });
        toast({
          title: "Gmail déconnecté",
          description: "Votre compte Gmail a été déconnecté.",
        });
      } else {
        toast({
          title: "Erreur",
          description: "Impossible de déconnecter Gmail.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de déconnecter Gmail.",
        variant: "destructive",
      });
    } finally {
      setDisconnecting(false);
    }
  }

  function handleConnect() {
    window.location.href = "/api/auth/gmail/authorize";
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Chargement...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
          <Mail className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Connexion Gmail
          </h3>
          <p className="text-sm text-gray-500">
            Envoyez les emails depuis votre propre adresse Gmail
          </p>
        </div>
      </div>

      {status?.connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">
                Connecté à {status.gmail_address}
              </p>
              {status.connected_at && (
                <p className="text-xs text-green-600">
                  Depuis le{" "}
                  {new Date(status.connected_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {disconnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Unplug className="w-4 h-4" />
            )}
            Déconnecter Gmail
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {status?.last_error && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <XCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                Connexion précédente expirée. Veuillez vous reconnecter.
              </p>
            </div>
          )}

          <p className="text-sm text-gray-600">
            Connectez votre compte Gmail pour que les emails envoyés en votre nom
            partent directement depuis votre adresse. Seul l&apos;accès d&apos;envoi
            sera demandé.
          </p>

          <button
            onClick={handleConnect}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Connecter mon Gmail
          </button>
        </div>
      )}
    </div>
  );
}
