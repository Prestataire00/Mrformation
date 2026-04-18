"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface HeroCardProps {
  firstName: string;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function HeroCard({ firstName, message, ctaLabel, ctaHref }: HeroCardProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#374151] to-[#1f2937] text-white p-8">
      <div className="relative z-10 max-w-[70%]">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">
          {greeting} {firstName} 👋
        </h1>
        <p className="text-gray-300 text-sm mb-4 leading-relaxed">
          {message}
        </p>
        {ctaLabel && ctaHref && (
          <Button asChild variant="secondary" className="bg-white text-[#374151] hover:bg-gray-100">
            <Link href={ctaHref}>{ctaLabel}</Link>
          </Button>
        )}
      </div>
      {/* Decorative blobs */}
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/5 blur-2xl" />
      <div className="absolute -bottom-20 -right-40 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
      <div className="absolute top-4 right-8 w-32 h-32 rounded-full bg-[#DC2626]/10 blur-2xl" />
    </div>
  );
}
