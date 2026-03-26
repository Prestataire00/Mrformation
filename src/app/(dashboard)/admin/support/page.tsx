"use client";

import { LifeBuoy, Mail } from "lucide-react";

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
          href="mailto:acces.prestataires@i-a-infinity.com"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3DB5C5] text-white rounded-lg hover:bg-[#2ea3b3] transition-colors font-medium"
        >
          Contacter le support
          <Mail className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
