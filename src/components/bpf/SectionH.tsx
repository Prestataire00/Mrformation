import { AlertTriangle } from "lucide-react";

interface SectionHProps {
  legalRepresentative?: string | null;
}

export function SectionH({ legalRepresentative }: SectionHProps) {
  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <h2 className="font-bold text-gray-900 text-base mb-4 uppercase">
        H. Personne ayant qualité pour signer le bilan
      </h2>
      {!legalRepresentative ? (
        <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-amber-50 border border-amber-200 text-amber-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Représentant légal non renseigné. Complétez le profil de votre entité dans les paramètres.</span>
        </div>
      ) : (
        <div className="text-sm text-gray-800">
          <p>Nom du représentant légal : <strong>{legalRepresentative}</strong></p>
        </div>
      )}
    </div>
  );
}
