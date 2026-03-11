"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Session, Trainer, Learner, Enrollment, Signature } from "@/lib/types";
import { cn, formatDate, formatDateTime, STATUS_COLORS, SESSION_STATUS_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  PenLine,
  CheckCircle2,
  XCircle,
  Users,
  CalendarDays,
  RefreshCw,
  FileSignature,
  Clock,
  UserCheck,
  Trash2,
  Shield,
  ChevronRight,
} from "lucide-react";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type SessionFull = Session & {
  trainer: { id: string; first_name: string; last_name: string } | null;
  enrollments: (Enrollment & {
    learner: { id: string; first_name: string; last_name: string; email: string | null } | null;
  })[];
};

type SignatureFull = Signature & {
  session: { id: string; title: string; duration_hours: number | null } | null;
  learner_name?: string;
  trainer_name?: string;
};

type SignatureMap = Record<string, boolean>; // learner_id or trainer_id -> signed

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function getInitials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

// ──────────────────────────────────────────────
// Signature Pad Component (simulated canvas UI)
// ──────────────────────────────────────────────

interface SignaturePadProps {
  label: string;
  isSigned: boolean;
  onSign: (svgData: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

function SignaturePad({ label, isSigned, onSign, onClear, disabled }: SignaturePadProps) {
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<{ x: number; y: number }[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSigned || disabled) return;
    setDrawing(true);
    const rect = canvasRef.current!.getBoundingClientRect();
    setCurrentStroke([{ x: e.clientX - rect.left, y: e.clientY - rect.top }]);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing || isSigned || disabled) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    setCurrentStroke((prev) => [...prev, { x: e.clientX - rect.left, y: e.clientY - rect.top }]);
  };

  const handleMouseUp = () => {
    if (!drawing) return;
    setDrawing(false);
    if (currentStroke.length > 2) {
      setStrokes((prev) => [...prev, currentStroke]);
    }
    setCurrentStroke([]);
  };

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke([]);
    onClear();
  };

  const hasDrawing = strokes.length > 0 && strokes.some((s) => s.length > 2);

  const allStrokes = currentStroke.length > 0 ? [...strokes, currentStroke] : strokes;

  const strokeToPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return "";
    return pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-700">{label}</p>
      <div
        ref={canvasRef}
        className={cn(
          "relative w-full h-32 border-2 rounded-lg select-none overflow-hidden",
          isSigned
            ? "border-green-400 bg-green-50"
            : "border-dashed border-gray-300 bg-gray-50 cursor-crosshair",
          disabled && !isSigned && "opacity-50 cursor-not-allowed"
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {isSigned ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <p className="text-xs font-semibold text-green-700">Signature validée</p>
          </div>
        ) : (
          <>
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {allStrokes.map((stroke, i) => (
                <path
                  key={i}
                  d={strokeToPath(stroke)}
                  stroke="#1d4ed8"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
            {!hasDrawing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <PenLine className="h-6 w-6 text-gray-300 mx-auto mb-1" />
                  <p className="text-xs text-gray-400">Signer ici</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex gap-2">
        {!isSigned && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={disabled || !hasDrawing}
              className="flex-1 text-xs gap-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Effacer
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const paths = strokes
                  .map((pts) => strokeToPath(pts))
                  .filter(Boolean)
                  .map((d) => `<path d="${d}" stroke="#1d4ed8" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
                  .join("");
                const svgData = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 128">${paths}</svg>`;
                onSign(svgData);
              }}
              disabled={disabled || !hasDrawing}
              className="flex-1 text-xs gap-1"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Valider
            </Button>
          </>
        )}
        {isSigned && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            disabled={disabled}
            className="flex-1 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            Réinitialiser
          </Button>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────

export default function SignaturesPage() {
  const supabase = createClient();
  const { toast } = useToast();

  const [sessions, setSessions] = useState<SessionFull[]>([]);
  const [allSignatures, setAllSignatures] = useState<SignatureFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [signaturesLoading, setSignaturesLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionFull | null>(null);
  const [signatureMap, setSignatureMap] = useState<SignatureMap>({});
  const [saving, setSaving] = useState<string | null>(null);

  // ── Fetch active sessions (upcoming + in_progress) ──
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sessions")
      .select(
        `
        *,
        trainer:trainers(id, first_name, last_name),
        enrollments(
          id, learner_id, status,
          learner:learners(id, first_name, last_name, email)
        )
      `
      )
      .in("status", ["upcoming", "in_progress"])
      .order("start_date", { ascending: true });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les sessions.", variant: "destructive" });
    } else {
      setSessions((data as SessionFull[]) || []);
    }
    setLoading(false);
  }, []);

  // ── Fetch all signatures (collected tab) ──
  const fetchSignatures = useCallback(async () => {
    setSignaturesLoading(true);
    const { data, error } = await supabase
      .from("signatures")
      .select(
        `
        *,
        session:sessions(id, title, duration_hours)
      `
      )
      .order("signed_at", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les signatures.", variant: "destructive" });
    } else {
      // Enrich with signer names from learners/trainers
      const sigs = (data || []) as SignatureFull[];
      const learnerIds = sigs.filter((s) => s.signer_type === "learner" && s.signer_id).map((s) => s.signer_id!);
      const trainerIds = sigs.filter((s) => s.signer_type === "trainer" && s.signer_id).map((s) => s.signer_id!);

      const [{ data: learnersData }, { data: trainersData }] = await Promise.all([
        learnerIds.length > 0
          ? supabase.from("learners").select("id, first_name, last_name").in("id", learnerIds)
          : { data: [] },
        trainerIds.length > 0
          ? supabase.from("trainers").select("id, first_name, last_name").in("id", trainerIds)
          : { data: [] },
      ]);

      type PartialLearner = { id: string; first_name: string; last_name: string };
      type PartialTrainer = { id: string; first_name: string; last_name: string };
      const learnerMap = new Map((learnersData || []).map((l: PartialLearner) => [l.id, l]));
      const trainerMap = new Map((trainersData || []).map((t: PartialTrainer) => [t.id, t]));

      const enriched = sigs.map((s) => {
        if (s.signer_type === "learner" && s.signer_id) {
          const l = learnerMap.get(s.signer_id);
          return { ...s, learner_name: l ? `${l.first_name} ${l.last_name}` : "Apprenant inconnu" };
        } else if (s.signer_type === "trainer" && s.signer_id) {
          const t = trainerMap.get(s.signer_id);
          return { ...s, trainer_name: t ? `${t.first_name} ${t.last_name}` : "Formateur inconnu" };
        }
        return s;
      });

      setAllSignatures(enriched);
    }
    setSignaturesLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchSignatures();
  }, [fetchSessions, fetchSignatures]);

  // ── Open manage dialog ──
  const openDialog = async (session: SessionFull) => {
    setSelectedSession(session);
    setDialogOpen(true);

    // Load existing signatures for this session
    const { data } = await supabase
      .from("signatures")
      .select("signer_id, signer_type")
      .eq("session_id", session.id);

    const map: SignatureMap = {};
    (data || []).forEach((sig: { signer_id: string | null; signer_type: string }) => {
      if (sig.signer_id) map[sig.signer_id] = true;
    });
    setSignatureMap(map);
  };

  // ── Create signature record ──
  const createSignature = async (signerId: string, signerType: "learner" | "trainer", svgData: string) => {
    if (!selectedSession) return;
    setSaving(signerId);

    // Check if already exists
    const { data: existing } = await supabase
      .from("signatures")
      .select("id")
      .eq("session_id", selectedSession.id)
      .eq("signer_id", signerId)
      .eq("signer_type", signerType)
      .maybeSingle();

    if (existing) {
      setSignatureMap((prev) => ({ ...prev, [signerId]: true }));
      setSaving(null);
      return;
    }

    const { error } = await supabase.from("signatures").insert({
      session_id: selectedSession.id,
      signer_id: signerId,
      signer_type: signerType,
      signature_data: svgData,
      signed_at: new Date().toISOString(),
    });

    if (error) {
      toast({ title: "Erreur", description: "Impossible d'enregistrer la signature.", variant: "destructive" });
    } else {
      setSignatureMap((prev) => ({ ...prev, [signerId]: true }));
      toast({
        title: "Signature enregistrée",
        description: `La signature a été capturée avec succès.`,
      });
      await fetchSignatures();
    }
    setSaving(null);
  };

  // ── Remove a signature ──
  const removeSignature = async (signerId: string, signerType: "learner" | "trainer") => {
    if (!selectedSession) return;
    setSaving(signerId);

    const { error } = await supabase
      .from("signatures")
      .delete()
      .eq("session_id", selectedSession.id)
      .eq("signer_id", signerId)
      .eq("signer_type", signerType);

    if (error) {
      toast({ title: "Erreur", description: "Impossible de supprimer la signature.", variant: "destructive" });
    } else {
      setSignatureMap((prev) => {
        const next = { ...prev };
        delete next[signerId];
        return next;
      });
      await fetchSignatures();
    }
    setSaving(null);
  };

  // ── Statistics ──
  const totalSessions = sessions.length;
  const totalSignaturesCount = allSignatures.length;

  // Compute session completeness
  const sessionCompleteness = sessions.map((session) => {
    const sessionSigs = allSignatures.filter((s) => s.session?.id === session.id);
    const learnerIds = session.enrollments
      .filter((e) => e.status !== "cancelled" && e.learner?.id)
      .map((e) => e.learner!.id);
    const signedLearners = sessionSigs.filter((s) => s.signer_type === "learner").length;
    const trainerSigned = session.trainer_id
      ? sessionSigs.some((s) => s.signer_type === "trainer")
      : true;
    const total = learnerIds.length + (session.trainer_id ? 1 : 0);
    const signed = signedLearners + (trainerSigned ? 1 : 0);
    return { session, total, signed, complete: total > 0 && signed >= total };
  });

  const completeSessions = sessionCompleteness.filter((s) => s.complete).length;
  const incompleteSessions = sessionCompleteness.filter((s) => !s.complete).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Feuilles d&apos;émargement</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestion des signatures électroniques pour les sessions de formation
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { fetchSessions(); fetchSignatures(); }}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileSignature className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalSignaturesCount}</p>
                <p className="text-xs text-gray-500">Signatures collectées</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{completeSessions}</p>
                <p className="text-xs text-gray-500">Sessions complètes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{incompleteSessions}</p>
                <p className="text-xs text-gray-500">Signatures manquantes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="sheets">
        <TabsList className="mb-4">
          <TabsTrigger value="sheets" className="gap-2">
            <FileSignature className="h-4 w-4" />
            Feuilles d&apos;émargement
            {totalSessions > 0 && (
              <Badge className="ml-1 bg-blue-100 text-blue-700 text-xs">{totalSessions}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="collected" className="gap-2">
            <UserCheck className="h-4 w-4" />
            Signatures collectées
            {totalSignaturesCount > 0 && (
              <Badge className="ml-1 bg-green-100 text-green-700 text-xs">{totalSignaturesCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Sessions needing signatures ── */}
        <TabsContent value="sheets" className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-gray-100 animate-pulse" />
            ))
          ) : sessions.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <CalendarDays className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                <p className="font-medium text-gray-600">Aucune session active</p>
                <p className="text-sm text-gray-400 mt-1">
                  Les sessions à venir et en cours apparaîtront ici.
                </p>
              </CardContent>
            </Card>
          ) : (
            sessions.map((session) => {
              const completenessData = sessionCompleteness.find((s) => s.session.id === session.id);
              const activeEnrollments = session.enrollments.filter(
                (e) => e.status !== "cancelled"
              );
              const sessionSigs = allSignatures.filter((s) => s.session?.id === session.id);
              const signedCount = sessionSigs.filter((s) => s.signer_type === "learner").length;
              const trainerSigned = session.trainer_id
                ? sessionSigs.some((s) => s.signer_type === "trainer")
                : null;

              return (
                <Card
                  key={session.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => openDialog(session)}
                >
                  <CardContent className="py-4 px-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div
                          className={cn(
                            "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                            session.status === "in_progress"
                              ? "bg-yellow-100"
                              : "bg-blue-100"
                          )}
                        >
                          <FileSignature
                            className={cn(
                              "h-5 w-5",
                              session.status === "in_progress" ? "text-yellow-600" : "text-blue-600"
                            )}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900 truncate">{session.title}</p>
                            <Badge
                              className={cn(
                                "text-xs font-normal",
                                STATUS_COLORS[session.status] || "bg-gray-100 text-gray-600"
                              )}
                            >
                              {SESSION_STATUS_LABELS[session.status] || session.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                            <span className="flex items-center gap-1">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {formatDate(session.start_date)} — {formatDate(session.end_date)}
                            </span>
                            {session.trainer && (
                              <span className="flex items-center gap-1">
                                <Shield className="h-3.5 w-3.5" />
                                {session.trainer.first_name} {session.trainer.last_name}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              {activeEnrollments.length} participant
                              {activeEnrollments.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        {/* Signature progress */}
                        <div className="text-right hidden sm:block">
                          <p className="text-xs font-medium text-gray-700">
                            Apprenants signés
                          </p>
                          <p
                            className={cn(
                              "text-sm font-bold",
                              signedCount === activeEnrollments.length && activeEnrollments.length > 0
                                ? "text-green-600"
                                : "text-orange-500"
                            )}
                          >
                            {signedCount} / {activeEnrollments.length}
                          </p>
                          {session.trainer_id && (
                            <p
                              className={cn(
                                "text-xs",
                                trainerSigned ? "text-green-600" : "text-gray-400"
                              )}
                            >
                              Formateur{trainerSigned ? " ✓" : " —"}
                            </p>
                          )}
                        </div>
                        {completenessData?.complete && (
                          <Badge className="bg-green-100 text-green-700 text-xs gap-1 hidden sm:flex">
                            <CheckCircle2 className="h-3 w-3" />
                            Complet
                          </Badge>
                        )}
                        <Button size="sm" className="gap-1.5 text-xs" onClick={(e) => { e.stopPropagation(); openDialog(session); }}>
                          <PenLine className="h-3.5 w-3.5" />
                          Gérer
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ── TAB 2: Collected signatures ── */}
        <TabsContent value="collected">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Signatures collectées</CardTitle>
              <CardDescription>
                Toutes les signatures enregistrées, toutes sessions confondues
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {signaturesLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : allSignatures.length === 0 ? (
                <div className="py-16 text-center">
                  <FileSignature className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                  <p className="font-medium text-gray-600">Aucune signature collectée</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Les signatures apparaîtront ici une fois enregistrées.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">Signataire</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Session</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Date de signature</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Heures validées</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Aperçu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {allSignatures.map((sig) => {
                        const displayName =
                          sig.signer_type === "learner"
                            ? sig.learner_name || "Apprenant"
                            : sig.trainer_name || "Formateur";
                        const initials = displayName
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2);

                        return (
                          <tr key={sig.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback
                                    className={cn(
                                      "text-xs font-semibold",
                                      sig.signer_type === "trainer"
                                        ? "bg-purple-100 text-purple-700"
                                        : "bg-blue-100 text-blue-700"
                                    )}
                                  >
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium text-gray-800">{displayName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                className={cn(
                                  "text-xs font-normal",
                                  sig.signer_type === "trainer"
                                    ? "bg-purple-100 text-purple-700"
                                    : "bg-blue-100 text-blue-700"
                                )}
                              >
                                {sig.signer_type === "trainer" ? "Formateur" : "Apprenant"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-gray-700 text-xs truncate max-w-[180px]">
                                {sig.session?.title || "—"}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-gray-600 text-xs">{formatDateTime(sig.signed_at)}</p>
                            </td>
                            <td className="px-4 py-3">
                              {sig.session?.duration_hours ? (
                                <Badge className="bg-green-100 text-green-700 text-xs gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {sig.session.duration_hours}h
                                </Badge>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="h-8 w-24 rounded border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                                {sig.signature_data && sig.signature_data.startsWith("<svg") ? (
                                  <div className="w-20 h-6" dangerouslySetInnerHTML={{ __html: sig.signature_data }} />
                                ) : (
                                  <svg viewBox="0 0 96 32" className="w-20 h-6">
                                    <path
                                      d={`M 8 24 Q 20 ${8 + (sig.id.charCodeAt(0) % 10)} 32 20 Q 44 ${28 - (sig.id.charCodeAt(1) % 8)} 56 16 Q 68 ${10 + (sig.id.charCodeAt(2) % 8)} 80 22 Q 88 28 96 18`}
                                      stroke="#1d4ed8"
                                      strokeWidth="1.5"
                                      fill="none"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-5 py-3 border-t bg-gray-50 text-xs text-gray-500">
                    {allSignatures.length} signature{allSignatures.length !== 1 ? "s" : ""} au total
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Manage Signatures Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-blue-600" />
              Feuille d&apos;émargement
            </DialogTitle>
            {selectedSession && (
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="font-medium text-gray-700">{selectedSession.title}</span>
                {" — "}
                {formatDate(selectedSession.start_date)} au {formatDate(selectedSession.end_date)}
              </p>
            )}
          </DialogHeader>

          {selectedSession && (
            <ScrollArea className="flex-1 overflow-auto pr-1">
              <div className="space-y-5 pb-2">
                {/* Trainer signature section */}
                {selectedSession.trainer && (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <Shield className="h-4 w-4 text-purple-600" />
                        Signature du formateur
                      </h3>
                      <div className="rounded-lg border p-4 bg-purple-50/40">
                        <div className="flex items-center gap-3 mb-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="bg-purple-100 text-purple-700 text-sm font-semibold">
                              {getInitials(
                                selectedSession.trainer.first_name,
                                selectedSession.trainer.last_name
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {selectedSession.trainer.first_name}{" "}
                              {selectedSession.trainer.last_name}
                            </p>
                            <p className="text-xs text-gray-500">Formateur responsable</p>
                          </div>
                          {signatureMap[selectedSession.trainer.id] && (
                            <Badge className="ml-auto bg-green-100 text-green-700 text-xs gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Signé
                            </Badge>
                          )}
                        </div>
                        <SignaturePad
                          label={
                            signatureMap[selectedSession.trainer.id]
                              ? "Signature enregistrée"
                              : "Dessinez votre signature dans le cadre"
                          }
                          isSigned={!!signatureMap[selectedSession.trainer.id]}
                          disabled={saving === selectedSession.trainer.id}
                          onSign={(svgData) =>
                            createSignature(selectedSession.trainer!.id, "trainer", svgData)
                          }
                          onClear={() =>
                            removeSignature(selectedSession.trainer!.id, "trainer")
                          }
                        />
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* Learners signatures */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-600" />
                    Signatures des apprenants
                    <span className="text-xs font-normal text-gray-500">
                      ({selectedSession.enrollments.filter((e) => e.status !== "cancelled" && e.learner).length} participant
                      {selectedSession.enrollments.filter((e) => e.status !== "cancelled" && e.learner).length !== 1 ? "s" : ""})
                    </span>
                  </h3>

                  {selectedSession.enrollments.filter((e) => e.status !== "cancelled" && e.learner).length === 0 ? (
                    <div className="rounded-lg border-2 border-dashed p-8 text-center text-gray-400">
                      <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">Aucun apprenant inscrit à cette session</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedSession.enrollments
                        .filter((e) => e.status !== "cancelled" && e.learner)
                        .map((enrollment) => {
                          const learner = enrollment.learner!;
                          const isSigned = !!signatureMap[learner.id];

                          return (
                            <div
                              key={enrollment.id}
                              className={cn(
                                "rounded-lg border p-4 transition-colors",
                                isSigned ? "bg-green-50/50 border-green-200" : "bg-white"
                              )}
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <Avatar className="h-9 w-9">
                                  <AvatarFallback className="bg-blue-100 text-blue-700 text-sm font-semibold">
                                    {getInitials(learner.first_name, learner.last_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-gray-900 text-sm">
                                    {learner.first_name} {learner.last_name}
                                  </p>
                                  {learner.email && (
                                    <p className="text-xs text-gray-400">{learner.email}</p>
                                  )}
                                </div>
                                {isSigned && (
                                  <Badge className="ml-auto bg-green-100 text-green-700 text-xs gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Signé
                                  </Badge>
                                )}
                                {!isSigned && (
                                  <Badge className="ml-auto bg-orange-100 text-orange-700 text-xs gap-1">
                                    <Clock className="h-3 w-3" />
                                    En attente
                                  </Badge>
                                )}
                              </div>
                              <SignaturePad
                                label={
                                  isSigned
                                    ? "Signature enregistrée"
                                    : "Dessinez votre signature dans le cadre"
                                }
                                isSigned={isSigned}
                                disabled={saving === learner.id}
                                onSign={(svgData) => createSignature(learner.id, "learner", svgData)}
                                onClear={() => removeSignature(learner.id, "learner")}
                              />
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Summary bar */}
                <div className="rounded-lg border bg-gray-50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 font-medium">Avancement</span>
                    <span className="font-semibold text-gray-800">
                      {Object.keys(signatureMap).length} /{" "}
                      {selectedSession.enrollments.filter((e) => e.status !== "cancelled" && e.learner).length +
                        (selectedSession.trainer ? 1 : 0)}{" "}
                      signatures
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{
                        width: `${
                          selectedSession.enrollments.filter((e) => e.status !== "cancelled" && e.learner).length +
                            (selectedSession.trainer ? 1 : 0) >
                          0
                            ? Math.round(
                                (Object.keys(signatureMap).length /
                                  (selectedSession.enrollments.filter(
                                    (e) => e.status !== "cancelled" && e.learner
                                  ).length +
                                    (selectedSession.trainer ? 1 : 0))) *
                                  100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="flex-shrink-0 pt-3 border-t mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
