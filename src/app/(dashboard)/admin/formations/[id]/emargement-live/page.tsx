"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { CheckCircle2, Circle, ChevronLeft, ChevronRight, X, Maximize2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Slot {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  slot_order: number;
}

interface Person {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  signed: boolean;
  signed_at?: string;
}

interface SlotStatus {
  slot: Slot;
  session_token: { token: string; expires_at: string } | null;
  learners: Person[];
  trainers: Person[];
  stats: { learners_total: number; learners_signed: number; trainers_total: number; trainers_signed: number };
}

const POLL_INTERVAL_MS = 3000;

export default function EmargementLivePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [slots, setSlots] = useState<SlotStatus[]>([]);
  const [activeSlotIdx, setActiveSlotIdx] = useState(0);
  const [qrImage, setQrImage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/emargement/live-status?session_id=${sessionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec chargement");
      setSlots(data.slots ?? []);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Polling toutes les 3 sec pour rafraîchir les statuts en temps réel
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Génère le QR code pour le créneau actif
  useEffect(() => {
    const active = slots[activeSlotIdx];
    if (!active?.session_token) {
      setQrImage("");
      return;
    }
    const url = `${window.location.origin}/emargement/${active.session_token.token}`;
    QRCode.toDataURL(url, {
      width: 600,
      margin: 2,
      color: { dark: "#000", light: "#fff" },
      errorCorrectionLevel: "M",
    })
      .then(setQrImage)
      .catch(() => setQrImage(""));
  }, [slots, activeSlotIdx]);

  // Auto-bascule sur le créneau "actuel" au mount (celui qui inclut now)
  useEffect(() => {
    if (slots.length === 0 || lastRefresh) return;
    const now = Date.now();
    const currentIdx = slots.findIndex((s) =>
      new Date(s.slot.start_time).getTime() <= now && new Date(s.slot.end_time).getTime() >= now
    );
    if (currentIdx >= 0) setActiveSlotIdx(currentIdx);
  }, [slots, lastRefresh]);

  // Génère les tokens session si manquants
  const handleGenerateTokens = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/emargement/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, mode: "session" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Échec génération");
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur génération");
    } finally {
      setGenerating(false);
    }
  };

  const goFullscreen = () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse text-gray-500">Chargement...</div>
      </div>
    );
  }

  if (error && slots.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 p-4">
        <p className="text-red-600">{error}</p>
        <Button onClick={() => router.back()}>Retour</Button>
      </div>
    );
  }

  const active = slots[activeSlotIdx];
  const allSignedLearners = active?.learners.filter((l) => l.signed) ?? [];
  const pendingLearners = active?.learners.filter((l) => !l.signed) ?? [];

  // Si aucun slot n'a de token session → proposer de les générer
  const needsTokens = slots.length > 0 && slots.every((s) => !s.session_token);

  if (needsTokens) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-50 p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Mode présentation — Émargement</h1>
        <p className="text-gray-600 max-w-md">
          Ce mode affiche un QR code en grand format pour chaque créneau. Les apprenants scannent et choisissent leur nom dans la liste.
        </p>
        <p className="text-sm text-gray-500">Aucun QR de session généré pour cette formation.</p>
        <Button size="lg" onClick={handleGenerateTokens} disabled={generating} className="bg-emerald-600 hover:bg-emerald-700">
          {generating ? "Génération en cours..." : `Générer les ${slots.length} QR de session`}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>← Retour</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-white hover:bg-white/10 gap-1">
          <X className="h-4 w-4" /> Quitter
        </Button>
        <div className="text-center">
          <h1 className="text-lg font-semibold">Mode présentation — Émargement</h1>
          {lastRefresh && (
            <p className="text-xs text-white/50 flex items-center justify-center gap-1">
              <RefreshCw className="h-3 w-3" /> Mis à jour il y a {Math.round((Date.now() - lastRefresh.getTime()) / 1000)}s
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={goFullscreen} className="text-white hover:bg-white/10 gap-1">
          <Maximize2 className="h-4 w-4" /> Plein écran
        </Button>
      </div>

      {/* Slot navigator */}
      <div className="flex items-center justify-center gap-3 py-3 border-b border-white/10 bg-black/20">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setActiveSlotIdx(Math.max(0, activeSlotIdx - 1))}
          disabled={activeSlotIdx === 0}
          className="text-white hover:bg-white/10"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="text-center min-w-[300px]">
          <p className="text-sm text-white/60">Créneau {activeSlotIdx + 1} / {slots.length}</p>
          <p className="text-lg font-semibold">
            {active?.slot.title ?? new Date(active?.slot.start_time ?? "").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", timeZone: "Europe/Paris" })}
          </p>
          <p className="text-sm text-white/70">
            {new Date(active?.slot.start_time ?? "").toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
            {" → "}
            {new Date(active?.slot.end_time ?? "").toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setActiveSlotIdx(Math.min(slots.length - 1, activeSlotIdx + 1))}
          disabled={activeSlotIdx >= slots.length - 1}
          className="text-white hover:bg-white/10"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Main content : QR + liste apprenants */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8 max-w-7xl mx-auto">
        {/* QR Code */}
        <div className="flex flex-col items-center justify-center bg-white rounded-2xl p-8 shadow-2xl">
          {qrImage ? (
            <>
              <img src={qrImage} alt="QR code de signature" className="w-full max-w-md aspect-square" />
              <p className="text-gray-700 text-center mt-4 text-lg font-semibold">
                Scannez pour signer
              </p>
              <p className="text-gray-500 text-sm mt-1">
                Choisissez votre nom dans la liste après scan
              </p>
            </>
          ) : (
            <p className="text-gray-400">Pas de QR pour ce créneau</p>
          )}
        </div>

        {/* Liste apprenants live */}
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-4">
              <p className="text-3xl font-bold text-emerald-300">{active?.stats.learners_signed ?? 0}</p>
              <p className="text-xs text-emerald-100/80 uppercase tracking-wider">Signés</p>
            </div>
            <div className="bg-orange-500/20 border border-orange-500/30 rounded-lg p-4">
              <p className="text-3xl font-bold text-orange-300">{(active?.stats.learners_total ?? 0) - (active?.stats.learners_signed ?? 0)}</p>
              <p className="text-xs text-orange-100/80 uppercase tracking-wider">En attente</p>
            </div>
          </div>

          {/* Liste signés */}
          {allSignedLearners.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-emerald-300 mb-2 uppercase tracking-wider">
                ✓ Signés ({allSignedLearners.length})
              </h3>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {allSignedLearners.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 px-3 py-2 bg-emerald-500/10 rounded-lg animate-in fade-in">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    <span className="text-sm">
                      {l.first_name} {l.last_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Liste en attente */}
          {pendingLearners.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-orange-300 mb-2 uppercase tracking-wider">
                ○ En attente ({pendingLearners.length})
              </h3>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {pendingLearners.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-lg">
                    <Circle className="h-5 w-5 text-white/40 shrink-0" />
                    <span className="text-sm text-white/70">
                      {l.first_name} {l.last_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formateurs */}
          {active && active.trainers.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-blue-300 mb-2 uppercase tracking-wider">
                Formateurs
              </h3>
              <div className="space-y-1">
                {active.trainers.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2 bg-blue-500/10 rounded-lg">
                    {t.signed ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    ) : (
                      <Circle className="h-5 w-5 text-white/40 shrink-0" />
                    )}
                    <span className="text-sm">
                      {t.first_name} {t.last_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
