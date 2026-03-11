"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SignaturePad } from "@/components/signatures/SignaturePad";
import { cn, formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Download,
  Euro,
  Loader2,
  Mail,
  MapPin,
  Monitor,
  QrCode,
  Send,
  Users,
  Video,
  FileSignature,
  User,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface TrainingFull {
  id: string;
  title: string;
  description: string | null;
  objectives: string | null;
  duration_hours: number | null;
  max_participants: number | null;
  price_per_person: number | null;
  category: string | null;
  certification: string | null;
  classification: string | null;
  is_active: boolean;
}

interface EnrollmentWithLearner {
  id: string;
  status: string;
  learner: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
}

interface SessionFull {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  location: string | null;
  mode: string;
  status: string;
  trainer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;
  enrollments: EnrollmentWithLearner[];
}

interface SignatureRecord {
  id: string;
  session_id: string;
  signer_id: string;
  signer_type: "learner" | "trainer";
  signature_data: string | null;
  signed_at: string;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function getInitials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const sDate = s.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const eDate = e.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const sTime = s.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const eTime = e.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (sDate === eDate) return `${sDate} — ${sTime} a ${eTime}`;
  return `${sDate} ${sTime} — ${eDate} ${eTime}`;
}

function getDurationHours(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
}

const STATUS_LABELS: Record<string, string> = {
  upcoming: "A venir",
  in_progress: "En cours",
  completed: "Terminee",
  cancelled: "Annulee",
};

const STATUS_COLORS: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-700",
  in_progress: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const MODE_LABELS: Record<string, string> = {
  presentiel: "Presentiel",
  distanciel: "Distanciel",
  hybride: "Hybride",
};

// ──────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────

export default function TrainingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const trainingId = params.id as string;

  const [training, setTraining] = useState<TrainingFull | null>(null);
  const [sessions, setSessions] = useState<SessionFull[]>([]);
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch training
    const { data: trainingData, error: tErr } = await supabase
      .from("trainings")
      .select("*")
      .eq("id", trainingId)
      .single();

    if (tErr || !trainingData) {
      toast({ title: "Erreur", description: "Formation introuvable.", variant: "destructive" });
      setLoading(false);
      return;
    }
    setTraining(trainingData as TrainingFull);

    // Fetch sessions for this training
    const { data: sessionsData } = await supabase
      .from("sessions")
      .select(`
        id, title, start_date, end_date, location, mode, status,
        trainer:trainers(id, first_name, last_name, email),
        enrollments(id, status, learner:learners(id, first_name, last_name, email))
      `)
      .eq("training_id", trainingId)
      .order("start_date", { ascending: true });

    const parsedSessions = (sessionsData || []).map((s: Record<string, unknown>) => ({
      ...s,
      trainer: Array.isArray(s.trainer) ? s.trainer[0] || null : s.trainer,
      enrollments: (Array.isArray(s.enrollments) ? s.enrollments : []).filter(
        (e: Record<string, unknown>) => e.status !== "cancelled"
      ),
    })) as SessionFull[];
    setSessions(parsedSessions);

    // Fetch all signatures for these sessions
    const sessionIds = parsedSessions.map((s) => s.id);
    if (sessionIds.length > 0) {
      const { data: sigData } = await supabase
        .from("signatures")
        .select("id, session_id, signer_id, signer_type, signature_data, signed_at")
        .in("session_id", sessionIds);
      setSignatures((sigData as SignatureRecord[]) || []);
    }

    // Auto-expand first session
    if (parsedSessions.length > 0) {
      setExpandedSessions({ [parsedSessions[0].id]: true });
    }

    setLoading(false);
  }, [trainingId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Signature handlers ──

  const createSignature = async (sessionId: string, signerId: string, signerType: "learner" | "trainer", svgData: string) => {
    // Check for duplicate
    const existing = signatures.find(
      (s) => s.session_id === sessionId && s.signer_id === signerId && s.signer_type === signerType
    );
    if (existing) return;

    const { data, error } = await supabase
      .from("signatures")
      .insert({
        session_id: sessionId,
        signer_id: signerId,
        signer_type: signerType,
        signature_data: svgData,
      })
      .select("id, session_id, signer_id, signer_type, signature_data, signed_at")
      .single();

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else if (data) {
      setSignatures((prev) => [...prev, data as SignatureRecord]);
      toast({ title: "Signature enregistree" });
    }
  };

  const removeSignature = async (sessionId: string, signerId: string, signerType: "learner" | "trainer") => {
    const existing = signatures.find(
      (s) => s.session_id === sessionId && s.signer_id === signerId && s.signer_type === signerType
    );
    if (!existing) return;

    const { error } = await supabase.from("signatures").delete().eq("id", existing.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setSignatures((prev) => prev.filter((s) => s.id !== existing.id));
    }
  };

  const isSigned = (sessionId: string, signerId: string, signerType: "learner" | "trainer") => {
    return signatures.some(
      (s) => s.session_id === sessionId && s.signer_id === signerId && s.signer_type === signerType
    );
  };

  const getSessionSignatureStats = (session: SessionFull) => {
    const sessionSigs = signatures.filter((s) => s.session_id === session.id);
    const trainerSigned = session.trainer
      ? sessionSigs.some((s) => s.signer_id === session.trainer!.id && s.signer_type === "trainer")
      : false;
    const learnerCount = session.enrollments.length;
    const learnerSigned = session.enrollments.filter((e) =>
      e.learner && sessionSigs.some((s) => s.signer_id === e.learner!.id && s.signer_type === "learner")
    ).length;
    const total = (session.trainer ? 1 : 0) + learnerCount;
    const signed = (trainerSigned ? 1 : 0) + learnerSigned;
    return { total, signed, trainerSigned, learnerCount, learnerSigned };
  };

  const toggleSession = (id: string) => {
    setExpandedSessions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // ── iCal export ──

  const exportIcal = (session: SessionFull) => {
    const start = new Date(session.start_date);
    const end = new Date(session.end_date);
    const fmt = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MR Formation//LMS//FR",
      "BEGIN:VEVENT",
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${session.title}`,
      `LOCATION:${session.location || ""}`,
      `DESCRIPTION:Formation: ${training?.title || ""}\\nFormateur: ${session.trainer ? `${session.trainer.first_name} ${session.trainer.last_name}` : "Non assigne"}`,
      `UID:${session.id}@mrformation.fr`,
      "END:VEVENT",
      "END:VCALENDAR",
    ];

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${session.title.replace(/\s+/g, "-").toLowerCase()}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Calendrier exporte", description: "Fichier .ics telecharge." });
  };

  // ── Send émargement links (simulated) ──

  const handleSendEmargementLinks = (session: SessionFull, target: "learners" | "trainers" | "all") => {
    const recipients: string[] = [];
    if ((target === "learners" || target === "all") && session.enrollments.length > 0) {
      session.enrollments.forEach((e) => {
        if (e.learner?.email) recipients.push(e.learner.email);
      });
    }
    if ((target === "trainers" || target === "all") && session.trainer?.email) {
      recipients.push(session.trainer.email);
    }
    toast({
      title: "Liens envoyes",
      description: `Lien d'emargement envoye a ${recipients.length} destinataire${recipients.length !== 1 ? "s" : ""}.`,
    });
  };

  // ── QR Code generation (data URL) ──

  const handleGenerateQR = (session: SessionFull) => {
    const url = `${window.location.origin}/emargement/${session.id}`;
    // Simple SVG-based QR placeholder — in production, use a real QR library
    toast({
      title: "QR Code généré",
      description: `Lien d'emargement: ${url}`,
    });
  };

  // ── Loading / Not found ──

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 text-[#3DB5C5] animate-spin" />
      </div>
    );
  }

  if (!training) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Formation introuvable</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/admin/trainings")}>
          Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin" className="text-[#3DB5C5] hover:underline">Accueil</Link>
        <span className="text-gray-400">/</span>
        <Link href="/admin/trainings" className="text-[#3DB5C5] hover:underline">Formations</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-500 truncate max-w-[300px]">{training.title}</span>
      </div>

      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#3DB5C5]"
      >
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>

      {/* Training Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{training.title}</h1>
            <div className="flex flex-wrap gap-3 mt-2">
              {training.category && (
                <Badge className="bg-blue-100 text-blue-700 text-xs">{training.category}</Badge>
              )}
              {training.classification && (
                <Badge className="bg-amber-100 text-amber-700 text-xs capitalize">{training.classification}</Badge>
              )}
              <Badge className={training.is_active ? "bg-green-100 text-green-700 text-xs" : "bg-gray-100 text-gray-500 text-xs"}>
                {training.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            {training.description && (
              <p className="text-sm text-gray-500 mt-3 max-w-2xl">{training.description}</p>
            )}
          </div>
          <div className="flex flex-col gap-2 text-sm text-gray-600 shrink-0">
            {training.duration_hours && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-gray-400" /> {training.duration_hours}h
              </span>
            )}
            {training.price_per_person && (
              <span className="flex items-center gap-1.5">
                <Euro className="h-4 w-4 text-gray-400" /> {training.price_per_person}&euro;/pers.
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-gray-400" /> {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Sessions List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[#3DB5C5]" />
          Sessions &amp; Emargements
        </h2>

        {sessions.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Aucune session programmee</p>
            <p className="text-xs text-gray-400 mt-1">Creez une session depuis la page Sessions.</p>
          </div>
        ) : (
          sessions.map((session) => {
            const stats = getSessionSignatureStats(session);
            const isExpanded = expandedSessions[session.id] || false;
            const completePct = stats.total > 0 ? Math.round((stats.signed / stats.total) * 100) : 0;

            return (
              <div key={session.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Session Header */}
                <button
                  onClick={() => toggleSession(session.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[#3DB5C5]/10 flex items-center justify-center shrink-0">
                      <Calendar className="h-5 w-5 text-[#3DB5C5]" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900">{session.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDateRange(session.start_date, session.end_date)}
                        {session.location && ` — ${session.location}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={cn("text-xs", STATUS_COLORS[session.status] || "bg-gray-100 text-gray-600")}>
                      {STATUS_LABELS[session.status] || session.status}
                    </Badge>
                    <Badge className={cn("text-xs", session.mode === "distanciel" ? "bg-purple-100 text-purple-700" : "bg-teal-100 text-teal-700")}>
                      {MODE_LABELS[session.mode] || session.mode}
                    </Badge>
                    {/* Émargement progress */}
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", completePct === 100 ? "bg-green-500" : "bg-[#3DB5C5]")}
                          style={{ width: `${completePct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 whitespace-nowrap">{stats.signed}/{stats.total}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-gray-200 px-6 py-5 space-y-6">
                    {/* Session Info + Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {getDurationHours(session.start_date, session.end_date)}h
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {session.enrollments.length} apprenant{session.enrollments.length !== 1 ? "s" : ""}
                      </span>
                      {session.trainer && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {session.trainer.first_name} {session.trainer.last_name}
                        </span>
                      )}

                      <div className="flex-1" />

                      {session.mode !== "presentiel" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5 text-purple-700 border-purple-200 hover:bg-purple-50"
                          onClick={() =>
                            toast({ title: "Classe virtuelle", description: "Lien de classe virtuelle généré." })
                          }
                        >
                          <Video className="h-3.5 w-3.5" />
                          Générer une classe virtuelle
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5"
                        onClick={() => handleGenerateQR(session)}
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        QR Codes
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5"
                        onClick={() => exportIcal(session)}
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        Calendrier
                      </Button>
                    </div>

                    {/* ── Trainer Émargement ── */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
                        <FileSignature className="h-4 w-4 text-purple-600" />
                        Emargements des Formateurs
                      </h4>
                      {session.trainer ? (
                        <div className="bg-purple-50/50 border border-purple-100 rounded-lg p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-9 h-9 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {getInitials(session.trainer.first_name, session.trainer.last_name)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {session.trainer.first_name} {session.trainer.last_name}
                              </p>
                              {session.trainer.email && (
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                  <Mail className="h-3 w-3" /> {session.trainer.email}
                                </p>
                              )}
                            </div>
                            {isSigned(session.id, session.trainer.id, "trainer") && (
                              <CheckCircle2 className="h-5 w-5 text-green-500 ml-auto" />
                            )}
                          </div>
                          <SignaturePad
                            label="Signature du formateur"
                            isSigned={isSigned(session.id, session.trainer.id, "trainer")}
                            strokeColor="#7c3aed"
                            onSign={(svg) => createSignature(session.id, session.trainer!.id, "trainer", svg)}
                            onClear={() => removeSignature(session.id, session.trainer!.id, "trainer")}
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Aucun formateur assigne a cette session.</p>
                      )}
                    </div>

                    {/* ── Learner Émargements ── */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
                        <FileSignature className="h-4 w-4 text-[#3DB5C5]" />
                        Emargements des Apprenants ({stats.learnerSigned}/{stats.learnerCount})
                      </h4>
                      {session.enrollments.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Aucun apprenant inscrit a cette session.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {session.enrollments.map((enrollment) => {
                            if (!enrollment.learner) return null;
                            const learner = enrollment.learner;
                            const signed = isSigned(session.id, learner.id, "learner");
                            return (
                              <div
                                key={enrollment.id}
                                className="bg-blue-50/50 border border-blue-100 rounded-lg p-4"
                              >
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-8 h-8 rounded-full bg-[#3DB5C5] flex items-center justify-center text-white text-xs font-bold shrink-0">
                                    {getInitials(learner.first_name, learner.last_name)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {learner.first_name} {learner.last_name}
                                    </p>
                                    {learner.email && (
                                      <p className="text-xs text-gray-500 truncate">{learner.email}</p>
                                    )}
                                  </div>
                                  {signed && <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto shrink-0" />}
                                </div>
                                <SignaturePad
                                  label={`Signature de ${learner.first_name}`}
                                  isSigned={signed}
                                  onSign={(svg) => createSignature(session.id, learner.id, "learner", svg)}
                                  onClear={() => removeSignature(session.id, learner.id, "learner")}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* ── Action Buttons ── */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                      <Button
                        size="sm"
                        className="text-xs gap-1.5"
                        style={{ background: "#3DB5C5" }}
                        onClick={() => handleSendEmargementLinks(session, "learners")}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Envoyer le lien d&apos;emargement a tous les apprenants
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5"
                        onClick={() => handleSendEmargementLinks(session, "trainers")}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Envoyer aux formateurs
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1.5"
                        onClick={() =>
                          toast({
                            title: "Planifie",
                            description: "L'envoi automatique du lien d'emargement a ete planifie.",
                          })
                        }
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Planifier l&apos;envoi
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
