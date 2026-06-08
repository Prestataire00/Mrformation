"use client";

import { useState } from "react";
import { Eye, EyeOff, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CredentialsCardInlineProps {
  credentials: {
    username?: string;
    email: string;
    password: string;
    login_url?: string;
    synthetic_email_used?: boolean;
  };
  onCopy?: () => void;
}

export function CredentialsCardInline({ credentials, onCopy }: CredentialsCardInlineProps) {
  const [showPassword, setShowPassword] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const lines = [];
    if (credentials.username) lines.push(`Identifiant: ${credentials.username}`);
    lines.push(`Email: ${credentials.email}`);
    lines.push(`Mot de passe: ${credentials.password}`);
    if (credentials.login_url) lines.push(`URL: ${credentials.login_url}`);
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  };

  return (
    <div className="space-y-3 py-2">
      <div className="p-3 bg-gray-50 rounded-lg space-y-2.5 text-sm">
        {credentials.username && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Identifiant</span>
            <span className="font-mono font-medium">{credentials.username}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">
            Email
            {credentials.synthetic_email_used && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">synthétique</span>
            )}
          </span>
          <span className={`font-medium ${credentials.synthetic_email_used ? "text-gray-400" : ""}`}>
            {credentials.email}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Mot de passe</span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-lg">
              {showPassword ? credentials.password : "••••••••"}
            </span>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {credentials.login_url && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">URL de connexion</span>
            <a
              href={credentials.login_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline truncate max-w-[200px]"
            >
              {credentials.login_url}
            </a>
          </div>
        )}
      </div>
      <Button
        variant="outline"
        className="w-full gap-1.5"
        onClick={handleCopy}
      >
        {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copié !" : "Copier les identifiants"}
      </Button>
    </div>
  );
}
