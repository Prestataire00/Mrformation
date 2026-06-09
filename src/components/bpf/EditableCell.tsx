"use client";

import { useState, useRef, useEffect } from "react";
import { Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditableCellProps {
  value: number;
  override?: number | undefined;
  onOverride: (value: number | null) => void;
  suffix?: string;
  className?: string;
}

export function EditableCell({ value, override, onOverride, suffix, className }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isOverridden = override !== undefined && override !== null;
  const displayValue = isOverridden ? override : value;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleStartEdit = () => {
    setInputValue(String(displayValue));
    setEditing(true);
  };

  const handleConfirm = () => {
    setEditing(false);
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed)) return;
    // If the new value equals the calculated value, remove the override
    if (parsed === value) {
      if (isOverridden) onOverride(null);
    } else {
      onOverride(parsed);
    }
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleConfirm();
    if (e.key === "Escape") handleCancel();
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="any"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleConfirm}
        onKeyDown={handleKeyDown}
        className="w-20 px-1.5 py-0.5 text-sm border border-violet-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-violet-400"
      />
    );
  }

  return (
    <span className={cn("group relative inline-flex items-center gap-1 cursor-pointer", className)}>
      <span
        onClick={handleStartEdit}
        title={isOverridden ? `Valeur calculée : ${value}${suffix ? ` ${suffix}` : ""} — Modifiée manuellement` : "Cliquer pour modifier"}
        className={cn(
          "px-1 py-0.5 rounded transition-colors",
          isOverridden
            ? "text-violet-700 font-semibold bg-violet-50 hover:bg-violet-100"
            : "hover:bg-gray-100",
        )}
      >
        {displayValue.toLocaleString("fr-FR")}{suffix ? ` ${suffix}` : ""}
      </span>
      {isOverridden && (
        <>
          <span className="text-[9px] px-1 py-0 rounded bg-violet-100 text-violet-600 border border-violet-200">modifié</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOverride(null); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-violet-600"
            title="Restaurer la valeur calculée"
          >
            <Undo2 className="h-3 w-3" />
          </button>
        </>
      )}
    </span>
  );
}
