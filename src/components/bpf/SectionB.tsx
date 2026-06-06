import { Filter } from "lucide-react";

interface SectionBProps {
  dateFrom: string;
  dateTo: string;
  filteredFrom: string;
  filteredTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onFilter: () => void;
  dateError?: string | null;
}

export function SectionB({
  dateFrom,
  dateTo,
  filteredFrom,
  filteredTo,
  onDateFromChange,
  onDateToChange,
  onFilter,
  dateError,
}: SectionBProps) {
  return (
    <div className="bg-[#e0f5f8] rounded-xl p-6 mb-4">
      <h2 className="font-bold text-gray-900 text-base mb-3">
        B. Caractéristiques de l&apos;organisme
      </h2>
      <p className="text-sm text-gray-700 mb-4">
        Le bilan pédagogique et financier porte sur l&apos;activité de dispensateur de formation de l&apos;organisme au cours du dernier exercice comptable clos :
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-2">
        <span className="text-sm text-gray-700">Début de l&apos;exercice comptable</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className={`border rounded-lg px-3 py-2 text-sm focus:outline-none ${dateError ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:border-[#374151]"}`}
        />
        <span className="text-sm text-gray-700">Fin de l&apos;exercice comptable</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className={`border rounded-lg px-3 py-2 text-sm focus:outline-none ${dateError ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:border-[#374151]"}`}
        />
        <button
          onClick={onFilter}
          disabled={!!dateError}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "#374151" }}
        >
          <Filter className="h-4 w-4" />
          Filtrer
        </button>
      </div>

      {dateError && (
        <p className="text-xs text-red-600 mb-3">{dateError}</p>
      )}

      <div className="text-sm text-gray-700 space-y-1 mt-2">
        <p>Après filtre:</p>
        <p>Début de l&apos;exercice comptable: <strong>{filteredFrom || "—"}</strong></p>
        <p>Fin de l&apos;exercice comptable: <strong>{filteredTo || "—"}</strong></p>
      </div>
    </div>
  );
}
