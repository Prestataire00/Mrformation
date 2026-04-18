"use client";

import { cn } from "@/lib/utils";
import { StatusCell, StatusType } from "./StatusCell";

interface MatrixRow {
  id: string;
  name: string;
  email?: string | null;
  cells: Record<string, { status: string; docId?: string }>;
}

interface Props {
  title: string;
  rows: MatrixRow[];
  docTypes: string[];
  docLabels: Record<string, string>;
  onCellClick?: (ownerId: string, docType: string, docId?: string) => void;
  avatarColorFn?: (name: string) => string;
}

function defaultAvatarColor(name: string): string {
  const colors = [
    "bg-blue-100 text-blue-700", "bg-purple-100 text-purple-700",
    "bg-pink-100 text-pink-700", "bg-amber-100 text-amber-700",
    "bg-emerald-100 text-emerald-700", "bg-indigo-100 text-indigo-700",
    "bg-rose-100 text-rose-700", "bg-teal-100 text-teal-700",
  ];
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

// Shorten long labels for column headers
function shortLabel(label: string): string {
  return label
    .replace("CONVOCATION À LA FORMATION", "Convoc.")
    .replace("CERTIFICAT DE RÉALISATION", "Certificat")
    .replace("ATTESTATION D'ASSIDUITÉ", "Assiduité")
    .replace("FEUILLE D'ÉMARGEMENT COLLECTIF", "Émarg. coll.")
    .replace("FEUILLE D'ÉMARGEMENT", "Émarg.")
    .replace("CONVENTION ENTREPRISE", "Convention")
    .replace("CONVENTION D'INTERVENTION", "Conv. interv.")
    .replace("CONTRAT CADRE DE SOUS-TRAITANCE", "Contrat S-T")
    .replace("PLANNING DE LA SEMAINE", "Planning");
}

export function DocMatrixSection({ title, rows, docTypes, docLabels, onCellClick, avatarColorFn }: Props) {
  const getColor = avatarColorFn || defaultAvatarColor;

  if (rows.length === 0) return null;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted/20 px-4 py-2 border-b">
        <h3 className="text-sm font-semibold">{title} ({rows.length})</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/10 border-b">
              <th className="text-left px-4 py-2 font-medium text-xs sticky left-0 bg-muted/10 min-w-[160px]">
                Nom
              </th>
              {docTypes.map(dt => (
                <th key={dt} className="text-center px-2 py-2 font-medium text-[10px] uppercase text-gray-500 whitespace-nowrap">
                  {shortLabel(docLabels[dt] || dt)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.id}
                className={cn(
                  "border-b last:border-b-0 hover:bg-muted/20 transition",
                  idx % 2 === 1 && "bg-gray-50/30"
                )}
              >
                <td className="px-4 py-2.5 sticky left-0" style={{ background: idx % 2 === 1 ? "#f9fafb" : "#fff" }}>
                  <div className="flex items-center gap-2">
                    <div className={cn("h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0", getColor(row.name))}>
                      {row.name.split(" ").map(w => w.charAt(0)).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{row.name}</p>
                      {row.email && <p className="text-[11px] text-muted-foreground truncate">{row.email}</p>}
                    </div>
                  </div>
                </td>
                {docTypes.map(dt => (
                  <td key={dt} className="text-center px-2 py-2">
                    {row.cells[dt] ? (
                      <StatusCell
                        status={row.cells[dt].status as StatusType}
                        size="sm"
                        onClick={onCellClick ? () => onCellClick(row.id, dt, row.cells[dt].docId) : undefined}
                      />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
