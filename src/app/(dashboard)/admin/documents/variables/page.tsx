"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Search, Copy, ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
  TEMPLATE_VARIABLES,
  CATEGORY_LABELS,
  type VariableCategory,
} from "@/lib/template-variables";

export default function VariablesPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<VariableCategory | "all">("all");

  const filtered = TEMPLATE_VARIABLES.filter((v) => {
    const matchesSearch =
      !search ||
      v.label.toLowerCase().includes(search.toLowerCase()) ||
      v.key.toLowerCase().includes(search.toLowerCase()) ||
      (v.description || "").toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "all" || v.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const grouped = filtered.reduce(
    (acc, v) => {
      if (!acc[v.category]) acc[v.category] = [];
      acc[v.category]!.push(v);
      return acc;
    },
    {} as Partial<Record<VariableCategory, typeof TEMPLATE_VARIABLES>>
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copie", description: `${text} copie dans le presse-papier` });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/documents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Variables de templates</h1>
          <p className="text-sm text-muted-foreground">
            {TEMPLATE_VARIABLES.length} variables disponibles pour personnaliser vos documents et emails
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher une variable..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={activeCategory === "all" ? "default" : "outline"}
            onClick={() => setActiveCategory("all")}
            className="text-xs"
          >
            Toutes
          </Button>
          {(Object.entries(CATEGORY_LABELS) as [VariableCategory, { label: string; icon: string }][]).map(
            ([key, { label, icon }]) => (
              <Button
                key={key}
                size="sm"
                variant={activeCategory === key ? "default" : "outline"}
                onClick={() => setActiveCategory(key)}
                className="text-xs gap-1"
              >
                <span>{icon}</span> {label}
              </Button>
            )
          )}
        </div>
      </div>

      {/* Variables list */}
      <div className="space-y-6">
        {(Object.entries(grouped) as [VariableCategory, typeof TEMPLATE_VARIABLES][]).map(
          ([category, variables]) => (
            <div key={category}>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="text-lg">{CATEGORY_LABELS[category].icon}</span>
                {CATEGORY_LABELS[category].label}
                <Badge variant="outline" className="text-[10px]">{variables.length}</Badge>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {variables.map((v) => (
                  <div
                    key={v.key}
                    className="border rounded-lg p-3 hover:border-gray-300 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{v.label}</p>
                        {v.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(v.placeholder)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <code
                        className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded cursor-pointer hover:bg-blue-100 transition-colors"
                        onClick={() => copyToClipboard(v.placeholder)}
                      >
                        {v.placeholder}
                      </code>
                      <div className="flex items-center gap-1">
                        {v.availableIn.includes("document") && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">Doc</Badge>
                        )}
                        {v.availableIn.includes("email") && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">Email</Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Exemple : <span className="text-gray-500">{v.example}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">Aucune variable ne correspond a votre recherche</p>
        </div>
      )}
    </div>
  );
}
