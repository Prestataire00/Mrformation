"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NSF_CODES, type NsfCode } from "@/lib/nsf-codes";

interface NsfCodeComboboxProps {
  /** Code NSF actuellement sélectionné (ex: "413") */
  code: string | null;
  /** Callback déclenché à chaque changement — fournit code ET label en cohérence */
  onChange: (code: string | null, label: string | null) => void;
  /** Texte du placeholder quand rien n'est sélectionné */
  placeholder?: string;
  /** Désactive l'interaction */
  disabled?: boolean;
  /** ID HTML pour les labels */
  id?: string;
}

/**
 * Combobox de sélection d'un code NSF officiel.
 * Affiche code + libellé, recherche par code OU libellé.
 * Met à jour à la fois nsf_code et nsf_label sur l'objet parent
 * (garantit la cohérence entre les deux champs en DB).
 */
export function NsfCodeCombobox({
  code,
  onChange,
  placeholder = "Sélectionner un code NSF…",
  disabled = false,
  id,
}: NsfCodeComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = NSF_CODES.find((n) => n.code === code) ?? null;

  // Regroupe par domaine pour un affichage hiérarchique dans la liste
  const grouped = NSF_CODES.reduce<Record<string, NsfCode[]>>((acc, item) => {
    if (!acc[item.domain]) acc[item.domain] = [];
    acc[item.domain].push(item);
    return acc;
  }, {});

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">
              <span className="font-mono text-xs text-gray-500 mr-2">{selected.code}</span>
              {selected.label}
            </span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
          <div className="flex items-center gap-1 shrink-0">
            {selected && !disabled && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null, null);
                }}
                className="hover:bg-gray-100 rounded p-0.5"
                aria-label="Effacer la sélection"
              >
                <X className="h-3 w-3 text-gray-400" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[480px] p-0" align="start">
        <Command
          filter={(value, search) => {
            // Recherche par code OU par libellé (insensible à la casse)
            const lower = search.toLowerCase();
            return value.toLowerCase().includes(lower) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Rechercher par code ou libellé…" className="h-9" />
          <CommandList className="max-h-[400px]">
            <CommandEmpty>Aucun code trouvé.</CommandEmpty>
            {Object.entries(grouped).map(([domain, items]) => (
              <CommandGroup key={domain} heading={domain}>
                {items.map((item) => (
                  <CommandItem
                    key={item.code}
                    // value combiné code + label pour permettre la recherche sur les deux
                    value={`${item.code} ${item.label}`}
                    onSelect={() => {
                      onChange(item.code, item.label);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selected?.code === item.code ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="font-mono text-xs text-gray-500 mr-2 w-10">{item.code}</span>
                    <span className="text-sm">{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
