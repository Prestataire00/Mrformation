"use client";

import { useState } from "react";
import { Plus, Search, Copy } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  TEMPLATE_VARIABLES,
  CATEGORY_LABELS,
  type VariableCategory,
} from "@/lib/template-variables";

interface Props {
  onInsert: (placeholder: string) => void;
  context: "document" | "email";
}

export function InsertVariableButton({ onInsert, context }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = TEMPLATE_VARIABLES.filter(
    (v) => v.availableIn.includes(context)
  ).filter(
    (v) =>
      !search ||
      v.label.toLowerCase().includes(search.toLowerCase()) ||
      v.key.toLowerCase().includes(search.toLowerCase()) ||
      (v.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce(
    (acc, v) => {
      if (!acc[v.category]) acc[v.category] = [];
      acc[v.category]!.push(v);
      return acc;
    },
    {} as Partial<Record<VariableCategory, typeof TEMPLATE_VARIABLES>>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Insérer une variable
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-h-[420px] overflow-y-auto p-0" align="start">
        <div className="sticky top-0 bg-white border-b p-2 z-10">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Rechercher une variable..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-8 text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="p-2 space-y-3">
          {(Object.entries(grouped) as [VariableCategory, typeof TEMPLATE_VARIABLES][]).map(
            ([category, variables]) => (
              <div key={category}>
                <h4 className="text-[10px] font-semibold text-gray-400 mb-1 uppercase tracking-wider flex items-center gap-1.5 px-1">
                  <span>{CATEGORY_LABELS[category].icon}</span>
                  {CATEGORY_LABELS[category].label}
                </h4>
                <div className="space-y-0.5">
                  {variables.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => {
                        onInsert(v.placeholder);
                        setOpen(false);
                        setSearch("");
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm group transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900">{v.label}</span>
                        <code className="text-[10px] text-gray-400 group-hover:text-gray-600 font-mono shrink-0 flex items-center gap-1">
                          {v.placeholder}
                          <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </code>
                      </div>
                      {v.example && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Ex: <span className="text-gray-500">{v.example}</span>
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )
          )}

          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              Aucune variable trouvée
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
