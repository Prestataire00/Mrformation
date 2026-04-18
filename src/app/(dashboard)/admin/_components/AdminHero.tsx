"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminHeroProps {
  firstName: string;
  ongoingSessions: number;
  attentionCount: number;
}

export function AdminHero({ firstName, ongoingSessions, attentionCount }: AdminHeroProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const hasAlerts = attentionCount > 0;

  const message = (() => {
    const parts: string[] = [];
    if (ongoingSessions > 0) parts.push(`${ongoingSessions} formation${ongoingSessions > 1 ? "s" : ""} en cours`);
    if (attentionCount > 0) parts.push(`${attentionCount} élément${attentionCount > 1 ? "s" : ""} nécessite${attentionCount > 1 ? "nt" : ""} votre attention`);
    return parts.length > 0 ? `Vous avez ${parts.join(" et ")}.` : "Tout est à jour. Bonne journée !";
  })();

  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl p-6 md:p-8 text-white",
      hasAlerts ? "bg-gradient-to-br from-[#DC2626] to-[#991b1b]" : "bg-gradient-to-br from-[#374151] to-[#1f2937]"
    )}>
      <div className="relative z-10 max-w-[75%]">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">{greeting} {firstName} 👋</h1>
        <p className="text-white/90 text-sm md:text-base mb-4">{message}</p>
        {hasAlerts ? (
          <Button asChild variant="secondary" size="sm" className="bg-white text-gray-800 hover:bg-gray-100">
            <Link href="#attention">
              <AlertCircle className="h-4 w-4 mr-1.5" />
              Voir ce qui demande votre attention
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Link>
          </Button>
        ) : (
          <div className="flex items-center gap-2 text-white/70 text-sm">
            <CheckCircle2 className="h-4 w-4" /> Aucune action urgente
          </div>
        )}
      </div>
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/5 blur-2xl" />
      <div className="absolute -bottom-20 -right-40 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
    </div>
  );
}
