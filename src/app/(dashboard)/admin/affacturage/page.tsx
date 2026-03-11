"use client";

import { useState } from "react";
import {
  Plus,
  AlertTriangle,
  FileText,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Euro,
  Building2,
  CalendarCheck,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";

interface Demande {
  id: string;
  reference: string;
  montant: string;
  client: string;
  facture: string;
  partenaire: string;
  dateCreation: string;
  statut: "En attente" | "Acceptée" | "Refusée";
}

const STATUT_COLORS: Record<Demande["statut"], string> = {
  "En attente": "bg-yellow-100 text-yellow-700",
  Acceptée: "bg-green-100 text-green-700",
  Refusée: "bg-red-100 text-red-700",
};

const STATUT_ICONS: Record<Demande["statut"], typeof Clock> = {
  "En attente": Clock,
  Acceptée: CheckCircle,
  Refusée: XCircle,
};

const PARTENAIRES = [
  { id: "edebex", name: "Edebex", description: "Leader européen de l'affacturage en ligne" },
];

type Tab = "nouvelle" | "demandes";

export default function AffacturagePage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("nouvelle");
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [partenaire, setPartenaire] = useState(PARTENAIRES[0].id);
  const [montant, setMontant] = useState("");
  const [client, setClient] = useState("");
  const [facture, setFacture] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!client.trim()) {
      toast({ title: "Client requis", description: "Veuillez saisir le nom du client.", variant: "destructive" });
      return;
    }
    if (!montant.trim() || parseFloat(montant) <= 0) {
      toast({ title: "Montant requis", description: "Veuillez saisir un montant valide.", variant: "destructive" });
      return;
    }
    if (!facture.trim()) {
      toast({ title: "Numéro de facture requis", description: "Veuillez saisir le numéro de facture.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const newDemande: Demande = {
      id: Date.now().toString(),
      reference: `AFF-${Date.now().toString().slice(-6)}`,
      montant,
      client,
      facture,
      partenaire: PARTENAIRES.find((p) => p.id === partenaire)?.name ?? partenaire,
      dateCreation: new Date().toLocaleDateString("fr-FR"),
      statut: "En attente",
    };

    setDemandes((prev) => [newDemande, ...prev]);
    setMontant("");
    setClient("");
    setFacture("");
    setSubmitting(false);
    setTab("demandes");
    toast({ title: "Demande envoyée !", description: `Réf. ${newDemande.reference} — en attente de traitement.` });
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Affacturage</h1>
        <p className="text-sm text-gray-500 mt-1">Avance de trésorerie sur vos factures</p>
      </div>

      {/* Partner selection */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="font-bold text-gray-800 mb-2">
          Choisissez un partenaire d&apos;avance de trésorerie
        </h2>
        <div className="space-y-3 mt-4">
          {PARTENAIRES.map((p) => (
            <label
              key={p.id}
              className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                partenaire === p.id
                  ? "border-[#3DB5C5] bg-[#f0fafb]"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="partenaire"
                value={p.id}
                checked={partenaire === p.id}
                onChange={() => setPartenaire(p.id)}
                className="accent-[#3DB5C5] w-4 h-4"
              />
              <div className="flex items-center gap-3 flex-1">
                <div className="bg-blue-600 text-white font-bold text-sm px-3 py-1.5 rounded-lg tracking-wide">
                  EDEBEX
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.description}</p>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Eligibility warning */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 leading-relaxed">
          <p className="font-semibold mb-1">Attention — Conditions d&apos;éligibilité :</p>
          <ul className="space-y-1 list-disc pl-4">
            <li>Le destinataire de la facture doit être une <strong>entreprise (B2B)</strong>.</li>
            <li>La formation doit être <strong>délivrée</strong>.</li>
            <li>
              Il faut accumuler un total de <strong>4 500 € au moins</strong>, que ce soit une facture ou plusieurs.
            </li>
            <li>
              Si c&apos;est une seule facture, une demande est suffisante. Si vous avez plusieurs factures
              qui font un total de 4 500+ €, vous devez faire <strong>une demande pour chaque facture</strong>.
            </li>
          </ul>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("nouvelle")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            tab === "nouvelle"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Plus className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
          Nouvelle demande
        </button>
        <button
          onClick={() => setTab("demandes")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            tab === "demandes"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <FileText className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
          Mes demandes
          {demandes.length > 0 && (
            <Badge className="ml-2 bg-[#e0f5f8] text-[#3DB5C5] text-xs">{demandes.length}</Badge>
          )}
        </button>
      </div>

      {/* Tab content */}
      {tab === "nouvelle" ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="font-bold text-gray-800 mb-1">Nouvelle demande d&apos;affacturage</h3>
          <p className="text-sm text-gray-500 mb-6">
            Remplissez les informations de la facture pour laquelle vous souhaitez une avance de trésorerie.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Client */}
            <div className="space-y-1.5">
              <label className="block text-sm text-gray-600">
                Client / Débiteur (entreprise)<span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  placeholder="Nom de l'entreprise cliente"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent"
                />
              </div>
            </div>

            {/* Montant */}
            <div className="space-y-1.5">
              <label className="block text-sm text-gray-600">
                Montant de la facture (€)<span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  placeholder="Ex: 4500"
                  required
                  min="1"
                  step="0.01"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent"
                />
              </div>
            </div>

            {/* Numéro de facture */}
            <div className="space-y-1.5">
              <label className="block text-sm text-gray-600">
                Numéro de facture<span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={facture}
                  onChange={(e) => setFacture(e.target.value)}
                  placeholder="Ex: FAC-2026-0042"
                  required
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent"
                />
              </div>
            </div>

            {/* Partenaire recap */}
            <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3">
              <div className="bg-blue-600 text-white font-bold text-xs px-2 py-1 rounded tracking-wide">
                EDEBEX
              </div>
              <p className="text-xs text-gray-500">
                Votre demande sera transmise à <strong>{PARTENAIRES.find((p) => p.id === partenaire)?.name}</strong>
              </p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: "#3DB5C5" }}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Envoi...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Soumettre la demande
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {demandes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
                style={{ background: "#e0f5f8" }}
              >
                <FileText className="h-7 w-7" style={{ color: "#3DB5C5" }} />
              </div>
              <p className="text-gray-500 font-medium">Aucune demande</p>
              <p className="text-gray-400 text-sm mt-1 mb-5">
                Vous n&apos;avez pas encore soumis de demande d&apos;affacturage
              </p>
              <button
                onClick={() => setTab("nouvelle")}
                className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
                style={{ background: "#3DB5C5" }}
              >
                <Plus className="h-4 w-4" />
                Faire une première demande
              </button>
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-sm text-gray-500">
                  {demandes.length} demande{demandes.length !== 1 ? "s" : ""}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Référence</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Client</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Facture</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Montant</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Partenaire</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {demandes.map((d) => {
                    const StatusIcon = STATUT_ICONS[d.statut];
                    return (
                      <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-gray-700 text-xs">{d.reference}</td>
                        <td className="px-4 py-3 text-gray-800 font-medium">{d.client}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{d.facture}</td>
                        <td className="px-4 py-3 text-gray-700">{d.montant} €</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{d.partenaire}</td>
                        <td className="px-4 py-3 text-gray-600">{d.dateCreation}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUT_COLORS[d.statut]}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {d.statut}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
