"use client";

import { CreditCard } from "lucide-react";

export default function PaymentsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-[#3DB5C5]" />
          Paiements en Ligne
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestion des paiements pour les formations en ligne
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CreditCard className="h-12 w-12 text-gray-300 mb-3" />
        <p className="font-medium text-gray-600">Module de paiement</p>
        <p className="text-sm text-gray-400 mt-1">
          Cette fonctionnalité sera bientôt disponible.
        </p>
      </div>
    </div>
  );
}
