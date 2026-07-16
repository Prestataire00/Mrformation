"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

import type { AbbyErrorCode } from "@/lib/abby/errors";

// Microcopy des erreurs typées (AD-16 : l'UI mappe code → message)
const ERROR_MESSAGES: Partial<Record<AbbyErrorCode, string>> = {
  abby_auth_failed:
    "Clé API refusée par Abby. Vérifiez la clé dans Abby → Paramètres → Intégrations, puis réessayez.",
  abby_plan_no_api:
    "L'accès API n'est pas disponible sur le plan de ce compte Abby (plan Pro minimum requis).",
  abby_network: "Abby est injoignable pour le moment. Vérifiez la connexion et réessayez.",
};

function errorMessage(code?: string, fallback?: string): string {
  return (
    (code && ERROR_MESSAGES[code as AbbyErrorCode]) ||
    fallback ||
    (ERROR_MESSAGES.abby_network as string)
  );
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
  const [loadError, setLoadError] = useState(false);
  const [testResult, setTestResult] = useState<AbbyTestConnectionResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [activating, setActivating] = useState(false);
  // Garde anti-obsolescence : ignorer les résolutions d'une entité précédente
  // (le super_admin peut switcher d'entité pendant un fetch/submit en vol)
  const entityRef = useRef(entityId);
  entityRef.current = entityId;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TestConnectionInput>({
    resolver: zodResolver(testConnectionSchema) as never,
  });

  const loadState = useCallback(async () => {
    const forEntity = entityRef.current;
    setLoading(true);
    setLoadError(false);
    try {
      // Lecture LMS uniquement (jamais d'appel Abby au montage — AD-22)
      const res = await fetch("/api/abby/connections");
      if (entityRef.current !== forEntity) return; // entité changée en vol
      if (res.ok) {
        const json = (await res.json()) as { state: AbbyConnectionState };
        setState(json.state);
      } else {
        setState(null);
        setLoadError(true);
      }
    } catch {
      if (entityRef.current !== forEntity) return;
      setState(null);
      setLoadError(true);
    }
    if (entityRef.current === forEntity) setLoading(false);
  }, []);

  useEffect(() => {
    if (!entityId) return;
    setTestResult(null);
    setTestError(null);
    setReplacing(false);
    void loadState();
  }, [entityId, loadState]);

  const onSubmit = async (values: TestConnectionInput) => {
    const forEntity = entityRef.current;
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

      if (entityRef.current !== forEntity) return; // entité changée en vol

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
      if (entityRef.current !== forEntity) return;
      const message = ERROR_MESSAGES.abby_network as string;
      setTestError(message);
      toast({ title: "Test de connexion échoué", description: message, variant: "destructive" });
    }
  };

  const handleActivate = async () => {
    const forEntity = entityRef.current;
    setActivating(true);
    setTestError(null);
    try {
      const res = await fetch("/api/abby/connections/activate", { method: "POST" });
      const json = (await res.json()) as
        | { state: AbbyConnectionState }
        | { error: { message: string; code?: string } };

      if (entityRef.current !== forEntity) return;

      if (!res.ok || "error" in json) {
        const err = "error" in json ? json.error : undefined;
        const message = errorMessage(err?.code, err?.message);
        setTestError(message);
        toast({ title: "Activation refusée", description: message, variant: "destructive" });
        await loadState();
        return;
      }

      setTestResult(null);
      toast({
        title: "Connexion Abby activée",
        description: "Les factures de cette entité pourront être poussées vers Abby.",
      });
      await loadState();
    } catch {
      if (entityRef.current !== forEntity) return;
      const message = ERROR_MESSAGES.abby_network as string;
      setTestError(message);
      toast({ title: "Activation refusée", description: message, variant: "destructive" });
    } finally {
      if (entityRef.current === forEntity) setActivating(false);
    }
  };

  const hasStoredKey = state !== null && state.status !== "non_configuree";
  const showForm = !loadError && (!hasStoredKey || replacing);
  // FR-2 : le bouton Activer n'existe qu'à l'état « testée », formulaire fermé
  // (rouvrir le formulaire ou changer la clé invalide le test côté UI ; la
  // garantie structurelle est server-side : on n'active que la ligne stockée)
  const canActivate = state?.status === "testee" && !replacing;
  const isActive = state?.status === "active" || state?.status === "en_erreur";
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

            {loadError && (
              <div className="border border-amber-200 rounded-lg p-3 bg-amber-50 text-sm text-amber-800 flex items-center justify-between gap-3">
                <span>Impossible de charger l&apos;état de la connexion Abby.</span>
                <Button variant="outline" size="sm" onClick={() => void loadState()}>
                  Réessayer
                </Button>
              </div>
            )}

            {hasStoredKey && identitySiret && (
              <div className="border rounded-lg p-4 bg-gray-50 space-y-1">
                <p className="text-sm font-medium">
                  {isActive ? "Compte connecté" : "Compte trouvé"} : {identityName} — SIRET {identitySiret}
                </p>
                {(testResult?.isInTestMode ?? false) && (
                  <p className="text-xs text-gray-500">Compte en mode test.</p>
                )}
                {isActive && state?.connectedAt && (
                  <p className="text-xs text-gray-500">
                    Connectée le {formatDateTime(state.connectedAt)}
                    {state.lastUsedAt && ` — dernier usage le ${formatDateTime(state.lastUsedAt)}`}
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  Clé enregistrée ({"•".repeat(8)}) — jamais réaffichée.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {canActivate && (
                    <Button size="sm" disabled={activating} className="gap-2" onClick={() => void handleActivate()}>
                      {activating && <Loader2 className="h-4 w-4 animate-spin" />}
                      {activating ? "Activation…" : "C'est bien ce compte → Activer"}
                    </Button>
                  )}
                  {!replacing && (
                    <Button variant="outline" size="sm" onClick={() => setReplacing(true)}>
                      Remplacer la clé
                    </Button>
                  )}
                </div>
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
                    aria-invalid={!!errors.apiKey}
                    aria-describedby={errors.apiKey ? "abby-api-key-error" : undefined}
                    {...register("apiKey")}
                  />
                  {errors.apiKey && (
                    <p id="abby-api-key-error" className="text-xs text-red-600 mt-1">
                      {errors.apiKey.message}
                    </p>
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
