"use client";

import { LifeBuoy, ExternalLink } from "lucide-react";

const IA_INFINITY_URL = "#"; // TODO: Remplacer par l'URL du portail IA Infinity

export default function SupportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support</h1>
        <p className="text-gray-500 mt-1">
          Besoin d&apos;aide ? Ouvrez un ticket via notre partenaire IA Infinity.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-blue-50 rounded-lg">
            <LifeBuoy className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            Assistance & Tickets
          </h2>
        </div>

        <p className="text-gray-600 mb-6">
          Pour toute question, problème technique ou demande d&apos;assistance,
          créez un ticket de support. Notre équipe vous répondra dans les
          meilleurs délais.
        </p>

        <a
          href={IA_INFINITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Ouvrir un ticket
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
