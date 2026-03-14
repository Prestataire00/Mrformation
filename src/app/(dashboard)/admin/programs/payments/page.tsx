"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  CreditCard,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  ArrowRight,
  History,
  Euro,
  Unlink,
  RefreshCw,
} from "lucide-react";

interface StripeAccount {
  id: string;
  stripe_account_id: string;
  is_active: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  created_at: string;
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  customer_email: string | null;
  customer_name: string | null;
  description: string | null;
  paid_at: string | null;
  created_at: string;
}

export default function PaymentsPage() {
  const { toast } = useToast();

  const [stripeAccount, setStripeAccount] = useState<StripeAccount | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/account");
      const json = await res.json();
      if (json.data) {
        setStripeAccount(json.data);
      } else {
        setStripeAccount(null);
      }
    } catch {
      setStripeAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/stripe/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          return_url: window.location.href,
        }),
      });
      const json = await res.json();

      if (json.url) {
        window.location.href = json.url;
      } else {
        toast({
          title: "Erreur",
          description: json.error || "Impossible de créer le lien Stripe.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Erreur",
        description: "Erreur de connexion au serveur.",
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Êtes-vous sûr de vouloir déconnecter votre compte Stripe ?")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/stripe/account", { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setStripeAccount(null);
        setPayments([]);
        setShowPayments(false);
        toast({ title: "Compte Stripe déconnecté" });
      } else {
        toast({ title: "Erreur", description: json.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Erreur serveur", variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    await fetchAccount();
    setRefreshing(false);
    toast({ title: "Statut mis à jour" });
  };

  const fetchPayments = async () => {
    setPaymentsLoading(true);
    setShowPayments(true);
    try {
      const res = await fetch("/api/stripe/payments?per_page=50");
      const json = await res.json();
      setPayments(json.data ?? []);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les paiements.", variant: "destructive" });
    } finally {
      setPaymentsLoading(false);
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "succeeded":
        return <Badge className="bg-green-100 text-green-700 text-xs">Payé</Badge>;
      case "pending":
        return <Badge className="bg-amber-100 text-amber-700 text-xs">En attente</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-700 text-xs">Échoué</Badge>;
      case "refunded":
        return <Badge className="bg-blue-100 text-blue-700 text-xs">Remboursé</Badge>;
      case "cancelled":
        return <Badge className="bg-gray-100 text-gray-600 text-xs">Annulé</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const isConnected = stripeAccount?.charges_enabled && stripeAccount?.details_submitted;
  const isPending = stripeAccount && !isConnected;

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <span className="font-medium text-gray-700">Catalogue</span>
        <span className="mx-2">/</span>
        <span>Paiements En Ligne</span>
      </div>

      {/* Stripe Connect Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <CreditCard className="h-5 w-5 text-[#3DB5C5]" />
          Connecter votre compte Stripe
        </h2>

        {loading ? (
          <div className="flex items-center gap-3 py-8 justify-center text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Chargement...
          </div>
        ) : isConnected ? (
          /* Connected state */
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-green-50 rounded-lg p-4 border border-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">
                  Compte Stripe connecté
                </p>
                <p className="text-xs text-green-600 mt-0.5">
                  Votre compte est actif et peut recevoir des paiements.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Paiements</p>
                <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5 mt-0.5">
                  {stripeAccount.charges_enabled ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Activés</>
                  ) : (
                    <><XCircle className="h-3.5 w-3.5 text-red-500" /> Désactivés</>
                  )}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Virements</p>
                <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5 mt-0.5">
                  {stripeAccount.payouts_enabled ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Activés</>
                  ) : (
                    <><XCircle className="h-3.5 w-3.5 text-red-500" /> Désactivés</>
                  )}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Connecté depuis</p>
                <p className="text-sm font-medium text-gray-800 mt-0.5">
                  {formatDate(stripeAccount.created_at)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshStatus}
                disabled={refreshing}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Actualiser le statut
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnect}
                disabled={connecting}
                className="gap-1.5 text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Tableau de bord Stripe
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Unlink className="h-3.5 w-3.5" />
                Déconnecter
              </Button>
            </div>
          </div>
        ) : isPending ? (
          /* Pending state — onboarding not finished */
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-amber-50 rounded-lg p-4 border border-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Configuration incomplète
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Votre compte Stripe a été créé mais la vérification n&apos;est pas terminée.
                  Cliquez ci-dessous pour reprendre la configuration.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleConnect}
                disabled={connecting}
                className="gap-2 bg-[#3DB5C5] hover:bg-[#2a9aa8] text-white"
              >
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Reprendre la configuration
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Unlink className="h-3.5 w-3.5" />
                Supprimer
              </Button>
            </div>
          </div>
        ) : (
          /* Not connected state */
          <div className="space-y-4">
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                Commencer à accepter les paiements ligne et des installements sur votre catalogue publique en quelques clics (Gratuitement)
              </p>
              <p>
                Frais de Stripe: Pour tous les paiements en Europe 1.5% et €0.25 par paiement en ligne
              </p>
              <p>
                Frais de VisioFormation sur Stripe: 1% par paiement
              </p>
            </div>

            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="gap-2 bg-[#3DB5C5] hover:bg-[#2a9aa8] text-white"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Lier un compte Stripe
            </Button>
          </div>
        )}
      </div>

      {/* Payments History Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <History className="h-5 w-5 text-[#3DB5C5]" />
          Historique des paiements
        </h2>

        {!showPayments ? (
          <Button
            onClick={fetchPayments}
            disabled={paymentsLoading}
            className="gap-2 bg-[#3DB5C5] hover:bg-[#2a9aa8] text-white"
          >
            {paymentsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <History className="h-4 w-4" />
            )}
            Historique
          </Button>
        ) : paymentsLoading ? (
          <div className="flex items-center gap-3 py-8 justify-center text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Chargement des paiements...
          </div>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Euro className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">Aucun paiement enregistré</p>
            <p className="text-xs text-gray-400 mt-1">
              Les paiements apparaîtront ici une fois que vos clients auront effectué un achat.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Montant</th>
                  <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-3 text-gray-600 whitespace-nowrap">
                      {formatDate(p.paid_at || p.created_at)}
                    </td>
                    <td className="py-3 px-3">
                      <div>
                        {p.customer_name && (
                          <p className="font-medium text-gray-800">{p.customer_name}</p>
                        )}
                        {p.customer_email && (
                          <p className="text-xs text-gray-400">{p.customer_email}</p>
                        )}
                        {!p.customer_name && !p.customer_email && (
                          <span className="text-gray-400 italic">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-gray-600 max-w-[250px] truncate">
                      {p.description || "—"}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-gray-800 whitespace-nowrap">
                      {formatAmount(p.amount, p.currency)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {statusBadge(p.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
