"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useEntity } from "@/contexts/EntityContext";
import { FileCheck, Loader2 } from "lucide-react";
import type { AbbyConnectionState, AbbyTestConnectionResult } from "@/lib/types/abby";
import { testConnectionSchema, type TestConnectionInput } from "@/lib/validations/abby";

// Microcopy des erreurs typées (AD-16 : l'UI mappe code → message)
const ERROR_MESSAGES: Record<string, string> = {
  abby_auth_failed:
    "Clé API refusée par Abby. Vérifiez la clé dans Abby → Paramètres → Intégrations, puis réessayez.",
  abby_plan_no_api:
    "L'accès API n'est pas disponible sur le plan de ce compte Abby (plan Pro minimum requis).",
  abby_network: "Abby est injoignable pour le moment. Vérifiez la connexion et réessayez.",
};

function errorMessage(code?: string, fallback?: string): string {
  return (code && ERROR_MESSAGES[code]) || fallback || ERROR_MESSAGES.abby_network;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AbbyConnectionCard() {
  const { toast } = useToast();
  const { entityId } = useEntity();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<AbbyConnectionState | null>(null);
  const [testResult, setTestResult] = useState<AbbyTestConnectionResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TestConnectionInput>({
    resolver: zodResolver(testConnectionSchema) as never,
  });

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      // Lecture LMS uniquement (jamais d'appel Abby au montage — AD-22)
      const res = await fetch("/api/abby/connections");
      if (res.ok) {
        const json = (await res.json()) as { state: AbbyConnectionState };
        setState(json.state);
      } else {
        setState(null);
      }
    } catch {
      setState(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!entityId) return;
    setTestResult(null);
    setTestError(null);
    setReplacing(false);
    void loadState();
  }, [entityId, loadState]);

  const onSubmit = async (values: TestConnectionInput) => {
    setTestError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/abby/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json()) as
        | AbbyTestConnectionResult
        | { error: { message: string; code?: string } };

      if (!res.ok || "error" in json) {
        const err = "error" in json ? json.error : undefined;
        const message = errorMessage(err?.code, err?.message);
        setTestError(message);
        toast({ title: "Test de connexion échoué", description: message, variant: "destructive" });
        await loadState();
        return;
      }

      setTestResult(json);
      setReplacing(false);
      reset(); // la clé n'est jamais réaffichée
      toast({
        title: "Compte Abby vérifié",
        description: `SIRET ${json.companySiret} — clé enregistrée.`,
      });
      await loadState();
    } catch {
      const message = ERROR_MESSAGES.abby_network;
      setTestError(message);
      toast({ title: "Test de connexion échoué", description: message, variant: "destructive" });
    }
  };

  const hasStoredKey = state !== null && state.status !== "non_configuree";
  const showForm = !hasStoredKey || replacing;
  const identityName =
    testResult?.companyName ??
    state?.companyName ??
    "(nom commercial non renseigné chez Abby)";
  const identitySiret = testResult?.companySiret ?? state?.companySiret ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck className="h-5 w-5" />
          Facturation électronique (Abby)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              Connectez le compte Abby de cette entité pour pousser vos factures vers une
              Plateforme Agréée. La clé API se génère dans Abby → Paramètres → Intégrations.
            </p>

            {hasStoredKey && identitySiret && (
              <div className="border rounded-lg p-4 bg-gray-50 space-y-1">
                <p className="text-sm font-medium">
                  Compte trouvé : {identityName} — SIRET {identitySiret}
                </p>
                {(testResult?.isInTestMode ?? false) && (
                  <p className="text-xs text-gray-500">Compte en mode test.</p>
                )}
                <p className="text-xs text-gray-500">
                  Clé enregistrée ({"•".repeat(8)}) — jamais réaffichée.
                  L&apos;activation de la connexion arrive à l&apos;étape suivante.
                </p>
                {!replacing && (
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => setReplacing(true)}>
                    Remplacer la clé
                  </Button>
                )}
              </div>
            )}

            {(testError || state?.lastError) && (
              <div className="border border-red-200 rounded-lg p-3 bg-red-50 text-sm text-red-700">
                {testError ?? state?.lastError}
                {!testError && state?.lastErrorAt && (
                  <span className="block text-xs mt-1">
                    le {formatDateTime(state.lastErrorAt)}
                  </span>
                )}
              </div>
            )}

            {showForm && (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
                <div>
                  <Label htmlFor="abby-api-key">Clé API Abby</Label>
                  <Input
                    id="abby-api-key"
                    type="password"
                    autoComplete="off"
                    placeholder="suk_…"
                    {...register("apiKey")}
                  />
                  {errors.apiKey && (
                    <p className="text-xs text-red-600 mt-1">{errors.apiKey.message}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={isSubmitting} className="gap-2">
                    {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isSubmitting ? "Vérification du compte…" : "Tester et connecter"}
                  </Button>
                  {replacing && (
                    <Button type="button" variant="ghost" onClick={() => { setReplacing(false); reset(); }}>
                      Annuler
                    </Button>
                  )}
                </div>
              </form>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
