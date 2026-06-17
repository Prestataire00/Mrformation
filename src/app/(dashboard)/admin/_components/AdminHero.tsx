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

  return (
    <div
      id="attention"
      className={cn(
        "relative overflow-hidden rounded-xl py-4 px-6 text-white",
        hasAlerts
          ? "bg-gradient-to-r from-[#DC2626] to-[#991b1b]"
          : "bg-gradient-to-r from-[#374151] to-[#1f2937]"
      )}
    >
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">
            {greeting} {firstName}
          </p>
          <p className="text-sm text-white/75 mt-0.5">
            <span className="font-medium text-white/90">
              {ongoingSessions} formation{ongoingSessions > 1 ? "s" : ""} en cours
            </span>
            {attentionCount > 0 && (
              <>
                {" · "}
                <span className="font-medium text-white/90">
                  {attentionCount} à traiter
                </span>
              </>
            )}
          </p>
        </div>
        <div className="shrink-0">
          {hasAlerts ? (
            <Button asChild variant="secondary" size="sm" className="bg-white text-gray-800 hover:bg-gray-100 whitespace-nowrap">
              <Link href="#attention">
                <AlertCircle className="h-4 w-4 mr-1.5" />
                Voir ce qui demande votre attention
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 text-white/70 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              <span>Aucune action urgente</span>
            </div>
          )}
        </div>
      </div>
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5 blur-2xl pointer-events-none" />
    </div>
  );
}
