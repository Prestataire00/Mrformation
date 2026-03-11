"use client";

import { useState } from "react";
import { Phone, Loader2, CheckCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const TIMING_OPTIONS = [
  "Le plus rapidement possible",
  "Dans la matinée",
  "Dans l'après-midi",
  "Demain",
  "Cette semaine",
];

export default function DemanderAppelPage() {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [timing, setTiming] = useState(TIMING_OPTIONS[0]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!phone.trim()) {
      toast({
        title: "Numéro requis",
        description: "Veuillez saisir votre numéro de téléphone.",
        variant: "destructive",
      });
      return;
    }

    if (!notes.trim()) {
      toast({
        title: "Raison requise",
        description: "Veuillez indiquer la raison de l'appel.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    // Simulate sending (in production, this would call an API)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setSubmitting(false);
    setSubmitted(true);
    toast({
      title: "Demande envoyée !",
      description: "Nous vous rappellerons dans les plus brefs délais.",
    });
  }

  if (submitted) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Demande envoyée !</h2>
          <p className="text-gray-500 text-sm mb-6">
            Nous avons bien reçu votre demande. Nous vous rappellerons au{" "}
            <strong>{phone}</strong> le plus rapidement possible.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setPhone("");
              setNotes("");
              setTiming(TIMING_OPTIONS[0]);
            }}
            className="text-[#3DB5C5] text-sm font-medium hover:underline"
          >
            Faire une nouvelle demande
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Demander Un Appel Téléphonique
        </h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        {/* Info text */}
        <div className="text-center mb-8">
          <p className="text-gray-700 text-sm leading-relaxed">
            Remplissez le formulaire ci-dessous et nous vous appellerons le plus rapidement possible
          </p>
          <p className="text-gray-700 text-sm leading-relaxed mt-1">
            Si vous ne voulez pas nous contacter par téléphone, vous pouvez demander une démo ou nous contacter par chat.
          </p>
          <p className="text-gray-700 text-sm leading-relaxed mt-1">
            Vous pouvez aussi nous contacter par email (<a href="mailto:support@visioformation.fr" className="text-[#3DB5C5] hover:underline font-medium">support@visioformation.fr</a>)
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Phone */}
          <div className="space-y-1.5">
            <label className="block text-sm text-gray-600">
              Numéro de téléphone<span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder=""
              required
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent"
            />
          </div>

          {/* Timing */}
          <div className="space-y-1.5">
            <label className="block text-sm text-gray-600">
              Quand vous voulez recevoir notre appel?<span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={timing}
                onChange={(e) => setTiming(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent appearance-none bg-white"
              >
                {TIMING_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="block text-sm text-gray-600">
              Petit résumé de la raison de l&apos;appel / Notes<span className="text-red-500">*</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              required
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3DB5C5] focus:border-transparent resize-y"
            />
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
                <Phone className="w-4 h-4" />
                Demander un appel
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
