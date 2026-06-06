"use client";

import { AlertTriangle } from "lucide-react";

interface EntityBPFData {
  name: string;
  siret?: string | null;
  naf_code?: string | null;
  nda_number?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface SectionAProps {
  entityName: string;
  entityData?: EntityBPFData | null;
}

export function SectionA({ entityName, entityData }: SectionAProps) {
  const data = entityData || { name: entityName };
  const missingFields = [];
  if (!data.siret) missingFields.push("SIRET");
  if (!data.naf_code) missingFields.push("Code NAF");
  if (!data.address) missingFields.push("Adresse");

  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <h2 className="font-bold text-gray-900 text-base mb-4 uppercase">
        A. Identification de l&apos;organisme de formation
      </h2>
      {missingFields.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-amber-50 border border-amber-200 text-amber-700 mb-4">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Données manquantes : {missingFields.join(", ")}. Complétez le profil de votre entité dans les paramètres.</span>
        </div>
      )}
      <div className="space-y-2 text-sm text-gray-800">
        {data.nda_number && <p>Numéro de déclaration: <strong>{data.nda_number}</strong></p>}
        <p>Numéro de SIRET: <strong>{data.siret || "—"}</strong></p>
        <p>Code NAF: <strong>{data.naf_code || "—"}</strong></p>
        <p>Nom et prénom ou dénomination (sigle): <strong>{data.name || entityName}</strong></p>
        <p>Adresse: <strong>{data.address || "—"}</strong></p>
        {data.phone && <p>Téléphone: <strong>{data.phone}</strong></p>}
        {data.email && <p>Email: <strong>{data.email}</strong></p>}
      </div>
    </div>
  );
}
