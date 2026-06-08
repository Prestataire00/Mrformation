"use client";

import { AlertTriangle } from "lucide-react";

interface SyntheticEmailBannerProps {
  email: string | null;
}

export default function SyntheticEmailBanner({ email }: SyntheticEmailBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
      <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-orange-800">
          Apprenant sans email réel
        </p>
        <p className="text-xs text-orange-700">
          Les identifiants doivent être distribués manuellement (convention de formation imprimée ou remise en main propre).
          L&apos;email <span className="font-mono text-[11px]">{email}</span> est un email synthétique non-routable.
        </p>
      </div>
    </div>
  );
}
